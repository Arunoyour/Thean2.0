from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pharmacy_merchant import PharmacyRealtimeNotification


class RealtimeConnectionManager:
    def __init__(self) -> None:
        self._pharmacy: dict[str, set[WebSocket]] = defaultdict(set)
        self._customer: dict[str, set[WebSocket]] = defaultdict(set)
        # Super-admin: tracked both by admin_id (targeted) and as a flat set (broadcast)
        self._super_admin: set[WebSocket] = set()
        self._super_admin_by_id: dict[str, set[WebSocket]] = defaultdict(set)
        self._delivery: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect_pharmacy(self, account_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._pharmacy[str(account_id)].add(websocket)

    async def connect_super_admin(self, admin_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._super_admin.add(websocket)
        self._super_admin_by_id[str(admin_id)].add(websocket)

    async def connect_customer(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._customer[str(user_id)].add(websocket)

    def disconnect_pharmacy(self, account_id: UUID, websocket: WebSocket) -> None:
        self._pharmacy[str(account_id)].discard(websocket)

    def disconnect_super_admin(self, admin_id: UUID, websocket: WebSocket) -> None:
        self._super_admin.discard(websocket)
        self._super_admin_by_id[str(admin_id)].discard(websocket)

    def disconnect_customer(self, user_id: UUID, websocket: WebSocket) -> None:
        self._customer[str(user_id)].discard(websocket)

    async def send_pharmacy(self, account_id: UUID, payload: dict[str, Any]) -> None:
        for websocket in list(self._pharmacy[str(account_id)]):
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                self.disconnect_pharmacy(account_id, websocket)

    async def send_super_admin(self, payload: dict[str, Any]) -> None:
        """Broadcast to ALL connected super-admin sessions."""
        for websocket in list(self._super_admin):
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                self._super_admin.discard(websocket)

    async def send_super_admin_targeted(self, admin_id: UUID, payload: dict[str, Any]) -> None:
        """Send to a specific admin's connected sessions only."""
        for websocket in list(self._super_admin_by_id[str(admin_id)]):
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                self._super_admin_by_id[str(admin_id)].discard(websocket)

    async def send_customer(self, user_id: UUID, payload: dict[str, Any]) -> None:
        for websocket in list(self._customer[str(user_id)]):
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                self.disconnect_customer(user_id, websocket)

    async def connect_delivery(self, account_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._delivery[str(account_id)].add(websocket)

    def disconnect_delivery(self, account_id: UUID, websocket: WebSocket) -> None:
        self._delivery[str(account_id)].discard(websocket)

    async def send_delivery(self, account_id: UUID, payload: dict[str, Any]) -> None:
        for websocket in list(self._delivery[str(account_id)]):
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                self.disconnect_delivery(account_id, websocket)


manager = RealtimeConnectionManager()


async def create_notification(
    session: AsyncSession,
    *,
    target_type: str,
    target_id,
    event_type: str,
    title: str,
    message: str,
    payload: dict[str, Any],
) -> PharmacyRealtimeNotification:
    notification = PharmacyRealtimeNotification(
        target_type=target_type,
        target_id=target_id,
        event_type=event_type,
        title=title,
        message=message,
        payload=payload,
    )
    session.add(notification)
    await session.flush()
    return notification


def serialize_notification(notification: PharmacyRealtimeNotification) -> dict[str, Any]:
    return {
        "notification_id": str(notification.notification_id),
        "event_type": notification.event_type,
        "title": notification.title,
        "message": notification.message,
        "payload": notification.payload,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }
