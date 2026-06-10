import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select

from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal, DeliverySessionLocal, PharmacySessionLocal
from app.models.delivery import DeliveryAccount
from app.models.pharmacy_merchant import PharmacyAccount
from app.models.super_admin import SuperAdmin
from app.models.user import User
from app.services.realtime import manager

router = APIRouter(prefix="/ws", tags=["websocket"])


async def authenticate_pharmacy(token: str) -> PharmacyAccount | None:
    try:
        payload = decode_access_token(token)
        account_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, JWTError):
        return None

    async with PharmacySessionLocal() as session:
        result = await session.execute(select(PharmacyAccount).where(PharmacyAccount.account_id == account_id))
        return result.scalar_one_or_none()


async def authenticate_super_admin(token: str) -> SuperAdmin | None:
    try:
        payload = decode_access_token(token)
        admin_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, JWTError):
        return None

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SuperAdmin).where(SuperAdmin.admin_id == admin_id).where(SuperAdmin.is_active.is_(True))
        )
        return result.scalar_one_or_none()


async def authenticate_customer(token: str) -> User | None:
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, JWTError):
        return None

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.user_id == user_id).where(User.is_active.is_(True)))
        return result.scalar_one_or_none()


@router.websocket("/pharmacy")
async def pharmacy_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    account = await authenticate_pharmacy(token or "")
    if account is None:
        await websocket.close(code=1008)
        return

    await manager.connect_pharmacy(account.account_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_pharmacy(account.account_id, websocket)


@router.websocket("/super-admin")
async def super_admin_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    admin = await authenticate_super_admin(token or "")
    if admin is None:
        await websocket.close(code=1008)
        return

    await manager.connect_super_admin(admin.admin_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_super_admin(admin.admin_id, websocket)


@router.websocket("/customer")
async def customer_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    user = await authenticate_customer(token or "")
    if user is None:
        await websocket.close(code=1008)
        return

    await manager.connect_customer(user.user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_customer(user.user_id, websocket)


async def authenticate_delivery(token: str) -> DeliveryAccount | None:
    try:
        from app.core.config import get_settings
        from jose import jwt
        settings = get_settings()
        payload = jwt.decode(token, settings.app_secret_key, algorithms=["HS256"])
        if payload.get("type") != "delivery":
            return None
        account_id = uuid.UUID(payload["sub"])
    except Exception:
        return None

    async with DeliverySessionLocal() as session:
        result = await session.execute(
            select(DeliveryAccount).where(
                DeliveryAccount.account_id == account_id,
                DeliveryAccount.account_status == "active",
            )
        )
        return result.scalar_one_or_none()


@router.websocket("/delivery")
async def delivery_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    account = await authenticate_delivery(token or "")
    if account is None:
        await websocket.close(code=1008)
        return

    await manager.connect_delivery(account.account_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_delivery(account.account_id, websocket)
