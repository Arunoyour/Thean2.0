"""
In-app notification service.

Writes to the `notifications` table (persistent, survives reconnects) and
simultaneously pushes via WebSocket (instant delivery when the recipient is online).

Rules from the design:
  - REQUEST_PENDING / REJECTED / NEEDS_CORRECTION → SUPER + all CHECKERs + SUPERVISORS
  - REQUEST_APPROVED / EXECUTED / PAYMENT_RELEASED → affected delivery boy or merchant
  - REQUEST_NEEDS_CORRECTION → also notify the affected stakeholder
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approvals import Notification
from app.models.super_admin import SuperAdmin
from app.services.realtime import manager

if TYPE_CHECKING:
    pass

# Roles that receive approval queue notifications
APPROVAL_QUEUE_ROLES = ("SUPER", "SUPERVISOR", "CHECKER")


async def _persist_notification(
    session: AsyncSession,
    *,
    recipient_id: uuid.UUID | None,
    recipient_role: str | None,
    notification_type: str,
    title: str,
    body: str,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> Notification:
    notif = Notification(
        recipient_id=recipient_id,
        recipient_role=recipient_role,
        notification_type=notification_type,
        title=title,
        body=body,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    session.add(notif)
    await session.flush()
    return notif


def _ws_payload(notif: Notification) -> dict:
    return {
        "type": "notification",
        "notification_id": str(notif.notification_id),
        "notification_type": notif.notification_type,
        "title": notif.title,
        "body": notif.body,
        "reference_type": notif.reference_type,
        "reference_id": str(notif.reference_id) if notif.reference_id else None,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
        "is_read": False,
    }


async def notify_approval_queue(
    session: AsyncSession,
    *,
    notification_type: str,
    title: str,
    body: str,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> None:
    """
    Broadcast a notification to all SUPER, SUPERVISOR, and CHECKER admins.
    Writes one row per recipient to the notifications table, then pushes via WS.
    """
    result = await session.execute(
        select(SuperAdmin)
        .where(SuperAdmin.role.in_(APPROVAL_QUEUE_ROLES))
        .where(SuperAdmin.is_active.is_(True))
    )
    admins = result.scalars().all()

    for admin in admins:
        notif = await _persist_notification(
            session,
            recipient_id=admin.admin_id,
            recipient_role=None,
            notification_type=notification_type,
            title=title,
            body=body,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        await manager.send_super_admin_targeted(admin.admin_id, _ws_payload(notif))

    await session.commit()


async def notify_admin_targeted(
    session: AsyncSession,
    admin_id: uuid.UUID,
    *,
    notification_type: str,
    title: str,
    body: str,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> None:
    """Send a notification to one specific admin."""
    notif = await _persist_notification(
        session,
        recipient_id=admin_id,
        recipient_role=None,
        notification_type=notification_type,
        title=title,
        body=body,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    await manager.send_super_admin_targeted(admin_id, _ws_payload(notif))
    await session.commit()


async def notify_delivery_boy(
    session: AsyncSession,
    account_id: uuid.UUID,
    *,
    notification_type: str,
    title: str,
    body: str,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> None:
    """
    Push a notification to a delivery boy's app via WebSocket.
    Also persisted in notifications table for history.
    """
    notif = await _persist_notification(
        session,
        recipient_id=None,
        recipient_role=None,  # delivery boy, not an admin
        notification_type=notification_type,
        title=title,
        body=body,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    await manager.send_delivery(account_id, _ws_payload(notif))
    await session.commit()
