import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, generate_otp, hash_secret, verify_secret
from app.models.super_admin import SuperAdmin, SuperAdminOtpChallenge
from app.schemas.super_admin import (
    CreateAdminRequest,
    SuperAdminAuthResponse,
    SuperAdminOtpResponse,
    SuperAdminResponse,
)
from app.services.phone import normalize_phone_number

OTP_TTL_SECONDS = 300
MAX_OTP_ATTEMPTS = 5


def serialize_super_admin(admin: SuperAdmin) -> SuperAdminResponse:
    return SuperAdminResponse(
        admin_id=admin.admin_id,
        full_name=admin.full_name,
        email=admin.email,
        phone_number=admin.phone_number,
        role=admin.role,
        is_active=admin.is_active,
    )


async def request_super_admin_otp(session: AsyncSession, phone_number: str) -> SuperAdminOtpResponse:
    settings = get_settings()
    normalized_phone = normalize_phone_number(phone_number)

    result = await session.execute(
        select(SuperAdmin)
        .where(SuperAdmin.phone_number == normalized_phone)
        .where(SuperAdmin.is_active.is_(True))
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Super admin not found.")

    otp = settings.mock_otp_code if settings.mock_otp_enabled else generate_otp()
    now = datetime.now(UTC)
    challenge = SuperAdminOtpChallenge(
        phone_number=normalized_phone,
        otp_hash=hash_secret(otp),
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
    )
    session.add(challenge)
    await session.commit()

    return SuperAdminOtpResponse(
        message="OTP generated successfully.",
        expires_in_seconds=OTP_TTL_SECONDS,
        development_otp=otp if settings.mock_otp_enabled else None,
    )


async def verify_super_admin_otp(
    session: AsyncSession,
    phone_number: str,
    otp: str,
) -> SuperAdminAuthResponse:
    normalized_phone = normalize_phone_number(phone_number)
    now = datetime.now(UTC)

    result = await session.execute(
        select(SuperAdminOtpChallenge)
        .where(SuperAdminOtpChallenge.phone_number == normalized_phone)
        .where(SuperAdminOtpChallenge.consumed_at.is_(None))
        .where(SuperAdminOtpChallenge.expires_at > now)
        .order_by(SuperAdminOtpChallenge.created_at.desc())
        .limit(1)
    )
    challenge = result.scalar_one_or_none()
    if challenge is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired or missing.")

    if challenge.attempts >= MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts.")

    if not verify_secret(otp, challenge.otp_hash):
        challenge.attempts += 1
        await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP.")

    result = await session.execute(
        select(SuperAdmin)
        .where(SuperAdmin.phone_number == normalized_phone)
        .where(SuperAdmin.is_active.is_(True))
    )
    admin = result.scalar_one_or_none()
    if admin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Super admin not found.")

    challenge.consumed_at = now
    await session.commit()

    return SuperAdminAuthResponse(
        access_token=create_access_token(
            str(admin.admin_id),
            extra_claims={"role": admin.role},
        ),
        admin=serialize_super_admin(admin),
    )


# ── Admin management (SUPER only) ─────────────────────────────────────────────

async def list_admins(session: AsyncSession) -> list[SuperAdmin]:
    result = await session.execute(
        select(SuperAdmin).order_by(SuperAdmin.created_at)
    )
    return list(result.scalars().all())


async def create_admin(session: AsyncSession, payload: CreateAdminRequest) -> SuperAdmin:
    normalized_phone = normalize_phone_number(payload.phone_number)

    existing = await session.scalar(
        select(SuperAdmin).where(SuperAdmin.phone_number == normalized_phone)
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already registered.")

    existing_email = await session.scalar(
        select(SuperAdmin).where(SuperAdmin.email == payload.email)
    )
    if existing_email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    admin = SuperAdmin(
        full_name=payload.full_name,
        email=payload.email,
        phone_number=normalized_phone,
        role=payload.role,
        is_active=True,
    )
    session.add(admin)
    await session.commit()
    await session.refresh(admin)
    return admin


async def update_admin_role(
    session: AsyncSession, target_admin_id: uuid.UUID, new_role: str
) -> SuperAdmin:
    admin = await session.scalar(
        select(SuperAdmin).where(SuperAdmin.admin_id == target_admin_id)
    )
    if admin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found.")
    if admin.role == "SUPER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change the role of the SUPER account.",
        )
    admin.role = new_role
    await session.commit()
    await session.refresh(admin)
    return admin


async def deactivate_admin(
    session: AsyncSession, target_admin_id: uuid.UUID, requesting_admin_id: uuid.UUID
) -> SuperAdmin:
    if target_admin_id == requesting_admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )
    admin = await session.scalar(
        select(SuperAdmin).where(SuperAdmin.admin_id == target_admin_id)
    )
    if admin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found.")
    if admin.role == "SUPER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot deactivate the SUPER account.",
        )
    admin.is_active = False
    await session.commit()
    await session.refresh(admin)
    return admin

