import base64
import binascii
import math
import re
from datetime import UTC, datetime, time as time_type, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, generate_otp, hash_secret, verify_secret
from app.models.pharmacy_merchant import (
    PharmacyAvailabilityEvent,
    PharmacyAccount,
    PharmacyHoliday,
    PharmacyOperatingHours,
    PharmacyOtpChallenge,
    PharmacyProfile,
    PharmacyProductComment,
    PharmacyProduct,
    PharmacyStatusEvent,
)
from app.schemas.pharmacy import (
    PharmacyAccountResponse,
    PharmacyAdminUpdateRequest,
    PharmacyAvailabilityEventResponse,
    PharmacyAuthResponse,
    PharmacyOtpResponse,
    PharmacyProfileResponse,
    PharmacyRegisterRequest,
    PharmacyProductCreateRequest,
    PharmacyProductResponse,
    PharmacyProductCommentRequest,
    PharmacyProductCommentResponse,
    PharmacyProductReviewResponse,
    PharmacyProductUpdateRequest,
    NearbyPharmacyResponse,
    PharmacyStatusResponse,
    OperatingHoursItem,
    OperatingHoursResponse,
    HolidayResponse,
    PharmacyScheduleStatusResponse,
    PharmacyStatusEventResponse,
)
from app.services.realtime import create_notification, manager, serialize_notification
from app.services.phone import normalize_phone_number

OTP_TTL_SECONDS = 300
MAX_OTP_ATTEMPTS = 5
MAX_PRODUCT_IMAGE_BYTES = 3 * 1024 * 1024
EARTH_RADIUS_KM = 6371
SUPPORTED_PRODUCT_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
DATA_URL_PATTERN = re.compile(r"^data:(?P<mime>image/(?:jpeg|png|webp));base64,(?P<data>.+)$")


def decimal_string(value) -> str:
    return str(Decimal(str(value)).quantize(Decimal("0.01")))


def distance_km(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    delta_lat = math.radians(lat_b - lat_a)
    delta_lon = math.radians(lon_b - lon_a)
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(math.radians(lat_a)) * math.cos(math.radians(lat_b)) * math.sin(delta_lon / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def pharmacy_recommendation_metrics(profile: PharmacyProfile, distance: float) -> dict[str, float]:
    seed = sum(ord(character) for character in profile.store_name)
    response_time = 2.0 + (seed % 9) / 10
    fill_rate = 88.0 + (seed % 10)
    rating = 4.1 + (seed % 8) / 10
    distance_score = max(0, 100 - (distance / 5) * 100)
    response_score = max(0, 100 - ((response_time - 1.5) / 4) * 100)
    score = (distance_score * 0.4) + (response_score * 0.25) + (fill_rate * 0.25) + ((rating / 5) * 100 * 0.1)
    return {
        "response_time_minutes": round(response_time, 1),
        "fill_rate_percent": round(fill_rate, 1),
        "rating": round(min(rating, 5.0), 1),
        "recommendation_score": round(score, 2),
    }


def save_product_images(account_id, image_data_urls: list[str]) -> list[str]:
    settings = get_settings()
    product_dir = Path(settings.media_root) / "pharmacy-products" / str(account_id)
    product_dir.mkdir(parents=True, exist_ok=True)

    image_urls: list[str] = []
    for image_data_url in image_data_urls:
        match = DATA_URL_PATTERN.match(image_data_url)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Product photos must be JPG, PNG, or WebP images.",
            )

        mime_type = match.group("mime")
        extension = SUPPORTED_PRODUCT_IMAGE_TYPES[mime_type]
        try:
            image_bytes = base64.b64decode(match.group("data"), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more product photos could not be decoded.",
            ) from exc

        if len(image_bytes) > MAX_PRODUCT_IMAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Each product photo must be 3 MB or smaller.",
            )

        filename = f"{uuid4()}.{extension}"
        (product_dir / filename).write_bytes(image_bytes)
        image_urls.append(f"{settings.media_url}/pharmacy-products/{account_id}/{filename}")

    return image_urls


def serialize_pharmacy(
    account: PharmacyAccount,
    profile: PharmacyProfile,
) -> PharmacyAccountResponse:
    activation_status = "ACTIVE"
    if not account.is_active:
        activation_status = "INACTIVE" if account.activated_at else "PENDING_SUPER_ADMIN_APPROVAL"

    return PharmacyAccountResponse(
        account_id=account.account_id,
        owner_name=account.owner_name,
        phone_number=account.phone_number,
        email=account.email,
        is_active=account.is_active,
        activation_status=activation_status,
        profile=PharmacyProfileResponse(
            profile_id=profile.profile_id,
            store_name=profile.store_name,
            license_number=profile.license_number,
            address_line_1=profile.address_line_1,
            city=profile.city,
            state=profile.state,
            pincode=profile.pincode,
            latitude=profile.latitude,
            longitude=profile.longitude,
            product_commission_percent=str(profile.product_commission_percent),
            prescription_commission_percent=str(profile.prescription_commission_percent),
            platform_fee=str(profile.platform_fee),
            is_listed=profile.is_listed,
            is_online=profile.is_online,
            store_image_url=profile.store_image_url,
            drug_licence_url=profile.drug_licence_url,
            owner_id_url=profile.owner_id_url,
            photo_taken_at=profile.photo_taken_at,
            photo_lat=profile.photo_lat,
            photo_lng=profile.photo_lng,
        ),
    )


async def get_account_with_profile(
    session: AsyncSession,
    account_id,
) -> tuple[PharmacyAccount, PharmacyProfile] | None:
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.account_id == account_id)
    )
    row = result.one_or_none()
    if row is None:
        return None
    return row[0], row[1]


async def register_pharmacy(
    session: AsyncSession,
    payload: PharmacyRegisterRequest,
    store_image_url: str | None = None,
    drug_licence_url: str | None = None,
    owner_id_url: str | None = None,
    photo_taken_at=None,
    photo_lat: float | None = None,
    photo_lng: float | None = None,
) -> PharmacyAccountResponse:
    account = PharmacyAccount(
        owner_name=payload.owner_name.strip(),
        phone_number=normalize_phone_number(payload.phone_number),
        email=payload.email.lower() if payload.email else None,
    )
    session.add(account)
    await session.flush()

    profile = PharmacyProfile(
        account_id=account.account_id,
        store_name=payload.store_name.strip(),
        license_number=payload.license_number.strip().upper(),
        address_line_1=payload.address_line_1.strip(),
        city=payload.city.strip() if payload.city else None,
        state=payload.state.strip() if payload.state else None,
        pincode=payload.pincode.strip() if payload.pincode else None,
        latitude=payload.latitude,
        longitude=payload.longitude,
        store_image_url=store_image_url,
        drug_licence_url=drug_licence_url,
        owner_id_url=owner_id_url,
        photo_taken_at=photo_taken_at,
        photo_lat=photo_lat,
        photo_lng=photo_lng,
    )
    session.add(profile)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pharmacy with this phone, email, or license number already exists.",
        ) from exc

    await session.refresh(account)
    await session.refresh(profile)
    return serialize_pharmacy(account, profile)


async def request_pharmacy_otp(session: AsyncSession, phone_number: str) -> PharmacyOtpResponse:
    settings = get_settings()
    normalized_phone = normalize_phone_number(phone_number)

    result = await session.execute(
        select(PharmacyAccount).where(PharmacyAccount.phone_number == normalized_phone)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not registered.")

    otp = settings.mock_otp_code if settings.mock_otp_enabled else generate_otp()
    now = datetime.now(UTC)
    challenge = PharmacyOtpChallenge(
        phone_number=normalized_phone,
        otp_hash=hash_secret(otp),
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
    )
    session.add(challenge)
    await session.commit()

    return PharmacyOtpResponse(
        message="OTP generated successfully.",
        expires_in_seconds=OTP_TTL_SECONDS,
        development_otp=otp if settings.mock_otp_enabled else None,
    )


async def verify_pharmacy_otp(
    session: AsyncSession,
    phone_number: str,
    otp: str,
) -> PharmacyAuthResponse:
    normalized_phone = normalize_phone_number(phone_number)
    now = datetime.now(UTC)
    result = await session.execute(
        select(PharmacyOtpChallenge)
        .where(PharmacyOtpChallenge.phone_number == normalized_phone)
        .where(PharmacyOtpChallenge.consumed_at.is_(None))
        .where(PharmacyOtpChallenge.expires_at > now)
        .order_by(PharmacyOtpChallenge.created_at.desc())
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
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.phone_number == normalized_phone)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not registered.")

    account, profile = row[0], row[1]
    challenge.consumed_at = now
    await session.commit()

    return PharmacyAuthResponse(
        access_token=create_access_token(str(account.account_id), expire_minutes=43_200),  # 30 days
        pharmacy=serialize_pharmacy(account, profile),
    )


async def list_pending_pharmacy_vendors(session: AsyncSession) -> list[PharmacyAccountResponse]:
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.is_active == False, PharmacyAccount.activated_at.is_(None))
        .order_by(PharmacyAccount.created_at.asc())
    )
    return [serialize_pharmacy(acc, prof) for acc, prof in result.all()]


async def approve_pharmacy_vendor(session: AsyncSession, account_id) -> PharmacyAccountResponse:
    account_profile = await get_account_with_profile(session, account_id)
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not found.")
    account, profile = account_profile
    account.is_active = True
    account.activated_at = datetime.now(UTC)
    profile.is_listed = True
    await session.commit()
    await session.refresh(account)
    await session.refresh(profile)
    return serialize_pharmacy(account, profile)


async def reject_pharmacy_vendor(session: AsyncSession, account_id, reason: str | None = None) -> None:
    account_profile = await get_account_with_profile(session, account_id)
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not found.")
    account, _ = account_profile
    if account.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot reject an already active pharmacy.")
    account.activated_at = None
    import uuid as _uuid
    session.add(PharmacyStatusEvent(
        account_id=account_id,
        changed_by_admin_id=_uuid.UUID(int=0),
        status="REJECTED",
        comment=reason or "Registration rejected by super admin.",
    ))
    await session.commit()


async def activate_pharmacy(session: AsyncSession, account_id) -> PharmacyAccountResponse:
    account_profile = await get_account_with_profile(session, account_id)
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not found.")

    account, profile = account_profile
    account.is_active = True
    account.activated_at = datetime.now(UTC)
    profile.is_listed = True
    await session.commit()
    await session.refresh(account)
    await session.refresh(profile)

    return serialize_pharmacy(account, profile)


async def update_pharmacy_availability(
    session: AsyncSession,
    account: PharmacyAccount,
    profile: PharmacyProfile,
    is_online: bool,
) -> PharmacyAccountResponse:
    if not account.is_active or not profile.is_listed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only active and listed pharmacies can change online availability.",
        )

    if profile.is_online == is_online:
        return serialize_pharmacy(account, profile)

    profile.is_online = is_online
    profile.manual_override_at = datetime.now(UTC)
    session.add(
        PharmacyAvailabilityEvent(
            account_id=account.account_id,
            actor_type="PHARMACY",
            actor_id=account.account_id,
            is_online=is_online,
            comment="Pharmacy went online." if is_online else "Pharmacy went offline.",
        )
    )
    await session.commit()
    await session.refresh(account)
    await session.refresh(profile)
    return serialize_pharmacy(account, profile)


def _hours_to_response(row: PharmacyOperatingHours) -> OperatingHoursResponse:
    return OperatingHoursResponse(
        hours_id=row.hours_id,
        account_id=row.account_id,
        day_of_week=row.day_of_week,
        open_time=row.open_time,
        close_time=row.close_time,
        is_closed=row.is_closed,
    )


async def list_operating_hours(session: AsyncSession, account_id) -> list[OperatingHoursResponse]:
    result = await session.execute(
        select(PharmacyOperatingHours)
        .where(PharmacyOperatingHours.account_id == account_id)
        .order_by(PharmacyOperatingHours.day_of_week.asc())
    )
    return [_hours_to_response(row) for row in result.scalars().all()]


async def set_operating_hours(
    session: AsyncSession, account_id, days: list[OperatingHoursItem]
) -> list[OperatingHoursResponse]:
    """Replace the full weekly schedule for this pharmacy."""
    await session.execute(
        delete(PharmacyOperatingHours).where(PharmacyOperatingHours.account_id == account_id)
    )
    for day in days:
        session.add(
            PharmacyOperatingHours(
                account_id=account_id,
                day_of_week=day.day_of_week,
                open_time=day.open_time,
                close_time=day.close_time,
                is_closed=day.is_closed,
            )
        )
    await session.commit()
    return await list_operating_hours(session, account_id)


async def clear_operating_hours(session: AsyncSession, account_id) -> None:
    """Delete the auto-schedule entirely. is_online is left untouched (fails closed —
    the pharmacy freezes at whatever state it was last in)."""
    await session.execute(
        delete(PharmacyOperatingHours).where(PharmacyOperatingHours.account_id == account_id)
    )
    await session.commit()


async def list_holidays(session: AsyncSession, account_id) -> list[HolidayResponse]:
    result = await session.execute(
        select(PharmacyHoliday)
        .where(PharmacyHoliday.account_id == account_id)
        .order_by(PharmacyHoliday.holiday_date.asc())
    )
    return [
        HolidayResponse(
            holiday_id=row.holiday_id,
            account_id=row.account_id,
            holiday_date=row.holiday_date,
            reason=row.reason,
        )
        for row in result.scalars().all()
    ]


async def add_holiday(session: AsyncSession, account_id, holiday_date, reason: str | None) -> HolidayResponse:
    holiday = PharmacyHoliday(account_id=account_id, holiday_date=holiday_date, reason=reason)
    session.add(holiday)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A holiday is already set for this date.")
    await session.refresh(holiday)
    return HolidayResponse(
        holiday_id=holiday.holiday_id,
        account_id=holiday.account_id,
        holiday_date=holiday.holiday_date,
        reason=holiday.reason,
    )


async def delete_holiday(session: AsyncSession, account_id, holiday_id) -> None:
    await session.execute(
        delete(PharmacyHoliday)
        .where(PharmacyHoliday.account_id == account_id)
        .where(PharmacyHoliday.holiday_id == holiday_id)
    )
    await session.commit()


async def get_schedule_status(
    session: AsyncSession, account: PharmacyAccount, profile: PharmacyProfile
) -> PharmacyScheduleStatusResponse:
    today = datetime.now(UTC).date()
    holiday_result = await session.execute(
        select(PharmacyHoliday)
        .where(PharmacyHoliday.account_id == account.account_id)
        .where(PharmacyHoliday.holiday_date == today)
    )
    holiday = holiday_result.scalars().first()
    if holiday is not None:
        return PharmacyScheduleStatusResponse(
            account_id=account.account_id,
            has_schedule=True,
            is_online=profile.is_online,
            mode="HOLIDAY",
            message=f"Closed today for holiday{f': {holiday.reason}' if holiday.reason else ''}.",
        )

    hours_result = await session.execute(
        select(PharmacyOperatingHours).where(PharmacyOperatingHours.account_id == account.account_id)
    )
    has_schedule = len(hours_result.scalars().all()) > 0

    if not has_schedule:
        return PharmacyScheduleStatusResponse(
            account_id=account.account_id,
            has_schedule=False,
            is_online=profile.is_online,
            mode="NO_SCHEDULE",
            message=(
                f"No auto-schedule set — your shop will stay "
                f"{'online' if profile.is_online else 'offline'} until you manually change it."
            ),
        )

    if profile.manual_override_at is not None:
        return PharmacyScheduleStatusResponse(
            account_id=account.account_id,
            has_schedule=True,
            is_online=profile.is_online,
            mode="MANUAL_OVERRIDE",
            message="Manually overridden — will revert to your schedule at the next change.",
        )

    return PharmacyScheduleStatusResponse(
        account_id=account.account_id,
        has_schedule=True,
        is_online=profile.is_online,
        mode="AUTO",
        message=None,
    )


async def run_pharmacy_schedule_tick() -> dict:
    """Apply each pharmacy's auto-schedule + holiday calendar to is_online.

    Rules:
    - Holiday for today → force offline, always wins.
    - No weekly schedule rows → skip entirely (fail closed: frozen at last value).
    - Manual override set after the most recent schedule boundary today → skip
      (manual toggle holds until the next scheduled transition, then auto resumes).
    - Otherwise set is_online to whatever the weekly schedule says for "now".
    """
    from app.db.session import PharmacySessionLocal

    now = datetime.now(UTC)
    today = now.date()
    weekday = now.weekday()  # 0=Monday..6=Sunday, matches day_of_week convention
    now_time = now.time()

    applied = skipped_no_schedule = skipped_manual_override = holiday_closed = 0

    async with PharmacySessionLocal() as session:
        accounts_result = await session.execute(
            select(PharmacyAccount, PharmacyProfile)
            .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
            .where(PharmacyAccount.is_active.is_(True))
        )
        rows = accounts_result.all()

        for account, profile in rows:
            holiday_result = await session.execute(
                select(PharmacyHoliday)
                .where(PharmacyHoliday.account_id == account.account_id)
                .where(PharmacyHoliday.holiday_date == today)
            )
            holiday = holiday_result.scalars().first()

            if holiday is not None:
                if profile.is_online:
                    profile.is_online = False
                    profile.manual_override_at = None
                    session.add(
                        PharmacyAvailabilityEvent(
                            account_id=account.account_id,
                            actor_type="SCHEDULE",
                            is_online=False,
                            comment=f"Auto-closed for holiday{f': {holiday.reason}' if holiday.reason else ''}.",
                        )
                    )
                holiday_closed += 1
                continue

            hours_result = await session.execute(
                select(PharmacyOperatingHours)
                .where(PharmacyOperatingHours.account_id == account.account_id)
                .where(PharmacyOperatingHours.day_of_week == weekday)
            )
            today_hours = hours_result.scalars().first()

            if today_hours is None:
                skipped_no_schedule += 1
                continue

            if today_hours.is_closed:
                desired_online = False
            else:
                desired_online = today_hours.open_time <= now_time < today_hours.close_time

            if profile.manual_override_at is not None:
                # Find the next scheduled transition strictly after the override was set —
                # the override holds until then, regardless of what "now" currently says.
                override_time = profile.manual_override_at.time()
                if not today_hours.is_closed and override_time < today_hours.open_time:
                    next_boundary = datetime.combine(today, today_hours.open_time, tzinfo=UTC)
                elif not today_hours.is_closed and override_time < today_hours.close_time:
                    next_boundary = datetime.combine(today, today_hours.close_time, tzinfo=UTC)
                else:
                    # Past today's last transition (or today is fully closed) — next
                    # boundary is the start of the next day, a safe conservative fallback.
                    next_boundary = datetime.combine(today, time_type.max, tzinfo=UTC)
                if now < next_boundary:
                    skipped_manual_override += 1
                    continue

            if profile.is_online != desired_online:
                profile.is_online = desired_online
                profile.manual_override_at = None
                session.add(
                    PharmacyAvailabilityEvent(
                        account_id=account.account_id,
                        actor_type="SCHEDULE",
                        is_online=desired_online,
                        comment="Auto-opened by schedule." if desired_online else "Auto-closed by schedule.",
                    )
                )
                applied += 1

        await session.commit()

    return {
        "applied": applied,
        "skipped_no_schedule": skipped_no_schedule,
        "skipped_manual_override": skipped_manual_override,
        "holiday_closed": holiday_closed,
    }


async def list_pharmacies(session: AsyncSession) -> list[PharmacyAccountResponse]:
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .order_by(PharmacyAccount.created_at.desc())
    )
    return [serialize_pharmacy(account, profile) for account, profile in result.all()]


def serialize_status_event(event: PharmacyStatusEvent) -> PharmacyStatusEventResponse:
    return PharmacyStatusEventResponse(
        event_id=event.event_id,
        account_id=event.account_id,
        changed_by_admin_id=event.changed_by_admin_id,
        status=event.status,
        comment=event.comment,
        created_at=event.created_at,
    )


def serialize_availability_event(event: PharmacyAvailabilityEvent) -> PharmacyAvailabilityEventResponse:
    return PharmacyAvailabilityEventResponse(
        event_id=event.event_id,
        account_id=event.account_id,
        actor_type=event.actor_type,
        actor_id=event.actor_id,
        is_online=event.is_online,
        comment=event.comment,
        created_at=event.created_at,
    )


async def set_pharmacy_status(
    session: AsyncSession,
    account_id,
    is_active: bool,
    comment: str,
    changed_by_admin_id,
) -> PharmacyAccountResponse:
    trimmed_comment = comment.strip()
    if len(trimmed_comment) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment is required.",
        )

    account_profile = await get_account_with_profile(session, account_id)
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not found.")

    account, profile = account_profile
    account.is_active = is_active
    profile.is_listed = is_active
    if is_active and account.activated_at is None:
        account.activated_at = datetime.now(UTC)

    session.add(
        PharmacyStatusEvent(
            account_id=account.account_id,
            changed_by_admin_id=changed_by_admin_id,
            status="ACTIVE" if is_active else "INACTIVE",
            comment=trimmed_comment,
        )
    )
    await session.commit()
    await session.refresh(account)
    await session.refresh(profile)

    return serialize_pharmacy(account, profile)


async def update_pharmacy_details(
    session: AsyncSession,
    account_id,
    payload: PharmacyAdminUpdateRequest,
) -> PharmacyAccountResponse:
    account_profile = await get_account_with_profile(session, account_id)
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not found.")

    account, profile = account_profile
    account.owner_name = payload.owner_name.strip()
    account.phone_number = normalize_phone_number(payload.phone_number)
    account.email = payload.email.lower() if payload.email else None

    profile.store_name = payload.store_name.strip()
    profile.license_number = payload.license_number.strip().upper()
    profile.address_line_1 = payload.address_line_1.strip()
    profile.city = payload.city.strip() if payload.city else None
    profile.state = payload.state.strip() if payload.state else None
    profile.pincode = payload.pincode.strip() if payload.pincode else None
    profile.latitude = payload.latitude
    profile.longitude = payload.longitude
    profile.product_commission_percent = payload.product_commission_percent
    profile.prescription_commission_percent = payload.prescription_commission_percent
    profile.platform_fee = payload.platform_fee

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pharmacy with this phone, email, or license number already exists.",
        ) from exc

    await session.refresh(account)
    await session.refresh(profile)
    return serialize_pharmacy(account, profile)


async def list_pharmacy_timeline(session: AsyncSession, account_id) -> list[PharmacyStatusEventResponse]:
    result = await session.execute(
        select(PharmacyStatusEvent)
        .where(PharmacyStatusEvent.account_id == account_id)
        .order_by(PharmacyStatusEvent.created_at.desc())
    )
    return [serialize_status_event(event) for event in result.scalars().all()]


async def list_pharmacy_availability_events(
    session: AsyncSession,
    account_id,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[PharmacyAvailabilityEventResponse]:
    account_profile = await get_account_with_profile(session, account_id)
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not found.")

    query = select(PharmacyAvailabilityEvent).where(PharmacyAvailabilityEvent.account_id == account_id)
    if date_from is not None:
        query = query.where(PharmacyAvailabilityEvent.created_at >= date_from)
    if date_to is not None:
        query = query.where(PharmacyAvailabilityEvent.created_at <= date_to)

    result = await session.execute(query.order_by(PharmacyAvailabilityEvent.created_at.desc()))
    return [serialize_availability_event(event) for event in result.scalars().all()]


def serialize_product(
    product: PharmacyProduct,
    pharmacy_name: str | None = None,
) -> PharmacyProductResponse:
    price = Decimal(str(product.price))
    offer_price = Decimal(str(product.offer_price)) if product.offer_price is not None else None
    customer_price = offer_price if offer_price is not None else price
    discount_amount = None
    discount_percent = None
    if offer_price is not None:
        discount_amount = price - offer_price
        discount_percent = (discount_amount / price) * Decimal("100")

    return PharmacyProductResponse(
        product_id=product.product_id,
        account_id=product.account_id,
        pharmacy_name=pharmacy_name,
        product_name=product.product_name,
        brand=product.brand,
        category=product.category,
        unit_label=product.unit_label,
        price=decimal_string(price),
        offer_price=decimal_string(offer_price) if offer_price is not None else None,
        customer_price=decimal_string(customer_price),
        discount_amount=decimal_string(discount_amount) if discount_amount is not None else None,
        discount_percent=f"{discount_percent:.2f}" if discount_percent is not None else None,
        image_urls=product.image_urls or [],
        stock_quantity=product.stock_quantity,
        is_available=product.is_available,
        approval_status=product.approval_status,
        created_at=product.created_at,
    )


def serialize_product_comment(comment: PharmacyProductComment) -> PharmacyProductCommentResponse:
    return PharmacyProductCommentResponse(
        comment_id=comment.comment_id,
        product_id=comment.product_id,
        account_id=comment.account_id,
        actor_type=comment.actor_type,
        actor_id=comment.actor_id,
        action=comment.action,
        comment=comment.comment,
        created_at=comment.created_at,
    )


def earning_breakdown(product: PharmacyProduct, profile: PharmacyProfile) -> dict[str, str]:
    unit_price = Decimal(str(product.offer_price if product.offer_price is not None else product.price))
    commission_percent = Decimal(str(profile.product_commission_percent))
    platform_fee = Decimal(str(profile.platform_fee))
    platform_commission = (unit_price * commission_percent / Decimal("100")).quantize(Decimal("0.01"))
    platform_earning = platform_commission + platform_fee
    pharmacy_payable = unit_price - platform_commission - platform_fee
    if pharmacy_payable < 0:
        pharmacy_payable = Decimal("0.00")
    return {
        "product_commission_percent": decimal_string(commission_percent),
        "platform_fee": decimal_string(platform_fee),
        "platform_commission_amount": decimal_string(platform_commission),
        "platform_fee_amount": decimal_string(platform_fee),
        "platform_earning_amount": decimal_string(platform_earning),
        "pharmacy_payable_amount": decimal_string(pharmacy_payable),
    }


async def list_product_comments(session: AsyncSession, product_id) -> list[PharmacyProductCommentResponse]:
    result = await session.execute(
        select(PharmacyProductComment)
        .where(PharmacyProductComment.product_id == product_id)
        .order_by(PharmacyProductComment.created_at.asc())
    )
    return [serialize_product_comment(comment) for comment in result.scalars().all()]


async def serialize_product_review(
    session: AsyncSession,
    product: PharmacyProduct,
    profile: PharmacyProfile,
) -> PharmacyProductReviewResponse:
    product_payload = serialize_product(product, profile.store_name).model_dump()
    return PharmacyProductReviewResponse(
        **product_payload,
        **earning_breakdown(product, profile),
        comments=await list_product_comments(session, product.product_id),
    )


async def create_pharmacy_product(
    session: AsyncSession,
    account: PharmacyAccount,
    profile: PharmacyProfile,
    payload: PharmacyProductCreateRequest,
) -> PharmacyProductResponse:
    if not account.is_active or not profile.is_listed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pharmacy must be approved by super admin before adding products.",
        )

    if payload.offer_price is not None and payload.offer_price >= payload.price:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Offer price must be lower than product price.",
        )

    image_urls = save_product_images(account.account_id, payload.image_data_urls)

    product = PharmacyProduct(
        account_id=account.account_id,
        product_name=payload.product_name.strip(),
        brand=payload.brand.strip() if payload.brand else None,
        category=payload.category.strip() if payload.category else None,
        unit_label=payload.unit_label.strip() if payload.unit_label else None,
        price=payload.price,
        offer_price=payload.offer_price,
        image_urls=image_urls,
        stock_quantity=payload.stock_quantity,
        is_available=payload.is_available,
        approval_status="PENDING_APPROVAL",
        submitted_at=datetime.now(UTC),
    )
    session.add(product)
    await session.commit()
    await session.refresh(product)

    notification = await create_notification(
        session,
        target_type="SUPER_ADMIN",
        target_id=None,
        event_type="PRODUCT_SUBMITTED",
        title="New product pending approval",
        message=f"{profile.store_name} submitted {product.product_name}.",
        payload={
            "product_id": str(product.product_id),
            "account_id": str(account.account_id),
            "redirect_url": f"/dashboard/pharmacy/products?product_id={product.product_id}",
        },
    )
    await session.commit()
    await manager.send_super_admin({"type": "notification", **serialize_notification(notification)})

    return serialize_product(product, profile.store_name)


async def list_own_products(
    session: AsyncSession,
    account: PharmacyAccount,
    profile: PharmacyProfile,
) -> list[PharmacyProductResponse]:
    result = await session.execute(
        select(PharmacyProduct)
        .where(PharmacyProduct.account_id == account.account_id)
        .order_by(PharmacyProduct.created_at.desc())
    )
    return [serialize_product(product, profile.store_name) for product in result.scalars().all()]


async def update_pharmacy_product(
    session: AsyncSession,
    account: PharmacyAccount,
    profile: PharmacyProfile,
    product_id,
    payload: PharmacyProductUpdateRequest,
) -> PharmacyProductResponse:
    result = await session.execute(
        select(PharmacyProduct)
        .where(PharmacyProduct.product_id == product_id)
        .where(PharmacyProduct.account_id == account.account_id)
    )
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    if payload.offer_price is not None and payload.offer_price >= payload.price:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Offer price must be lower than product price.",
        )

    product.product_name = payload.product_name.strip()
    product.brand = payload.brand.strip() if payload.brand else None
    product.category = payload.category.strip() if payload.category else None
    product.unit_label = payload.unit_label.strip() if payload.unit_label else None
    product.price = payload.price
    product.offer_price = payload.offer_price
    product.stock_quantity = payload.stock_quantity
    product.is_available = payload.is_available
    product.updated_at = datetime.now(UTC)

    await session.commit()
    await session.refresh(product)
    return serialize_product(product, profile.store_name)


async def resubmit_pharmacy_product(
    session: AsyncSession,
    account: PharmacyAccount,
    profile: PharmacyProfile,
    product_id,
    payload: PharmacyProductCommentRequest,
) -> PharmacyProductResponse:
    result = await session.execute(
        select(PharmacyProduct)
        .where(PharmacyProduct.product_id == product_id)
        .where(PharmacyProduct.account_id == account.account_id)
    )
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product.approval_status = "PENDING_APPROVAL"
    product.submitted_at = datetime.now(UTC)
    product.revision_requested_at = None
    product.updated_at = datetime.now(UTC)
    session.add(
        PharmacyProductComment(
            product_id=product.product_id,
            account_id=account.account_id,
            actor_type="PHARMACY",
            actor_id=account.account_id,
            action="RESUBMITTED",
            comment=payload.comment.strip(),
        )
    )
    notification = await create_notification(
        session,
        target_type="SUPER_ADMIN",
        target_id=None,
        event_type="PRODUCT_RESUBMITTED",
        title="Product resubmitted",
        message=f"{profile.store_name} modified {product.product_name}.",
        payload={
            "product_id": str(product.product_id),
            "account_id": str(account.account_id),
            "redirect_url": f"/dashboard/pharmacy/products?product_id={product.product_id}",
        },
    )
    await session.commit()
    await session.refresh(product)
    await manager.send_super_admin({"type": "notification", **serialize_notification(notification)})
    return serialize_product(product, profile.store_name)


async def list_products_for_review(session: AsyncSession) -> list[PharmacyProductReviewResponse]:
    result = await session.execute(
        select(PharmacyProduct, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyProduct.account_id)
        .where(PharmacyProduct.approval_status.in_(["PENDING_APPROVAL", "NEEDS_REVISION"]))
        .order_by(PharmacyProduct.updated_at.desc())
    )
    reviews = []
    for product, profile in result.all():
        reviews.append(await serialize_product_review(session, product, profile))
    return reviews


async def approve_product(
    session: AsyncSession,
    product_id,
    admin_id,
) -> PharmacyProductReviewResponse:
    result = await session.execute(
        select(PharmacyProduct, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyProduct.account_id)
        .where(PharmacyProduct.product_id == product_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product, profile = row[0], row[1]
    product.approval_status = "APPROVED"
    product.approved_at = datetime.now(UTC)
    product.approved_by_admin_id = admin_id
    product.updated_at = datetime.now(UTC)
    session.add(
        PharmacyProductComment(
            product_id=product.product_id,
            account_id=product.account_id,
            actor_type="SUPER_ADMIN",
            actor_id=admin_id,
            action="APPROVED",
            comment="Approved for customer listing.",
        )
    )
    notification = await create_notification(
        session,
        target_type="PHARMACY",
        target_id=product.account_id,
        event_type="PRODUCT_APPROVED",
        title="Product approved",
        message=f"{product.product_name} is now live for customers.",
        payload={
            "product_id": str(product.product_id),
            "redirect_url": f"/products?product_id={product.product_id}",
        },
    )
    await session.commit()
    await session.refresh(product)
    await manager.send_pharmacy(product.account_id, {"type": "notification", **serialize_notification(notification)})
    return await serialize_product_review(session, product, profile)


async def request_product_revision(
    session: AsyncSession,
    product_id,
    admin_id,
    payload: PharmacyProductCommentRequest,
) -> PharmacyProductReviewResponse:
    result = await session.execute(
        select(PharmacyProduct, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyProduct.account_id)
        .where(PharmacyProduct.product_id == product_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product, profile = row[0], row[1]
    product.approval_status = "NEEDS_REVISION"
    product.revision_requested_at = datetime.now(UTC)
    product.updated_at = datetime.now(UTC)
    session.add(
        PharmacyProductComment(
            product_id=product.product_id,
            account_id=product.account_id,
            actor_type="SUPER_ADMIN",
            actor_id=admin_id,
            action="NEEDS_REVISION",
            comment=payload.comment.strip(),
        )
    )
    notification = await create_notification(
        session,
        target_type="PHARMACY",
        target_id=product.account_id,
        event_type="PRODUCT_NEEDS_REVISION",
        title="Product needs revision",
        message=payload.comment.strip(),
        payload={
            "product_id": str(product.product_id),
            "redirect_url": f"/products?product_id={product.product_id}&edit=1",
        },
    )
    await session.commit()
    await session.refresh(product)
    await manager.send_pharmacy(product.account_id, {"type": "notification", **serialize_notification(notification)})
    return await serialize_product_review(session, product, profile)


async def list_customer_visible_products(session: AsyncSession) -> list[PharmacyProductResponse]:
    result = await session.execute(
        select(PharmacyProduct, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyProduct.account_id)
        .join(PharmacyAccount, PharmacyAccount.account_id == PharmacyProduct.account_id)
        .where(PharmacyAccount.is_active.is_(True))
        .where(PharmacyProfile.is_listed.is_(True))
        .where(PharmacyProfile.is_online.is_(True))
        .where(PharmacyProduct.is_available.is_(True))
        .where(PharmacyProduct.approval_status == "APPROVED")
        .order_by(PharmacyProduct.product_name.asc())
    )
    return [serialize_product(product, profile.store_name) for product, profile in result.all()]


async def get_pharmacy_status(session: AsyncSession, account_id: UUID) -> PharmacyStatusResponse:
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.account_id == account_id)
        .where(PharmacyAccount.is_active.is_(True))
        .where(PharmacyProfile.is_listed.is_(True))
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Pharmacy not found or no longer listed.")
    account, profile = row
    return PharmacyStatusResponse(
        account_id=account.account_id,
        store_name=profile.store_name,
        is_online=profile.is_online,
    )


async def list_nearby_pharmacies(
    session: AsyncSession,
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
) -> list[NearbyPharmacyResponse]:
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.is_active.is_(True))
        .where(PharmacyProfile.is_listed.is_(True))
        .where(PharmacyProfile.is_online.is_(True))
        .where(PharmacyProfile.latitude.is_not(None))
        .where(PharmacyProfile.longitude.is_not(None))
    )
    nearby = []
    for account, profile in result.all():
        distance = distance_km(latitude, longitude, profile.latitude, profile.longitude)
        if distance <= radius_km:
            metrics = pharmacy_recommendation_metrics(profile, distance)
            nearby.append(
                NearbyPharmacyResponse(
                    account_id=account.account_id,
                    store_name=profile.store_name,
                    address_line_1=profile.address_line_1,
                    city=profile.city,
                    pincode=profile.pincode,
                    latitude=profile.latitude,
                    longitude=profile.longitude,
                    is_online=profile.is_online,
                    distance_km=round(distance, 2),
                    **metrics,
                )
            )
    return sorted(nearby, key=lambda item: (-item.recommendation_score, item.distance_km))
