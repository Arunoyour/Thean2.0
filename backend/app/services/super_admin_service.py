from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, generate_otp, hash_secret, verify_secret
from app.models.super_admin import SuperAdmin, SuperAdminOtpChallenge
from app.schemas.super_admin import SuperAdminAuthResponse, SuperAdminOtpResponse, SuperAdminResponse
from app.services.phone import normalize_phone_number

OTP_TTL_SECONDS = 300
MAX_OTP_ATTEMPTS = 5


def serialize_super_admin(admin: SuperAdmin) -> SuperAdminResponse:
    return SuperAdminResponse(
        admin_id=admin.admin_id,
        full_name=admin.full_name,
        email=admin.email,
        phone_number=admin.phone_number,
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
        access_token=create_access_token(str(admin.admin_id)),
        admin=serialize_super_admin(admin),
    )

