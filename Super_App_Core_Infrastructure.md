# Super App Core Infrastructure

This document captures the initial local infrastructure blueprint for a unified marketplace core with isolated sector data for pharmacy, vegetables, and print shop workflows.

```text
┌──────────────────────────────┐
│      Unified Core Engine     │
│  (User Auth, Wallet, Maps)   │
└──────────────┬───────────────┘
               │
┌──────────────┼───────────────┐
▼              ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Pharmacy DB     │  │ Vegetables DB   │  │ Print Shop DB   │
│ (Prescriptions) │  │ (Fresh Produce) │  │ (PDF Files)     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## 1. Database Schema

Run this PostgreSQL DDL in a local database. It creates shared customer entities and separate sector tables.

```sql
-- Enable UUID extension for secure, non-sequential primary keys.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Unified Core Platform Schema
-- ==========================================

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    full_name VARCHAR(100),
    wallet_balance NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_addresses (
    address_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address_line_1 TEXT NOT NULL,
    apartment_floor_gate VARCHAR(100),
    landmark TEXT,
    is_default BOOLEAN DEFAULT false
);

-- ==========================================
-- Isolated Sector Schemas
-- ==========================================

-- Pharmacy sector tables.
CREATE TABLE pharmacy_stores (
    store_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_name VARCHAR(150) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_online BOOLEAN DEFAULT false
);

CREATE TABLE pharmacy_orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id),
    store_id UUID REFERENCES pharmacy_stores(store_id),
    status VARCHAR(30) DEFAULT 'NEW',
    estimated_amount NUMERIC(10, 2),
    final_amount NUMERIC(10, 2),
    has_generic_substitution_permission BOOLEAN DEFAULT true,
    requires_manual_review BOOLEAN DEFAULT false,
    prescription_path VARCHAR(500),
    voice_note_path VARCHAR(500),
    handover_pin VARCHAR(6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vegetable sector tables.
CREATE TABLE vegetable_stores (
    store_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_online BOOLEAN DEFAULT false
);

-- Print and photostat sector tables.
CREATE TABLE print_shops (
    shop_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_online BOOLEAN DEFAULT false
);
```

## 2. FastAPI Backend Core

This starter implements mock OTP authentication, local media storage, wallet payload models, and an in-memory WebSocket connection manager for active stores.

```python
import os
import uuid
from typing import Dict

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Super App Ecosystem Core Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = "./storage"
PRESCRIPTION_DIR = f"{STORAGE_DIR}/prescriptions"
VOICE_DIR = f"{STORAGE_DIR}/voice_notes"

os.makedirs(PRESCRIPTION_DIR, exist_ok=True)
os.makedirs(VOICE_DIR, exist_ok=True)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, store_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[store_id] = websocket
        print(f"Store connected: {store_id} over WebSocket")

    def disconnect(self, store_id: str):
        if store_id in self.active_connections:
            del self.active_connections[store_id]
            print(f"Store disconnected: {store_id}")

    async def send_order_alert(self, store_id: str, message: dict):
        if store_id in self.active_connections:
            await self.active_connections[store_id].send_json(message)
            return True
        return False


manager = ConnectionManager()


class AuthRequest(BaseModel):
    phone_number: str


class OTPVerifyRequest(BaseModel):
    phone_number: str
    otp: str


class WalletUpdate(BaseModel):
    user_id: str
    amount: float


@app.post("/api/v1/auth/request-otp", status_code=status.HTTP_200_OK)
async def request_otp(payload: AuthRequest):
    print(f"[MOCK GATEWAY] OTP request sent to {payload.phone_number}. Mock token: 1234")
    return {"message": "Mock OTP sent successfully. Use code 1234 to verify."}


@app.post("/api/v1/auth/verify-otp")
async def verify_otp(payload: OTPVerifyRequest):
    if payload.otp != "1234":
        raise HTTPException(status_code=400, detail="Invalid OTP code entered.")

    mock_user_id = str(uuid.uuid4())
    return {
        "message": "Authentication successful",
        "access_token": f"mock_jwt_token_for_{payload.phone_number}",
        "user": {
            "id": mock_user_id,
            "phone_number": payload.phone_number,
            "wallet_balance": 0.00,
        },
    }


@app.post("/api/v1/media/upload-prescription")
async def upload_prescription_local(user_id: str, file_name: str, file_bytes: bytes):
    unique_filename = f"{user_id}_{uuid.uuid4()}_{file_name}"
    target_filepath = os.path.join(PRESCRIPTION_DIR, unique_filename)

    with open(target_filepath, "wb") as buffer:
        buffer.write(file_bytes)

    return {
        "status": "success",
        "file_path": target_filepath,
        "message": "File preserved safely in local ecosystem directory.",
    }


@app.websocket("/ws/v1/sectors/pharmacy/{store_id}")
async def pharmacy_websocket_endpoint(websocket: WebSocket, store_id: str):
    await manager.connect(store_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "PONG":
                continue
    except WebSocketDisconnect:
        manager.disconnect(store_id)
    except Exception as error:
        print(f"Error on socket connection instance: {error}")
        manager.disconnect(store_id)


@app.post("/api/v1/internal/trigger-order-alert")
async def trigger_order_alert(store_id: str, order_id: str):
    alert_payload = {
        "event": "NEW_ORDER_ARRIVED",
        "order_id": order_id,
        "countdown_seconds": 180,
    }
    delivered = await manager.send_order_alert(store_id, alert_payload)
    if not delivered:
        return {
            "status": "failed",
            "reason": "Merchant is offline. Execute waterfall routing immediately.",
        }
    return {
        "status": "success",
        "message": "High-priority websocket alert successfully transmitted.",
    }
```

## 3. React WebSocket Listener

Mount this component inside a merchant dashboard to keep a persistent connection to the FastAPI backend.

```jsx
import React, { useCallback, useEffect, useRef, useState } from "react";

const WebSocketListener = ({ storeId }) => {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("OFFLINE");
  const [activeOrderAlert, setActiveOrderAlert] = useState(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const connectWebSocket = useCallback(() => {
    const wsUrl = `ws://localhost:8000/ws/v1/sectors/pharmacy/${storeId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Connected to platform core WebSocket.");
      setConnectionStatus("ONLINE");
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "NEW_ORDER_ARRIVED") {
        setActiveOrderAlert(data);
      }
    };

    ws.onclose = () => {
      setConnectionStatus("DISCONNECTED. Retrying...");
      setSocket(null);

      const delay = Math.min(30, 2 ** reconnectAttemptsRef.current) * 1000;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    setSocket(ws);
  }, [storeId]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    const heartbeatInterval = window.setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send("PONG");
      }
    }, 15000);

    return () => window.clearInterval(heartbeatInterval);
  }, [socket]);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h3>
        Terminal Status:{" "}
        <span style={{ color: socket ? "green" : "orange" }}>
          {connectionStatus}
        </span>
      </h3>

      {activeOrderAlert && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffeabc",
            padding: "15px",
            borderRadius: "5px",
          }}
        >
          <h4>Urgent Job Order Received</h4>
          <p>Order ID: {activeOrderAlert.order_id}</p>
          <p>
            Action Window Remaining:{" "}
            <b>{activeOrderAlert.countdown_seconds}s</b>
          </p>
          <button
            onClick={() => setActiveOrderAlert(null)}
            style={{
              background: "red",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: "4px",
            }}
          >
            Reject
          </button>
          <button
            style={{
              background: "green",
              color: "white",
              border: "none",
              padding: "8px 12px",
              marginLeft: "10px",
              borderRadius: "4px",
            }}
          >
            Review Workstation
          </button>
        </div>
      )}
    </div>
  );
};

export default WebSocketListener;
```

## 4. Local Run Steps

1. Run the PostgreSQL DDL above in your local database.
2. Install Python dependencies:

```bash
pip install fastapi uvicorn pydantic
```

3. Start the FastAPI server:

```bash
uvicorn main:app --reload
```

4. Mount `WebSocketListener` in the merchant dashboard and trigger an alert through:

```http
POST http://localhost:8000/api/v1/internal/trigger-order-alert?store_id=<store-id>&order_id=<order-id>
```

## Implementation Notes

- The OTP flow is intentionally mocked for local development.
- The WebSocket manager is in-memory. It is suitable for a single local server process only.
- Prescription upload should be converted to `UploadFile` before production use.
- Authentication, authorization, store ownership checks, and wallet debit rules still need production-grade implementation.
