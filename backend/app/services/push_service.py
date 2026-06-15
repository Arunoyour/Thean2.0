"""Web Push notification service using VAPID (pywebpush)."""
from __future__ import annotations

import json
import logging
from uuid import UUID

from pywebpush import webpush, WebPushException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.pharmacy_merchant import PushSubscription

log = logging.getLogger(__name__)


def _send_push(endpoint: str, p256dh: str, auth: str, payload: dict) -> bool:
    """Send a single Web Push. Returns True on success, False on gone (410)."""
    settings = get_settings()
    if not settings.vapid_private_key:
        log.warning("[PUSH] VAPID keys not configured — skipping push.")
        return True
    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_mailto},
        )
        return True
    except WebPushException as e:
        if e.response is not None and e.response.status_code == 410:
            return False  # subscription expired — caller should delete it
        log.warning("[PUSH] failed to send to %s: %s", endpoint[:40], e)
        return True


async def save_subscription(
    session: AsyncSession,
    account_id: UUID,
    endpoint: str,
    p256dh: str,
    auth: str,
) -> None:
    """Upsert a push subscription for a pharmacy account."""
    existing = await session.execute(
        select(PushSubscription).where(
            PushSubscription.account_id == account_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.p256dh = p256dh
        row.auth = auth
    else:
        session.add(PushSubscription(
            account_id=account_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
        ))
    await session.commit()


async def delete_subscription(
    session: AsyncSession,
    account_id: UUID,
    endpoint: str,
) -> None:
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.account_id == account_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await session.commit()


async def push_to_account(
    session: AsyncSession,
    account_id: UUID,
    payload: dict,
) -> None:
    """Send a push to all registered devices for an account. Remove stale subs."""
    result = await session.execute(
        select(PushSubscription).where(PushSubscription.account_id == account_id)
    )
    subs = result.scalars().all()
    stale_ids = []
    for sub in subs:
        ok = _send_push(sub.endpoint, sub.p256dh, sub.auth, payload)
        if not ok:
            stale_ids.append(sub.subscription_id)
    if stale_ids:
        await session.execute(
            delete(PushSubscription).where(
                PushSubscription.subscription_id.in_(stale_ids)
            )
        )
        await session.commit()
