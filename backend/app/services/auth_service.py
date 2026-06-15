from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, generate_otp, hash_secret, verify_secret
from app.models.auth import OtpChallenge
from app.models.user import User
from app.schemas.auth import AuthResponse, OtpRequestResponse, RegisterRequest, UserResponse
from app.services.phone import normalize_phone_number

OTP_TTL_SECONDS = 300
MAX_OTP_ATTEMPTS = 5


def serialize_user(user: User) -> UserResponse:
    return UserResponse(
        id=user.user_id,
        phone_number=user.phone_number,
        email=user.email,
        full_name=user.full_name,
        wallet_balance=str(user.wallet_balance),
    )


async def register_user(session: AsyncSession, payload: RegisterRequest) -> UserResponse:
    phone_number = normalize_phone_number(payload.phone_number)
    user = User(
        phone_number=phone_number,
        email=payload.email.lower() if payload.email else None,
        full_name=payload.full_name.strip(),
    )
    session.add(user)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this phone number or email already exists.",
        ) from exc

    await session.refresh(user)
    return serialize_user(user)


async def request_otp(session: AsyncSession, phone_number: str) -> OtpRequestResponse:
    settings = get_settings()
    normalized_phone = normalize_phone_number(phone_number)
    otp = settings.mock_otp_code if settings.mock_otp_enabled else generate_otp()
    now = datetime.now(UTC)

    challenge = OtpChallenge(
        phone_number=normalized_phone,
        otp_hash=hash_secret(otp),
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
    )
    session.add(challenge)
    await session.commit()

    return OtpRequestResponse(
        message="OTP generated successfully.",
        expires_in_seconds=OTP_TTL_SECONDS,
        development_otp=otp if settings.mock_otp_enabled else None,
    )


async def verify_otp(session: AsyncSession, phone_number: str, otp: str) -> AuthResponse:
    normalized_phone = normalize_phone_number(phone_number)
    now = datetime.now(UTC)

    result = await session.execute(
        select(OtpChallenge)
        .where(OtpChallenge.phone_number == normalized_phone)
        .where(OtpChallenge.consumed_at.is_(None))
        .where(OtpChallenge.expires_at > now)
        .order_by(OtpChallenge.created_at.desc())
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

    user_result = await session.execute(select(User).where(User.phone_number == normalized_phone))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered user found for this phone number.",
        )

    challenge.consumed_at = now
    await session.commit()

    return AuthResponse(
        access_token=create_access_token(str(user.user_id), expire_minutes=43_200),  # 30 days
        user=serialize_user(user),
    )

