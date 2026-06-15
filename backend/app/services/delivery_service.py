"""Delivery Boy service — auth, orders, COD tracking, chat, earnings.

COD rules:
  ₹0   – ₹999   : normal operation
  ₹1000 – ₹1199 : warning; push reminder every 30 min while above threshold
  ₹1200+        : account blocked; logged out; must clear with admin
"""

import asyncio
import math
import random
import string
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select, and_, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

import json
import logging
import urllib.request

from app.core.config import get_settings
from app.core.security import generate_otp

from app.models.delivery import (
    DeliveryAccount,
    DeliveryCashoutRequest,
    DeliveryChatMessage,
    DeliveryCodCollection,
    DeliveryCodPayout,
    DeliveryDocument,
    DeliveryEarning,
    DeliveryOrder,
    DeliveryRateConfig,
    DeliveryRating,
    DeliverySurgeConfig,
    DeliveryTierRate,
    DeliveryWallet,
)
from app.schemas.delivery import (
    AutoAssignRequest,
    AutoAssignResult,
    DeliveryAccountResponse,
    DeliveryAssignRequest,
    DeliveryAuthResponse,
    DeliveryOrderResponse,
    DeliveryRatingRequest,
    DeliveryRatingResponse,
    DeliveryRegisterRequest,
    DeliveryTrackingResponse,
    DriverCandidateScore,
    EarningsSummaryResponse,
    CodSummaryResponse,
    RateConfigResponse,
    SetRateRequest,
    SetSurgeConfigRequest,
    SetTierRateRequest,
    SurgeConfigResponse,
    TierRateResponse,
    VALID_TIERS,
    UnassignedSourceOrder,
)

_log = logging.getLogger(__name__)

from app.services.realtime import manager

ACCEPT_DEADLINE_SECONDS = 90
DEFAULT_RATE_PER_KM = 7.0   # fallback if DB has no row yet
TOKEN_EXPIRE_DAYS = 30
COD_WARN_THRESHOLD = 1000.0    # ₹ — start warnings
COD_BLOCK_THRESHOLD = 1200.0   # ₹ — block account
COD_REMINDER_INTERVAL = 1800   # seconds = 30 minutes

# ── Background COD reminder task ───────────────────────────────────────────
# A single asyncio Task runs for the life of the process.  It checks all
# accounts whose cod_balance is in the warning band and fires WS reminders.

_reminder_task: asyncio.Task | None = None


async def _cod_reminder_loop() -> None:
    """Every 30 min push a WS reminder to every account in the warning band."""
    while True:
        await asyncio.sleep(COD_REMINDER_INTERVAL)
        try:
            from app.db.session import DeliverySessionLocal
            async with DeliverySessionLocal() as sess:
                result = await sess.execute(
                    select(DeliveryAccount).where(
                        DeliveryAccount.cod_balance >= COD_WARN_THRESHOLD,
                        DeliveryAccount.account_status == "active",
                    )
                )
                accounts = result.scalars().all()
                for acc in accounts:
                    bal = float(acc.cod_balance)
                    if bal >= COD_BLOCK_THRESHOLD:
                        # Already blocked — remind them to clear
                        await manager.send_delivery(
                            acc.account_id,
                            {
                                "type": "cod_blocked_reminder",
                                "cod_balance": bal,
                                "message": (
                                    f"Your account is blocked. You are holding ₹{bal:.0f} in cash. "
                                    "Please clear this with the organisation immediately."
                                ),
                            },
                        )
                    else:
                        await manager.send_delivery(
                            acc.account_id,
                            {
                                "type": "cod_warning",
                                "cod_balance": bal,
                                "message": (
                                    f"⚠️ You are holding ₹{bal:.0f} in cash. "
                                    "Please deposit this with the organisation before it reaches ₹1200."
                                ),
                            },
                        )
        except Exception:
            pass  # never let reminder loop die


def ensure_cod_reminder_running() -> None:
    """Called from app startup to start the background loop once."""
    global _reminder_task
    if _reminder_task is None or _reminder_task.done():
        try:
            loop = asyncio.get_event_loop()
            _reminder_task = loop.create_task(_cod_reminder_loop())
        except RuntimeError:
            pass  # no event loop yet; startup lifespan will call this again


# ── Rate Config ────────────────────────────────────────────────────────────

async def get_current_rate(session: AsyncSession) -> RateConfigResponse:
    """Return the most recently set rate (latest effective_at)."""
    from sqlalchemy import desc
    result = await session.execute(
        select(DeliveryRateConfig).order_by(desc(DeliveryRateConfig.effective_at)).limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        # No config yet — seed the default
        row = DeliveryRateConfig(
            rate_per_km=DEFAULT_RATE_PER_KM,
            changed_by="system",
            reason="Initial default rate",
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return RateConfigResponse(
        config_id=row.config_id,
        rate_per_km=float(row.rate_per_km),
        changed_by=row.changed_by,
        reason=row.reason,
        effective_at=row.effective_at,
    )


async def get_rate_history(session: AsyncSession, limit: int = 50) -> list[RateConfigResponse]:
    """Full change log, newest first."""
    from sqlalchemy import desc
    result = await session.execute(
        select(DeliveryRateConfig).order_by(desc(DeliveryRateConfig.effective_at)).limit(limit)
    )
    rows = result.scalars().all()
    return [
        RateConfigResponse(
            config_id=r.config_id,
            rate_per_km=float(r.rate_per_km),
            changed_by=r.changed_by,
            reason=r.reason,
            effective_at=r.effective_at,
        )
        for r in rows
    ]


async def set_rate(session: AsyncSession, payload: SetRateRequest) -> RateConfigResponse:
    """Insert a new rate change entry (old entries remain as audit log)."""
    row = DeliveryRateConfig(
        rate_per_km=payload.rate_per_km,
        changed_by=payload.changed_by,
        reason=payload.reason,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return RateConfigResponse(
        config_id=row.config_id,
        rate_per_km=float(row.rate_per_km),
        changed_by=row.changed_by,
        reason=row.reason,
        effective_at=row.effective_at,
    )


# ── Tier rates ─────────────────────────────────────────────────────────────

async def list_tier_rates(session: AsyncSession) -> list[TierRateResponse]:
    result = await session.execute(select(DeliveryTierRate).order_by(DeliveryTierRate.tier))
    return [TierRateResponse.model_validate(r) for r in result.scalars().all()]


async def set_tier_rate(session: AsyncSession, tier: str, payload: SetTierRateRequest) -> TierRateResponse:
    tier = tier.upper()
    if tier not in VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {', '.join(sorted(VALID_TIERS))}")
    row = await session.get(DeliveryTierRate, tier)
    if row is None:
        row = DeliveryTierRate(tier=tier, rate_per_km=payload.rate_per_km, updated_by=payload.updated_by)
        session.add(row)
    else:
        row.rate_per_km = payload.rate_per_km
        row.updated_by = payload.updated_by
        row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return TierRateResponse.model_validate(row)


async def resolve_effective_rate(account: DeliveryAccount, session: AsyncSession) -> float:
    """Returns the rate per km for this account: custom > tier > global."""
    if account.custom_rate_per_km is not None:
        return float(account.custom_rate_per_km)
    tier_row = await session.get(DeliveryTierRate, account.tier or "STANDARD")
    if tier_row is not None:
        return float(tier_row.rate_per_km)
    global_cfg = await get_current_rate(session)
    return global_cfg.rate_per_km


async def get_surge_config(session: AsyncSession) -> SurgeConfigResponse:
    """Returns the current surge config (singleton row id=1)."""
    row = await session.get(DeliverySurgeConfig, 1)
    if row is None:
        return SurgeConfigResponse(is_active=False, multiplier=1.0, label="", updated_by="system", updated_at=datetime.now(UTC))
    return SurgeConfigResponse.model_validate(row)


async def set_surge_config(session: AsyncSession, payload: SetSurgeConfigRequest) -> SurgeConfigResponse:
    """Upsert the singleton surge config row."""
    multiplier = round(float(payload.multiplier), 2)
    if multiplier < 1.0 or multiplier > 2.0:
        raise HTTPException(status_code=400, detail="Surge multiplier must be between 1.0 and 2.0")
    row = await session.get(DeliverySurgeConfig, 1)
    if row is None:
        row = DeliverySurgeConfig(id=1)
        session.add(row)
    row.is_active = payload.is_active
    row.multiplier = multiplier
    row.label = payload.label.strip()
    row.updated_by = payload.updated_by
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return SurgeConfigResponse.model_validate(row)


async def set_account_tier(session: AsyncSession, account_id: UUID, tier: str) -> DeliveryAccountResponse:
    tier = tier.upper()
    if tier not in VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {', '.join(sorted(VALID_TIERS))}")
    account = await session.get(DeliveryAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Delivery account not found")
    account.tier = tier
    await session.commit()
    await session.refresh(account)
    return await _account_response(account, session)


async def set_account_custom_rate(session: AsyncSession, account_id: UUID, custom_rate: float | None) -> DeliveryAccountResponse:
    account = await session.get(DeliveryAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Delivery account not found")
    account.custom_rate_per_km = custom_rate
    await session.commit()
    await session.refresh(account)
    return await _account_response(account, session)


async def _account_response(account: DeliveryAccount, session: AsyncSession) -> DeliveryAccountResponse:
    effective = await resolve_effective_rate(account, session)
    resp = DeliveryAccountResponse.model_validate(account)
    resp.effective_rate = effective
    return resp


# ── Sector Router ──────────────────────────────────────────────────────────

@asynccontextmanager
async def _sector_session(sector: str):
    from app.db.session import PharmacySessionLocal
    if sector == "pharmacy":
        async with PharmacySessionLocal() as sess:
            yield sess
    else:
        yield None


async def _fetch_customer_phone(user_id: UUID) -> str | None:
    """Look up a customer's phone number from the main thean DB."""
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.user import User
        async with AsyncSessionLocal() as sess:
            result = await sess.execute(select(User).where(User.user_id == user_id))
            user = result.scalar_one_or_none()
            return user.phone_number if user else None
    except Exception:
        return None


async def _fetch_source_order_details(sector: str, source_order_id: UUID) -> dict[str, Any]:
    try:
        async with _sector_session(sector) as sess:
            if sess is None:
                return {}
            if sector == "pharmacy":
                from app.models.pharmacy_merchant import CustomerPharmacyOrder
                result = await sess.execute(
                    select(CustomerPharmacyOrder).where(
                        CustomerPharmacyOrder.order_id == source_order_id
                    )
                )
                ph = result.scalar_one_or_none()
                if ph is None:
                    return {}
                notes = ph.order_notes or {}
                city = ph.pharmacy_city or ""
                pincode = ph.pharmacy_pincode or ""
                customer_phone = await _fetch_customer_phone(ph.user_id) if ph.user_id else None
                return {
                    "source_name": ph.pharmacy_name,
                    "source_address": f"{city} {pincode}".strip() or None,
                    "customer_name": ph.patient_name,
                    "customer_address": (
                        notes.get("delivery_address") or notes.get("customer_address")
                    ),
                    "customer_id": ph.user_id,
                    "customer_user_id": ph.user_id,
                    "customer_phone": customer_phone,
                }
            return {}
    except Exception:
        return {}


async def _update_source_order_status(sector: str, source_order_id: UUID, new_status: str) -> None:
    try:
        async with _sector_session(sector) as sess:
            if sess is None:
                return
            if sector == "pharmacy":
                from app.models.pharmacy_merchant import CustomerPharmacyOrder
                result = await sess.execute(
                    select(CustomerPharmacyOrder).where(
                        CustomerPharmacyOrder.order_id == source_order_id
                    )
                )
                ph = result.scalar_one_or_none()
                if ph:
                    ph.status = new_status
                    await sess.commit()
    except Exception:
        pass


async def _get_source_customer_user_id(sector: str, source_order_id: UUID) -> UUID | None:
    info = await _fetch_source_order_details(sector, source_order_id)
    return info.get("customer_user_id")


# ── COD helpers ────────────────────────────────────────────────────────────

async def _apply_cod_rules(session: AsyncSession, account: DeliveryAccount) -> None:
    """
    After mutating cod_balance:
    - >= BLOCK_THRESHOLD → block account, force WS logout
    - >= WARN_THRESHOLD  → send immediate WS warning (periodic reminders handled
                           by _cod_reminder_loop)
    Caller must commit after this.
    """
    bal = float(account.cod_balance)

    if bal >= COD_BLOCK_THRESHOLD and not account.cod_blocked:
        account.cod_blocked = True
        account.is_online = False
        account.updated_at = datetime.now(UTC)
        await manager.send_delivery(
            account.account_id,
            {
                "type": "cod_blocked",
                "cod_balance": bal,
                "message": (
                    f"You are holding ₹{bal:.0f} in cash. Your account has been blocked. "
                    "Please clear this amount with the organisation immediately to regain access."
                ),
            },
        )

    elif bal >= COD_WARN_THRESHOLD:
        now = datetime.now(UTC)
        last_warn = account.cod_warned_at
        # Send immediate notification if we haven't warned yet in this session
        if last_warn is None or (now - last_warn).total_seconds() >= COD_REMINDER_INTERVAL:
            account.cod_warned_at = now
            await manager.send_delivery(
                account.account_id,
                {
                    "type": "cod_warning",
                    "cod_balance": bal,
                    "message": (
                        f"⚠️ You are holding ₹{bal:.0f} in cash. "
                        "Please deposit this with the organisation before it reaches ₹1200."
                    ),
                },
            )


# ── General helpers ────────────────────────────────────────────────────────

def _gen_pin(n: int = 4) -> str:
    return "".join(random.choices(string.digits, k=n))


def _doc_storage_path(account_id: UUID, doc_type: str, filename: str) -> Path:
    settings = get_settings()
    p = Path(settings.media_root) / "delivery" / str(account_id) / doc_type
    p.mkdir(parents=True, exist_ok=True)
    return p / filename


def serialize_account(
    account: DeliveryAccount,
    effective_rate: float | None = None,
) -> DeliveryAccountResponse:
    return DeliveryAccountResponse(
        account_id=account.account_id,
        full_name=account.full_name,
        phone_number=account.phone_number,
        email=account.email,
        vehicle_type=account.vehicle_type,
        vehicle_number=account.vehicle_number,
        license_number=account.license_number,
        id_number=account.id_number,
        account_status=account.account_status,
        is_online=account.is_online,
        current_lat=float(account.current_lat) if account.current_lat is not None else None,
        current_lng=float(account.current_lng) if account.current_lng is not None else None,
        tier=account.tier or "STANDARD",
        custom_rate_per_km=float(account.custom_rate_per_km) if account.custom_rate_per_km is not None else None,
        effective_rate=effective_rate,
        cod_balance=float(account.cod_balance),
        cod_blocked=account.cod_blocked,
        created_at=account.created_at,
    )


def _enrich_order(d: DeliveryOrder, source_info: dict[str, Any] | None) -> DeliveryOrderResponse:
    info = source_info or {}
    return DeliveryOrderResponse(
        delivery_order_id=d.delivery_order_id,
        source_order_id=d.source_order_id,
        sector=d.sector,
        account_id=d.account_id,
        status=d.status,
        distance_km=float(d.distance_km) if d.distance_km is not None else None,
        earnings_amount=float(d.earnings_amount) if d.earnings_amount is not None else None,
        rate_per_km=float(d.rate_per_km),
        surge_multiplier=float(d.surge_multiplier) if d.surge_multiplier is not None else 1.0,
        surge_label=d.surge_label or "",
        cod_amount=float(d.cod_amount) if d.cod_amount is not None else None,
        pickup_pin=d.pickup_pin,
        delivery_pin=d.delivery_pin,
        accept_deadline_at=d.accept_deadline_at,
        accepted_at=d.accepted_at,
        arrived_at_store_at=d.arrived_at_store_at,
        picked_up_at=d.picked_up_at,
        arrived_at_customer_at=d.arrived_at_customer_at,
        delivered_at=d.delivered_at,
        rejected_at=d.rejected_at,
        pickup_lat=float(d.pickup_lat) if d.pickup_lat is not None else None,
        pickup_lng=float(d.pickup_lng) if d.pickup_lng is not None else None,
        dropoff_lat=float(d.dropoff_lat) if d.dropoff_lat is not None else None,
        dropoff_lng=float(d.dropoff_lng) if d.dropoff_lng is not None else None,
        created_at=d.created_at,
        source_name=info.get("source_name"),
        source_address=info.get("source_address"),
        customer_name=info.get("customer_name"),
        customer_address=info.get("customer_address"),
        customer_id=info.get("customer_id"),
        customer_phone=info.get("customer_phone"),
    )


# ── Auth ───────────────────────────────────────────────────────────────────

async def register_delivery_account(
    session: AsyncSession,
    payload: DeliveryRegisterRequest,
) -> DeliveryAccountResponse:
    """Register with full uniqueness checks to prevent fraud."""
    errors = []

    # Phone uniqueness
    if (await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.phone_number == payload.phone_number)
    )).scalar_one_or_none():
        errors.append("Phone number is already registered.")

    # Email uniqueness
    if payload.email:
        if (await session.execute(
            select(DeliveryAccount).where(DeliveryAccount.email == payload.email)
        )).scalar_one_or_none():
            errors.append("Email address is already registered.")

    # Vehicle number uniqueness
    if payload.vehicle_number:
        if (await session.execute(
            select(DeliveryAccount).where(DeliveryAccount.vehicle_number == payload.vehicle_number)
        )).scalar_one_or_none():
            errors.append("Vehicle number is already registered.")

    # License number uniqueness
    if payload.license_number:
        if (await session.execute(
            select(DeliveryAccount).where(DeliveryAccount.license_number == payload.license_number)
        )).scalar_one_or_none():
            errors.append("Driving license number is already registered.")

    # ID number uniqueness
    if payload.id_number:
        if (await session.execute(
            select(DeliveryAccount).where(DeliveryAccount.id_number == payload.id_number)
        )).scalar_one_or_none():
            errors.append("ID document number is already registered.")

    if errors:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"errors": errors, "message": "Registration failed due to duplicate information."},
        )

    account = DeliveryAccount(
        full_name=payload.full_name,
        phone_number=payload.phone_number,
        email=payload.email,
        vehicle_type=payload.vehicle_type,
        vehicle_number=payload.vehicle_number,
        license_number=payload.license_number,
        id_number=payload.id_number,
        account_status="pending",
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    # Create wallet
    wallet = DeliveryWallet(account_id=account.account_id)
    session.add(wallet)
    await session.commit()
    return serialize_account(account)


async def upload_delivery_document(
    session: AsyncSession,
    account_id: UUID,
    doc_type: str,
    file: UploadFile,
) -> None:
    await _get_account(session, account_id)
    safe_name = f"{doc_type}_{file.filename or 'doc'}"
    path = _doc_storage_path(account_id, doc_type, safe_name)
    content = await file.read()
    path.write_bytes(content)
    doc = DeliveryDocument(
        account_id=account_id,
        doc_type=doc_type,
        filename=safe_name,
        original_name=file.filename,
        content_type=file.content_type,
    )
    session.add(doc)
    await session.commit()


async def request_delivery_otp(session: AsyncSession, phone_number: str) -> dict:
    result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.phone_number == phone_number)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found. Please register first.")
    if account.account_status == "pending":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is pending admin activation.")
    if account.account_status == "disabled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been disabled.")
    settings = get_settings()
    otp = settings.mock_otp_code if settings.mock_otp_enabled else generate_otp()
    account.otp_code = otp
    account.otp_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    account.updated_at = datetime.now(UTC)
    await session.commit()
    return {"message": f"OTP sent to {phone_number}.", "otp": otp if settings.mock_otp_enabled else None}


async def verify_delivery_otp(session: AsyncSession, phone_number: str, otp: str) -> DeliveryAuthResponse:
    from jose import jwt

    result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.phone_number == phone_number)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    if account.account_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active.")
    if not account.otp_code or account.otp_code != otp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP.")
    if account.otp_expires_at and datetime.now(UTC) > account.otp_expires_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OTP has expired.")

    # If COD-blocked, still allow login but front-end will show the clear-payment screen
    account.otp_code = None
    account.otp_expires_at = None
    account.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(account)

    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(days=TOKEN_EXPIRE_DAYS)
    token_payload = {
        "sub": str(account.account_id),
        "type": "delivery",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(token_payload, settings.app_secret_key, algorithm="HS256")
    return DeliveryAuthResponse(access_token=token, account=serialize_account(account))


async def _get_account(session: AsyncSession, account_id: UUID) -> DeliveryAccount:
    result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.account_id == account_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery account not found.")
    return account


async def get_delivery_account(session: AsyncSession, account_id: UUID) -> DeliveryAccountResponse:
    account = await _get_account(session, account_id)
    effective = await resolve_effective_rate(account, session)
    return serialize_account(account, effective_rate=effective)


async def set_delivery_availability(
    session: AsyncSession,
    account_id: UUID,
    is_online: bool,
) -> DeliveryAccountResponse:
    account = await _get_account(session, account_id)
    if account.account_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active.")
    if account.cod_blocked and is_online:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is blocked due to unpaid COD balance of ₹{float(account.cod_balance):.0f}. Please clear the amount with the organisation.",
        )
    account.is_online = is_online
    account.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(account)
    return serialize_account(account)


_ACTIVE_DELIVERY_STATUSES = {
    "DELIVERY_ACCEPTED", "ARRIVED_AT_STORE", "ORDER_PICKED_UP", "ARRIVED_AT_CUSTOMER",
}

async def update_delivery_location(
    session: AsyncSession,
    account_id: UUID,
    lat: float,
    lng: float,
) -> None:
    from app.models.delivery import DeliveryLocationLog
    account = await _get_account(session, account_id)
    account.current_lat = lat
    account.current_lng = lng
    account.location_updated_at = datetime.now(UTC)
    account.updated_at = datetime.now(UTC)

    # Write heartbeat row if account has an active delivery order
    active = await session.execute(
        select(DeliveryOrder)
        .where(DeliveryOrder.account_id == account_id)
        .where(DeliveryOrder.status.in_(_ACTIVE_DELIVERY_STATUSES))
        .order_by(DeliveryOrder.created_at.desc())
        .limit(1)
    )
    active_order = active.scalar_one_or_none()
    if active_order:
        session.add(DeliveryLocationLog(
            delivery_order_id=active_order.delivery_order_id,
            account_id=account_id,
            lat=lat,
            lng=lng,
        ))

    await session.commit()


async def get_location_trail(
    session: AsyncSession,
    delivery_order_id: UUID,
) -> list[dict]:
    """Return the full GPS trail for a delivery order, oldest-first (for replay)."""
    from app.models.delivery import DeliveryLocationLog
    result = await session.execute(
        select(DeliveryLocationLog)
        .where(DeliveryLocationLog.delivery_order_id == delivery_order_id)
        .order_by(DeliveryLocationLog.recorded_at.asc())
    )
    return [
        {"lat": float(r.lat), "lng": float(r.lng), "recorded_at": r.recorded_at.isoformat()}
        for r in result.scalars().all()
    ]


async def get_all_active_locations(session: AsyncSession) -> list[dict]:
    """Return current position of every delivery boy with an active order (for admin live map).
    Includes OSRM road distance + ETA from each driver to their customer dropoff."""
    import asyncio
    from app.services.customer_order_service import _osrm_road_distance_km

    result = await session.execute(
        select(DeliveryOrder, DeliveryAccount)
        .join(DeliveryAccount, DeliveryAccount.account_id == DeliveryOrder.account_id)
        .where(DeliveryOrder.status.in_(_ACTIVE_DELIVERY_STATUSES))
    )
    rows = result.all()
    loop = asyncio.get_event_loop()

    out = []
    for order, account in rows:
        if account.current_lat is None:
            continue
        drv_lat = float(account.current_lat)
        drv_lng = float(account.current_lng)
        road_km = None
        eta_min = None
        if order.dropoff_lat and order.dropoff_lng:
            try:
                road_km = await loop.run_in_executor(
                    None, _osrm_road_distance_km,
                    drv_lat, drv_lng,
                    float(order.dropoff_lat), float(order.dropoff_lng),
                )
                eta_min = max(1, round(road_km / 30 * 60))
            except Exception:
                pass
        out.append({
            "delivery_order_id": str(order.delivery_order_id),
            "account_id": str(order.account_id),
            "driver_name": account.full_name,
            "status": order.status,
            "lat": drv_lat,
            "lng": drv_lng,
            "location_updated_at": account.location_updated_at.isoformat() if account.location_updated_at else None,
            "source_order_id": str(order.source_order_id),
            "dropoff_lat": float(order.dropoff_lat) if order.dropoff_lat else None,
            "dropoff_lng": float(order.dropoff_lng) if order.dropoff_lng else None,
            "road_km_to_customer": road_km,
            "eta_minutes": eta_min,
        })
    return out


# ── Admin: assign order ────────────────────────────────────────────────────

async def admin_assign_delivery_order(
    session: AsyncSession,
    payload: DeliveryAssignRequest,
) -> DeliveryOrderResponse:
    account = await _get_account(session, payload.account_id)
    if account.account_status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Delivery boy is not active.")
    if account.cod_blocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Delivery boy's account is COD-blocked (₹{float(account.cod_balance):.0f} pending). Cannot assign new orders.",
        )

    source_info = await _fetch_source_order_details(payload.sector, payload.source_order_id)
    if not source_info and payload.sector == "pharmacy":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source order not found.")

    # ── Resolve rate for this delivery boy (custom > tier > global) ──────
    live_rate = await resolve_effective_rate(account, session)
    surge = await get_surge_config(session)
    surge_multiplier = float(surge.multiplier) if surge.is_active else 1.0

    distance_km = payload.distance_km or 0
    earnings = round(distance_km * live_rate * surge_multiplier, 2)
    now = datetime.now(UTC)

    delivery_order = DeliveryOrder(
        sector=payload.sector,
        source_order_id=payload.source_order_id,
        account_id=payload.account_id,
        status="ASSIGNED_TO_DELIVERY",
        distance_km=distance_km,
        earnings_amount=earnings,
        rate_per_km=live_rate,
        surge_multiplier=surge_multiplier,
        surge_label=surge.label if surge.is_active else "",
        cod_amount=payload.cod_amount if payload.cod_amount > 0 else None,
        pickup_pin=_gen_pin(4),
        delivery_pin=_gen_pin(4),
        accept_deadline_at=now + timedelta(seconds=ACCEPT_DEADLINE_SECONDS),
        pickup_lat=payload.pickup_lat,
        pickup_lng=payload.pickup_lng,
        dropoff_lat=payload.dropoff_lat,
        dropoff_lng=payload.dropoff_lng,
    )
    session.add(delivery_order)
    await session.flush()
    await session.commit()
    await session.refresh(delivery_order)

    await manager.send_delivery(
        payload.account_id,
        {
            "type": "new_delivery_assignment",
            "delivery_order_id": str(delivery_order.delivery_order_id),
            "sector": payload.sector,
            "source_name": source_info.get("source_name"),
            "distance_km": float(distance_km),
            "estimated_earnings": earnings,
            "rate_per_km": live_rate,
            "surge_multiplier": surge_multiplier,
            "surge_label": surge.label if surge.is_active else "",
            "cod_amount": payload.cod_amount,
            "accept_deadline_at": delivery_order.accept_deadline_at.isoformat(),
            "pickup_lat": payload.pickup_lat,
            "pickup_lng": payload.pickup_lng,
            "dropoff_lat": payload.dropoff_lat,
            "dropoff_lng": payload.dropoff_lng,
        },
    )
    return _enrich_order(delivery_order, source_info)


# ── Delivery boy: order actions ────────────────────────────────────────────

async def _get_delivery_order(
    session: AsyncSession, delivery_order_id: UUID, account_id: UUID
) -> DeliveryOrder:
    result = await session.execute(
        select(DeliveryOrder).where(
            and_(
                DeliveryOrder.delivery_order_id == delivery_order_id,
                DeliveryOrder.account_id == account_id,
            )
        )
    )
    d = result.scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery order not found.")
    return d


async def accept_delivery_order(
    session: AsyncSession,
    account_id: UUID,
    delivery_order_id: UUID,
) -> DeliveryOrderResponse:
    d = await _get_delivery_order(session, delivery_order_id, account_id)
    if d.status != "ASSIGNED_TO_DELIVERY":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order is not awaiting acceptance.")
    if d.accept_deadline_at and datetime.now(UTC) > d.accept_deadline_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Accept deadline has passed.")
    d.status = "DELIVERY_ACCEPTED"
    d.accepted_at = datetime.now(UTC)
    d.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(d)

    customer_uid = await _get_source_customer_user_id(d.sector, d.source_order_id)
    if customer_uid:
        await manager.send_customer(
            customer_uid,
            {
                "type": "delivery_accepted",
                "message": "A delivery partner has accepted your order and is on the way to pick it up.",
                "delivery_order_id": str(d.delivery_order_id),
            },
        )
    source_info = await _fetch_source_order_details(d.sector, d.source_order_id)
    return _enrich_order(d, source_info)


async def reject_delivery_order(
    session: AsyncSession,
    account_id: UUID,
    delivery_order_id: UUID,
) -> DeliveryOrderResponse:
    d = await _get_delivery_order(session, delivery_order_id, account_id)
    if d.status != "ASSIGNED_TO_DELIVERY":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order cannot be rejected now.")
    d.status = "DELIVERY_REJECTED"
    d.rejected_at = datetime.now(UTC)
    d.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(d)
    source_info = await _fetch_source_order_details(d.sector, d.source_order_id)
    return _enrich_order(d, source_info)


_STATUS_TRANSITIONS = {
    "DELIVERY_ACCEPTED": "ARRIVED_AT_STORE",
    "ARRIVED_AT_STORE": "ORDER_PICKED_UP",
    "ORDER_PICKED_UP": "ARRIVED_AT_CUSTOMER",
    "ARRIVED_AT_CUSTOMER": "DELIVERED",
}

_TIMESTAMP_FIELDS = {
    "ARRIVED_AT_STORE": "arrived_at_store_at",
    "ORDER_PICKED_UP": "picked_up_at",
    "ARRIVED_AT_CUSTOMER": "arrived_at_customer_at",
    "DELIVERED": "delivered_at",
}

_PIN_REQUIRED_FOR = {"ORDER_PICKED_UP", "DELIVERED"}


async def advance_delivery_status(
    session: AsyncSession,
    account_id: UUID,
    delivery_order_id: UUID,
    pin: str | None,
) -> DeliveryOrderResponse:
    d = await _get_delivery_order(session, delivery_order_id, account_id)
    next_status = _STATUS_TRANSITIONS.get(d.status)
    if next_status is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Cannot advance from status {d.status}.")

    if next_status in _PIN_REQUIRED_FOR:
        expected_pin = d.pickup_pin if next_status == "ORDER_PICKED_UP" else d.delivery_pin
        if not pin or pin != expected_pin:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid PIN.")

    d.status = next_status
    ts_field = _TIMESTAMP_FIELDS.get(next_status)
    if ts_field:
        setattr(d, ts_field, datetime.now(UTC))
    d.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(d)

    customer_uid = await _get_source_customer_user_id(d.sector, d.source_order_id)

    if next_status == "ORDER_PICKED_UP":
        await _update_source_order_status(d.sector, d.source_order_id, "OUT_FOR_DELIVERY")
        if customer_uid:
            await manager.send_customer(
                customer_uid,
                {"type": "order_picked_up", "message": "Your order is on the way!", "delivery_order_id": str(d.delivery_order_id)},
            )

    if next_status == "DELIVERED":
        await _update_source_order_status(d.sector, d.source_order_id, "COMPLETED")
        await _credit_earnings(session, d)

        # ── COD collection ──────────────────────────────────────────────
        cod = float(d.cod_amount or 0)
        if cod > 0:
            await _record_cod_collection(session, d, cod)

        if customer_uid:
            await manager.send_customer(
                customer_uid,
                {"type": "order_delivered", "message": "Your order has been delivered!", "delivery_order_id": str(d.delivery_order_id)},
            )

    source_info = await _fetch_source_order_details(d.sector, d.source_order_id)
    return _enrich_order(d, source_info)


async def _record_cod_collection(session: AsyncSession, d: DeliveryOrder, amount: float) -> None:
    """Add COD to the account balance and apply threshold rules."""
    col = DeliveryCodCollection(
        account_id=d.account_id,
        delivery_order_id=d.delivery_order_id,
        amount=amount,
    )
    session.add(col)

    account_result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.account_id == d.account_id)
    )
    account = account_result.scalar_one_or_none()
    if account:
        account.cod_balance = float(account.cod_balance) + amount
        account.updated_at = datetime.now(UTC)
        await _apply_cod_rules(session, account)
        await session.commit()


async def _credit_earnings(session: AsyncSession, d: DeliveryOrder) -> None:
    amount = float(d.earnings_amount or 0)
    earning = DeliveryEarning(
        account_id=d.account_id,
        delivery_order_id=d.delivery_order_id,
        amount=amount,
    )
    session.add(earning)
    wallet_result = await session.execute(
        select(DeliveryWallet).where(DeliveryWallet.account_id == d.account_id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if wallet:
        wallet.balance = float(wallet.balance) + amount
        wallet.total_earned = float(wallet.total_earned) + amount
        wallet.updated_at = datetime.now(UTC)


# ── COD summary and admin clear ────────────────────────────────────────────

async def get_cod_summary(session: AsyncSession, account_id: UUID) -> CodSummaryResponse:
    from app.schemas.delivery import CodCollectionResponse, CodPayoutResponse

    account = await _get_account(session, account_id)

    cols_result = await session.execute(
        select(DeliveryCodCollection)
        .where(DeliveryCodCollection.account_id == account_id)
        .order_by(DeliveryCodCollection.collected_at.desc())
        .limit(20)
    )
    cols = cols_result.scalars().all()

    pays_result = await session.execute(
        select(DeliveryCodPayout)
        .where(DeliveryCodPayout.account_id == account_id)
        .order_by(DeliveryCodPayout.payout_at.desc())
        .limit(10)
    )
    pays = pays_result.scalars().all()

    return CodSummaryResponse(
        cod_balance=float(account.cod_balance),
        cod_blocked=account.cod_blocked,
        recent_collections=[
            CodCollectionResponse(
                collection_id=c.collection_id,
                delivery_order_id=c.delivery_order_id,
                amount=float(c.amount),
                collected_at=c.collected_at,
            )
            for c in cols
        ],
        recent_payouts=[
            CodPayoutResponse(
                payout_id=p.payout_id,
                account_id=p.account_id,
                amount=float(p.amount),
                cleared_by=p.cleared_by,
                note=p.note,
                payout_at=p.payout_at,
            )
            for p in pays
        ],
    )


async def admin_clear_cod(
    session: AsyncSession,
    account_id: UUID,
    amount: float,
    cleared_by: str,
    note: str | None,
) -> DeliveryAccountResponse:
    """Admin records a COD payout from the delivery boy, reducing their balance."""
    account = await _get_account(session, account_id)
    current_bal = float(account.cod_balance)

    if amount > current_bal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount ₹{amount:.0f} exceeds current COD balance ₹{current_bal:.0f}.",
        )

    payout = DeliveryCodPayout(
        account_id=account_id,
        amount=amount,
        cleared_by=cleared_by,
        note=note,
    )
    session.add(payout)

    new_bal = round(current_bal - amount, 2)
    account.cod_balance = new_bal
    account.updated_at = datetime.now(UTC)

    # Unblock if now below threshold
    if new_bal < COD_BLOCK_THRESHOLD and account.cod_blocked:
        account.cod_blocked = False
        await manager.send_delivery(
            account_id,
            {
                "type": "cod_unblocked",
                "cod_balance": new_bal,
                "message": f"✅ Your COD balance has been cleared. Remaining balance: ₹{new_bal:.0f}. Account is now active.",
            },
        )

    await session.commit()
    await session.refresh(account)
    return serialize_account(account)


# ── Active / list orders ───────────────────────────────────────────────────

async def get_active_delivery_order(
    session: AsyncSession,
    account_id: UUID,
) -> DeliveryOrderResponse | None:
    result = await session.execute(
        select(DeliveryOrder).where(
            and_(
                DeliveryOrder.account_id == account_id,
                DeliveryOrder.status.in_([
                    "ASSIGNED_TO_DELIVERY",
                    "DELIVERY_ACCEPTED",
                    "ARRIVED_AT_STORE",
                    "ORDER_PICKED_UP",
                    "ARRIVED_AT_CUSTOMER",
                ]),
            )
        ).order_by(DeliveryOrder.created_at.desc())
    )
    d = result.scalars().first()
    if d is None:
        return None
    source_info = await _fetch_source_order_details(d.sector, d.source_order_id)
    return _enrich_order(d, source_info)


async def list_delivery_orders(
    session: AsyncSession,
    account_id: UUID,
) -> list[DeliveryOrderResponse]:
    result = await session.execute(
        select(DeliveryOrder)
        .where(DeliveryOrder.account_id == account_id)
        .order_by(DeliveryOrder.created_at.desc())
        .limit(50)
    )
    orders = result.scalars().all()
    return [
        _enrich_order(o, await _fetch_source_order_details(o.sector, o.source_order_id))
        for o in orders
    ]


# ── Chat ──────────────────────────────────────────────────────────────────

async def _verify_chat_access(
    session: AsyncSession,
    delivery_order_id: UUID,
    sender_id: UUID,
    sender_type: str,
) -> DeliveryOrder:
    result = await session.execute(
        select(DeliveryOrder).where(DeliveryOrder.delivery_order_id == delivery_order_id)
    )
    d = result.scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery order not found.")
    if sender_type == "delivery" and d.account_id != sender_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return d


async def send_chat_message(
    session: AsyncSession,
    delivery_order_id: UUID,
    sender_id: UUID,
    sender_type: str,
    text: str,
) -> dict:
    d = await _verify_chat_access(session, delivery_order_id, sender_id, sender_type)
    msg = DeliveryChatMessage(
        delivery_order_id=delivery_order_id,
        sender_type=sender_type,
        sender_id=sender_id,
        message_text=text,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)

    serialized = {
        "message_id": str(msg.message_id),
        "delivery_order_id": str(msg.delivery_order_id),
        "sender_type": msg.sender_type,
        "sender_id": str(msg.sender_id),
        "message_text": msg.message_text,
        "sent_at": msg.sent_at.isoformat(),
        "read_at": None,
    }
    if sender_type == "delivery":
        customer_uid = await _get_source_customer_user_id(d.sector, d.source_order_id)
        if customer_uid:
            await manager.send_customer(customer_uid, {"type": "chat_message", **serialized})
    else:
        await manager.send_delivery(d.account_id, {"type": "chat_message", **serialized})
    return serialized


async def list_chat_messages(
    session: AsyncSession,
    delivery_order_id: UUID,
) -> list[dict]:
    result = await session.execute(
        select(DeliveryChatMessage)
        .where(DeliveryChatMessage.delivery_order_id == delivery_order_id)
        .order_by(DeliveryChatMessage.sent_at.asc())
    )
    msgs = result.scalars().all()
    return [
        {
            "message_id": str(m.message_id),
            "delivery_order_id": str(m.delivery_order_id),
            "sender_type": m.sender_type,
            "sender_id": str(m.sender_id),
            "message_text": m.message_text,
            "sent_at": m.sent_at.isoformat(),
            "read_at": m.read_at.isoformat() if m.read_at else None,
        }
        for m in msgs
    ]


# ── Earnings ──────────────────────────────────────────────────────────────

async def get_earnings_summary(
    session: AsyncSession,
    account_id: UUID,
) -> EarningsSummaryResponse:
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    result = await session.execute(
        select(DeliveryEarning)
        .where(DeliveryEarning.account_id == account_id)
        .order_by(DeliveryEarning.earned_at.desc())
    )
    all_earnings = result.scalars().all()

    def _sum(earnings, from_dt):
        return sum(float(e.amount) for e in earnings if e.earned_at >= from_dt)

    wallet_result = await session.execute(
        select(DeliveryWallet).where(DeliveryWallet.account_id == account_id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if wallet is None:
        wallet = DeliveryWallet(account_id=account_id)
        session.add(wallet)
        await session.commit()
        await session.refresh(wallet)

    from app.schemas.delivery import EarningResponse, WalletResponse
    return EarningsSummaryResponse(
        today=_sum(all_earnings, today_start),
        this_week=_sum(all_earnings, week_start),
        this_month=_sum(all_earnings, month_start),
        total=float(wallet.total_earned),
        wallet=WalletResponse(
            wallet_id=wallet.wallet_id,
            account_id=wallet.account_id,
            balance=float(wallet.balance),
            total_earned=float(wallet.total_earned),
            total_withdrawn=float(wallet.total_withdrawn),
            updated_at=wallet.updated_at,
        ),
        recent=[
            EarningResponse(
                earning_id=e.earning_id,
                delivery_order_id=e.delivery_order_id,
                amount=float(e.amount),
                status=e.status,
                earned_at=e.earned_at,
            )
            for e in all_earnings[:20]
        ],
    )


async def request_cashout(
    session: AsyncSession,
    account_id: UUID,
    amount: float,
    upi_id: str,
) -> dict:
    wallet_result = await session.execute(
        select(DeliveryWallet).where(DeliveryWallet.account_id == account_id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if wallet is None or float(wallet.balance) < amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient balance.")
    cashout = DeliveryCashoutRequest(
        account_id=account_id,
        amount=amount,
        upi_id=upi_id,
    )
    session.add(cashout)
    wallet.balance = float(wallet.balance) - amount
    wallet.total_withdrawn = float(wallet.total_withdrawn) + amount
    wallet.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(cashout)
    return {
        "cashout_id": str(cashout.cashout_id),
        "amount": float(cashout.amount),
        "status": cashout.status,
        "upi_id": cashout.upi_id,
        "requested_at": cashout.requested_at.isoformat(),
        "processed_at": None,
    }


# ── Admin helpers ─────────────────────────────────────────────────────────

async def list_all_delivery_accounts(session: AsyncSession) -> list[DeliveryAccountResponse]:
    from sqlalchemy import desc
    result = await session.execute(
        select(DeliveryAccount).order_by(DeliveryAccount.created_at.desc())
    )
    accounts = result.scalars().all()

    # Batch-load all tier rates and global rate once
    tier_result = await session.execute(select(DeliveryTierRate))
    tier_map: dict[str, float] = {r.tier: float(r.rate_per_km) for r in tier_result.scalars().all()}
    global_cfg = await get_current_rate(session)
    global_rate = global_cfg.rate_per_km

    def _effective(acc: DeliveryAccount) -> float:
        if acc.custom_rate_per_km is not None:
            return float(acc.custom_rate_per_km)
        return tier_map.get(acc.tier or "STANDARD", global_rate)

    return [serialize_account(a, effective_rate=_effective(a)) for a in accounts]


async def admin_set_account_status(
    session: AsyncSession, account_id: UUID, new_status: str
) -> DeliveryAccountResponse:
    account = await _get_account(session, account_id)
    account.account_status = new_status
    if new_status == "disabled":
        account.is_online = False
        await manager.send_delivery(
            account_id,
            {"type": "account_disabled", "message": "Your account has been disabled by the admin."},
        )
    account.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(account)
    return serialize_account(account)


async def list_all_delivery_orders_admin(session: AsyncSession) -> list[DeliveryOrderResponse]:
    result = await session.execute(
        select(DeliveryOrder).order_by(DeliveryOrder.created_at.desc()).limit(200)
    )
    orders = result.scalars().all()
    return [
        _enrich_order(o, await _fetch_source_order_details(o.sector, o.source_order_id))
        for o in orders
    ]


# ════════════════════════════════════════════════════════════════════════════
# Smart Auto-Assign — Driver Scoring & Selection
# ════════════════════════════════════════════════════════════════════════════

# Weights (must sum to 1.0)
_W_PROXIMITY = 0.50
_W_RATING    = 0.30
_W_VEHICLE   = 0.20

# Vehicle suitability scores (bike is fastest for all sectors)
_VEHICLE_SCORE: dict[str, float] = {
    "bike":  1.0,
    "car":   0.6,
    "cycle": 0.4,
}

# Eligibility constants
_MAX_SEARCH_RADIUS_KM = 20.0   # drivers beyond this are excluded regardless
_GPS_FRESHNESS_SECS   = 60     # location_updated_at must be within this many seconds
_ACTIVE_STATUSES = {
    "ASSIGNED_TO_DELIVERY", "DELIVERY_ACCEPTED",
    "ARRIVED_AT_STORE", "ORDER_PICKED_UP", "ARRIVED_AT_CUSTOMER",
}


def _road_distance_km(origin_lat: float, origin_lng: float,
                      dest_lat: float, dest_lng: float) -> float:
    """OSRM road distance in km; falls back to haversine on failure."""
    try:
        url = (
            f"https://router.project-osrm.org/route/v1/driving/"
            f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
            f"?overview=false&annotations=false"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Thean-Platform/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        if data.get("code") == "Ok":
            return round(data["routes"][0]["distance"] / 1000, 3)
    except Exception as exc:
        _log.warning("OSRM unavailable (%s); using haversine fallback.", exc)
    # haversine fallback
    R = 6371.0
    dlat = math.radians(dest_lat - origin_lat)
    dlng = math.radians(dest_lng - origin_lng)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(origin_lat))
         * math.cos(math.radians(dest_lat))
         * math.sin(dlng / 2) ** 2)
    return round(R * 2 * math.asin(math.sqrt(a)), 3)


async def _score_drivers(
    session: AsyncSession,
    pickup_lat: float,
    pickup_lng: float,
    is_cod: bool,
) -> tuple[list[DriverCandidateScore], list[DriverCandidateScore]]:
    """
    Return (eligible_ranked, all_with_exclusions).
    Eligible list is sorted best-first by final_score.
    """
    now = datetime.now(UTC)
    gps_cutoff = now - timedelta(seconds=_GPS_FRESHNESS_SECS)

    # Fetch all active, non-disabled delivery accounts
    result = await session.execute(
        select(DeliveryAccount).where(
            DeliveryAccount.account_status == "active"
        )
    )
    accounts = result.scalars().all()

    # Find which accounts already have an active delivery order
    busy_result = await session.execute(
        select(DeliveryOrder.account_id).where(
            DeliveryOrder.status.in_(_ACTIVE_STATUSES)
        )
    )
    busy_ids = {row[0] for row in busy_result.all()}

    eligible: list[DriverCandidateScore] = []
    all_candidates: list[DriverCandidateScore] = []

    for acct in accounts:
        exclusion = None

        # ── 1. Online check ──────────────────────────────────────────────
        if not acct.is_online:
            exclusion = "offline"

        # ── 2. Capacity (already on a delivery) ─────────────────────────
        elif acct.account_id in busy_ids:
            exclusion = "already_on_delivery"

        # ── 3. GPS freshness (dead zone / app killed) ────────────────────
        elif acct.location_updated_at is None:
            exclusion = "no_gps_fix"
        elif acct.location_updated_at.replace(tzinfo=UTC) < gps_cutoff:
            exclusion = f"gps_stale_over_{_GPS_FRESHNESS_SECS}s"

        # ── 4. Missing coordinates ────────────────────────────────────────
        elif acct.current_lat is None or acct.current_lng is None:
            exclusion = "no_location"

        # ── 5. COD wallet check ───────────────────────────────────────────
        elif is_cod and float(acct.cod_balance) >= COD_WARN_THRESHOLD:
            exclusion = f"cod_wallet_full_₹{float(acct.cod_balance):.0f}"

        # ── 6. COD blocked ────────────────────────────────────────────────
        elif acct.cod_blocked:
            exclusion = "cod_blocked"

        # Compute OSRM distance for all accounts that passed basic checks
        if exclusion is None or exclusion in ("cod_wallet_full_₹" + str(int(float(acct.cod_balance))),):
            # always compute distance so excluded candidates still show it
            pass

        drv_lat = float(acct.current_lat) if acct.current_lat else 0.0
        drv_lng = float(acct.current_lng) if acct.current_lng else 0.0

        # Only bother calling OSRM if we have real coords
        if drv_lat and drv_lng and exclusion is None:
            dist_km = await asyncio.get_event_loop().run_in_executor(
                None, _road_distance_km,
                drv_lat, drv_lng, pickup_lat, pickup_lng,
            )
            if dist_km > _MAX_SEARCH_RADIUS_KM:
                exclusion = f"too_far_{dist_km:.1f}km"
        elif exclusion is None:
            dist_km = 9999.0
        else:
            dist_km = 9999.0

        # ── Scoring ───────────────────────────────────────────────────────
        # Proximity score: 1.0 at 0 km → 0.0 at _MAX_SEARCH_RADIUS_KM
        proximity_score = max(0.0, 1.0 - dist_km / _MAX_SEARCH_RADIUS_KM)

        # Rating score: normalised 0–1 from 1-5 star range
        rating_score = (float(acct.avg_rating) - 1.0) / 4.0

        # Vehicle suitability score (bike best for all sectors)
        vehicle_score = _VEHICLE_SCORE.get(acct.vehicle_type.lower(), 0.3)

        final_score = (
            proximity_score * _W_PROXIMITY
            + rating_score  * _W_RATING
            + vehicle_score * _W_VEHICLE
        )

        candidate = DriverCandidateScore(
            account_id=acct.account_id,
            full_name=acct.full_name,
            phone_number=acct.phone_number,
            vehicle_type=acct.vehicle_type,
            current_lat=float(acct.current_lat) if acct.current_lat else None,
            current_lng=float(acct.current_lng) if acct.current_lng else None,
            distance_km=dist_km,
            avg_rating=float(acct.avg_rating),
            vehicle_score=round(vehicle_score, 4),
            proximity_score=round(proximity_score, 4),
            rating_score=round(rating_score, 4),
            final_score=round(final_score, 4),
            exclusion_reason=exclusion,
        )
        all_candidates.append(candidate)
        if exclusion is None:
            eligible.append(candidate)

    eligible.sort(key=lambda c: c.final_score, reverse=True)
    all_candidates.sort(key=lambda c: c.final_score, reverse=True)
    return eligible, all_candidates


async def auto_assign_best_driver(
    session: AsyncSession,
    payload: AutoAssignRequest,
) -> AutoAssignResult:
    """
    Run the scoring algorithm and assign the best available driver.

    Special rule: if exactly one eligible driver exists, assign them
    regardless of score (no threshold applied).
    """
    is_cod = payload.cod_amount > 0
    eligible, all_candidates = await _score_drivers(
        session, payload.pickup_lat, payload.pickup_lng, is_cod
    )

    if not eligible:
        return AutoAssignResult(
            assigned=False,
            all_candidates=all_candidates,
            reason="No eligible drivers found.",
        )

    winner = eligible[0]   # best score (or the only one)

    # ── Compute full route distance (driver → pickup → dropoff) for earnings ──
    route_km = payload.distance_km
    if route_km is None:
        route_km = await asyncio.get_event_loop().run_in_executor(
            None, _road_distance_km,
            payload.pickup_lat, payload.pickup_lng,
            payload.dropoff_lat, payload.dropoff_lng,
        )

    # ── Build DeliveryAssignRequest and delegate to existing assign logic ──
    assign_req = DeliveryAssignRequest(
        source_order_id=payload.source_order_id,
        sector=payload.sector,
        account_id=winner.account_id,
        distance_km=route_km,
        cod_amount=payload.cod_amount,
        pickup_lat=payload.pickup_lat,
        pickup_lng=payload.pickup_lng,
        dropoff_lat=payload.dropoff_lat,
        dropoff_lng=payload.dropoff_lng,
    )
    delivery_order = await admin_assign_delivery_order(session, assign_req)

    # ── Increment performance counter ──────────────────────────────────────
    acct_result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.account_id == winner.account_id)
    )
    acct = acct_result.scalar_one()
    acct.total_assigned = (acct.total_assigned or 0) + 1
    await session.commit()

    return AutoAssignResult(
        assigned=True,
        delivery_order=delivery_order,
        assigned_driver=winner,
        all_candidates=all_candidates,
        reason=f"Assigned to {winner.full_name} (score {winner.final_score:.3f})"
               + (" — only eligible driver" if len(eligible) == 1 else ""),
    )


# ── Rating ────────────────────────────────────────────────────────────────

async def submit_delivery_rating(
    session: AsyncSession,
    delivery_order_id: UUID,
    rated_by: UUID,
    payload: DeliveryRatingRequest,
) -> DeliveryRatingResponse:
    # Confirm the delivery order exists and is completed
    d_result = await session.execute(
        select(DeliveryOrder).where(DeliveryOrder.delivery_order_id == delivery_order_id)
    )
    d = d_result.scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="Delivery order not found.")
    if d.status != "DELIVERED":
        raise HTTPException(
            status_code=409,
            detail="Rating can only be submitted after the order is delivered.",
        )

    # Check for duplicate
    dup = await session.execute(
        select(DeliveryRating).where(
            DeliveryRating.delivery_order_id == delivery_order_id,
            DeliveryRating.rated_by == rated_by,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="You have already rated this delivery.")

    # Save rating row
    row = DeliveryRating(
        delivery_order_id=delivery_order_id,
        account_id=d.account_id,
        rated_by=rated_by,
        rating=payload.rating,
        comment=payload.comment,
    )
    session.add(row)

    # Update rolling avg on the account
    acct_result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.account_id == d.account_id)
    )
    acct = acct_result.scalar_one()
    old_count = acct.rating_count or 0
    old_avg = float(acct.avg_rating or 5.0)
    new_count = old_count + 1
    new_avg = round(((old_avg * old_count) + payload.rating) / new_count, 2)
    acct.avg_rating = new_avg
    acct.rating_count = new_count

    await session.commit()
    await session.refresh(row)
    return DeliveryRatingResponse.model_validate(row)


# ── Unassigned orders (READY_FOR_DELIVERY, no delivery_order yet) ─────────

async def list_unassigned_orders(session: AsyncSession) -> list[UnassignedSourceOrder]:
    """
    Scan the pharmacy DB for orders with status = READY_FOR_DELIVERY
    that have no matching row in delivery_orders.
    Only pharmacy sector is supported right now.
    """
    from app.db.session import PharmacySessionLocal
    from app.models.pharmacy_merchant import CustomerPharmacyOrder, PharmacyProfile

    # IDs already assigned in the delivery DB
    assigned_result = await session.execute(
        select(DeliveryOrder.source_order_id).where(
            DeliveryOrder.sector == "pharmacy",
            DeliveryOrder.status.not_in(["REJECTED_BY_DRIVER", "CANCELLED"]),
        )
    )
    already_assigned = {row[0] for row in assigned_result.all()}

    unassigned: list[UnassignedSourceOrder] = []

    async with PharmacySessionLocal() as ph_session:
        ph_result = await ph_session.execute(
            select(CustomerPharmacyOrder).where(
                CustomerPharmacyOrder.status == "READY_FOR_DELIVERY"
            ).order_by(CustomerPharmacyOrder.created_at)
        )
        orders = ph_result.scalars().all()

        for o in orders:
            if o.order_id in already_assigned:
                continue

            # Get pharmacy lat/lng from profile
            pickup_lat = pickup_lng = None
            if o.account_id:
                prof_res = await ph_session.execute(
                    select(PharmacyProfile).where(PharmacyProfile.account_id == o.account_id)
                )
                prof = prof_res.scalar_one_or_none()
                if prof:
                    pickup_lat = float(prof.latitude) if prof.latitude else None
                    pickup_lng = float(prof.longitude) if prof.longitude else None

            notes = o.order_notes or {}
            dropoff_lat = notes.get("address_latitude")
            dropoff_lng = notes.get("address_longitude")
            bd = o.price_breakdown or {}

            unassigned.append(UnassignedSourceOrder(
                sector="pharmacy",
                source_order_id=o.order_id,
                pharmacy_name=o.pharmacy_name,
                pickup_lat=pickup_lat,
                pickup_lng=pickup_lng,
                dropoff_lat=float(dropoff_lat) if dropoff_lat else None,
                dropoff_lng=float(dropoff_lng) if dropoff_lng else None,
                cod_amount=float(bd.get("total", 0)) if (o.order_notes or {}).get("payment_mode") == "cod" else 0.0,
                order_value=float(bd.get("total", 0)),
                ready_since=o.updated_at if hasattr(o, "updated_at") else o.created_at,
            ))

    return unassigned


# ── Delivery Tracking (customer polls this) ───────────────────────────────

# Statuses where the delivery is actively in progress (driver has it)
_IN_TRANSIT_STATUSES = {
    "DELIVERY_ACCEPTED",
    "ARRIVED_AT_STORE",
    "ORDER_PICKED_UP",
    "ARRIVED_AT_CUSTOMER",
}


async def get_delivery_tracking(
    session: AsyncSession,
    source_order_id: UUID,
    customer_user_id: UUID,
) -> DeliveryTrackingResponse | None:
    """
    Called by the customer app on a polling interval.
    Returns the live driver location once the order is assigned and in transit.
    Returns None (404) when no active delivery order exists for this source order.
    Validates that the requesting user actually owns this pharmacy order before
    exposing any driver details.
    """
    # Cross-check: confirm this order belongs to the customer
    try:
        async with PharmacySessionLocal() as ph_sess:
            from app.models.pharmacy_merchant import CustomerPharmacyOrder
            ph_result = await ph_sess.execute(
                select(CustomerPharmacyOrder).where(
                    CustomerPharmacyOrder.order_id == source_order_id
                )
            )
            ph_order = ph_result.scalar_one_or_none()
            if ph_order is None or ph_order.user_id != customer_user_id:
                return None
    except Exception:
        return None

    # Find the delivery order for this source order
    d_result = await session.execute(
        select(DeliveryOrder).where(
            DeliveryOrder.source_order_id == source_order_id,
            DeliveryOrder.status.notin_(["REJECTED", "DELIVERED"]),
        ).order_by(DeliveryOrder.created_at.desc())
    )
    d = d_result.scalars().first()
    if d is None:
        return None

    # Fetch driver account for name + phone
    acct_result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.account_id == d.account_id)
    )
    acct = acct_result.scalar_one_or_none()

    driver_lat = float(acct.current_lat) if acct and acct.current_lat else None
    driver_lng = float(acct.current_lng) if acct and acct.current_lng else None
    # Phone is only revealed once the driver has actually picked up the order
    driver_phone = acct.phone_number if (acct and d.status in _IN_TRANSIT_STATUSES and d.picked_up_at) else None
    # Delivery PIN is revealed to customer once the order is out for delivery (picked up by driver)
    _PIN_VISIBLE_STATUSES = {"OUT_FOR_DELIVERY", "ORDER_PICKED_UP", "ARRIVED_AT_CUSTOMER"}
    delivery_pin = d.delivery_pin if d.status in _PIN_VISIBLE_STATUSES else None

    # Live OSRM road distance + ETA from driver's current position to customer dropoff
    road_km_to_customer: float | None = None
    eta_minutes: int | None = None
    if driver_lat and driver_lng and d.dropoff_lat and d.dropoff_lng:
        try:
            from app.services.customer_order_service import _osrm_road_distance_km
            import asyncio
            road_km_to_customer = await asyncio.get_event_loop().run_in_executor(
                None,
                _osrm_road_distance_km,
                driver_lat, driver_lng,
                float(d.dropoff_lat), float(d.dropoff_lng),
            )
            # Assume average speed of 30 km/h in city traffic
            eta_minutes = max(1, round(road_km_to_customer / 30 * 60))
        except Exception:
            pass

    return DeliveryTrackingResponse(
        delivery_order_id=d.delivery_order_id,
        status=d.status,
        driver_lat=driver_lat,
        driver_lng=driver_lng,
        driver_phone=driver_phone,
        driver_name=acct.full_name if acct else None,
        distance_km=float(d.distance_km) if d.distance_km else None,
        delivery_pin=delivery_pin,
        road_km_to_customer=road_km_to_customer,
        eta_minutes=eta_minutes,
    )
