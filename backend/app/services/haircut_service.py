"""Haircut booking service — all core business logic lives here."""
import math
import random
import string
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select

from app.core.config import get_settings
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.haircut import (
    BarberShop,
    CustomerHaircutFavorite,
    CustomerHaircutToken,
    HaircutBooking,
    HaircutBookingService,
    HaircutReview,
    HaircutTokenTransaction,
    HaircutVendorAccount,
    ShopClosure,
    ShopHours,
    ShopService,
)
from app.schemas.haircut import (
    AdminBookingListItem,
    AdminCreateClosureRequest,
    AdminDayBooking,
    AdminDayDetail,
    AdminShopDetail,
    AdminShopListItem,
    AdminVendorListItem,
    BookingHistoryItem,
    BookingResponse,
    BookingServiceSnapshot,
    ClosureResponse,
    CreateBookingRequest,
    CreateClosureRequest,
    CreateServiceRequest,
    FavoriteActionResponse,
    HolidayModeWarning,
    ManualCheckinRequest,
    NearbyShopResponse,
    RescheduleBookingRequest,
    ReviewResponse,
    ServiceResponse,
    SetShopHoursRequest,
    ShopAvailabilityResponse,
    ShopDetailResponse,
    ShopHoursResponse,
    ShopResponse,
    ShopSetupRequest,
    SubmitReviewRequest,
    TimeSlot,
    TokenBalanceResponse,
    UpdateServiceRequest,
    VendorAuthResponse,
    VendorRegisterRequest,
    VendorRequestOtpRequest,
    VendorVerifyOtpRequest,
)

GEOFENCE_RADIUS_METRES = 50
MANUAL_CHECKIN_WINDOW_MINUTES = 30
CANCEL_BLOCK_MINUTES = 60          # bookings within this window cannot be cancelled
SLOT_MINUTES = 30                  # display granularity for the time-picker
NO_SHOW_GRACE_MINUTES = 30         # cron marks no-show this many minutes after appointment
DEFAULT_OPENING_TIME = time(10, 0)  # used when a vendor hasn't configured hours yet
DEFAULT_CLOSING_TIME = time(19, 0)


# ── Helpers ───────────────────────────────────────────────────────────────

def _gen_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _haversine_metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Approximate distance in metres between two lat/lng points."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _booking_to_response(b: HaircutBooking, shop: BarberShop | None, services: list[HaircutBookingService]) -> BookingResponse:
    return BookingResponse(
        booking_id=b.booking_id,
        shop_id=b.shop_id,
        shop_name=shop.shop_name if shop else None,
        shop_lat=float(shop.lat) if shop and shop.lat else None,
        shop_lng=float(shop.lng) if shop and shop.lng else None,
        customer_id=b.customer_id,
        appointment_date=b.appointment_date,
        start_time=b.start_time,
        total_duration_minutes=b.total_duration_minutes,
        total_fee=float(b.total_fee),
        status=b.status,
        otp_code=b.otp_code,
        services=[
            BookingServiceSnapshot(
                service_id=s.service_id,
                service_name=s.service_name,
                fee=float(s.fee),
                duration_minutes=s.duration_minutes,
            )
            for s in services
        ],
        manual_checkin_requested_at=b.manual_checkin_requested_at,
        reschedule_count=b.reschedule_count,
        created_at=b.created_at,
    )


# ── Token ledger ──────────────────────────────────────────────────────────

async def _get_or_create_token_row(session: AsyncSession, customer_id: UUID) -> CustomerHaircutToken:
    row = await session.get(CustomerHaircutToken, customer_id)
    if row is None:
        row = CustomerHaircutToken(customer_id=customer_id)
        session.add(row)
        await session.flush()
    return row


async def _debit_token(session: AsyncSession, customer_id: UUID, booking_id: UUID, reason: str) -> None:
    row = await _get_or_create_token_row(session, customer_id)
    if row.balance < 1:
        raise HTTPException(status_code=400, detail="Insufficient booking tokens. You need at least 1 token to book.")
    row.balance -= 1
    row.updated_at = datetime.now(UTC)
    session.add(HaircutTokenTransaction(customer_id=customer_id, booking_id=booking_id, change=-1, reason=reason))


async def _credit_token(session: AsyncSession, customer_id: UUID, booking_id: UUID, reason: str) -> None:
    row = await _get_or_create_token_row(session, customer_id)
    row.balance += 1
    row.updated_at = datetime.now(UTC)
    session.add(HaircutTokenTransaction(customer_id=customer_id, booking_id=booking_id, change=+1, reason=reason))


# ── Vendor auth ───────────────────────────────────────────────────────────

async def vendor_register(
    session: AsyncSession,
    payload: VendorRegisterRequest,
    shop_image_path: str | None = None,
    licence_path: str | None = None,
    owner_id_path: str | None = None,
) -> dict:
    existing = await session.execute(
        select(HaircutVendorAccount).where(HaircutVendorAccount.phone == payload.phone.strip())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Phone number already registered.")
    account = HaircutVendorAccount(
        full_name=payload.full_name.strip(),
        email=payload.email.lower().strip() if payload.email else None,
        phone=payload.phone.strip(),
        owner_address=payload.owner_address,
        licence_url=licence_path,
        owner_id_url=owner_id_path,
        account_status="pending",
    )
    session.add(account)
    await session.flush()  # get account_id before creating shop

    shop = BarberShop(
        vendor_id=account.account_id,
        shop_name=payload.shop_name.strip(),
        address_line=payload.shop_address,
        pin_code=payload.pin_code,
        lat=payload.lat,
        lng=payload.lng,
        shop_image_url=shop_image_path,
        shop_status="pending",
    )
    session.add(shop)
    await session.commit()
    # Send OTP so vendor can complete verification
    return await vendor_request_otp(session, payload.phone.strip())


async def vendor_request_otp(session: AsyncSession, phone: str) -> dict:
    result = await session.execute(
        select(HaircutVendorAccount).where(HaircutVendorAccount.phone == phone.strip())
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="No vendor account found for this number. Please register first.")
    if account.account_status == "suspended":
        raise HTTPException(status_code=403, detail="Account is suspended.")

    settings = get_settings()
    otp = settings.mock_otp_code if settings.mock_otp_enabled else _gen_otp()
    account.otp_code = otp
    account.otp_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    account.updated_at = datetime.now(UTC)
    await session.commit()
    return {
        "message": f"OTP sent to {phone}.",
        "otp": otp if settings.mock_otp_enabled else None,
    }


async def vendor_verify_otp(session: AsyncSession, phone: str, otp: str) -> HaircutVendorAccount:
    result = await session.execute(
        select(HaircutVendorAccount).where(HaircutVendorAccount.phone == phone.strip())
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    if account.account_status == "suspended":
        raise HTTPException(status_code=403, detail="Account is suspended.")
    if not account.otp_code or account.otp_code != otp:
        raise HTTPException(status_code=401, detail="Invalid OTP.")
    if account.otp_expires_at and datetime.now(UTC) > account.otp_expires_at:
        raise HTTPException(status_code=401, detail="OTP has expired. Please request a new one.")

    account.otp_code = None
    account.otp_expires_at = None
    account.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(account)
    return account


# ── Shop setup ────────────────────────────────────────────────────────────

async def setup_shop(session: AsyncSession, vendor_id: UUID, payload: ShopSetupRequest) -> BarberShop:
    existing = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Shop already created. Use PATCH to update.")
    shop = BarberShop(
        vendor_id=vendor_id,
        shop_name=payload.shop_name,
        phone=payload.phone,
        total_chairs=payload.total_chairs,
        address_line=payload.address_line,
        lat=payload.lat,
        lng=payload.lng,
    )
    session.add(shop)
    await session.commit()
    await session.refresh(shop)
    return shop


async def update_shop(session: AsyncSession, vendor_id: UUID, payload: ShopSetupRequest) -> BarberShop:
    result = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found. Run initial setup first.")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(shop, field, val)
    shop.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(shop)
    return shop


async def get_vendor_shop(session: AsyncSession, vendor_id: UUID) -> BarberShop:
    result = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not set up yet.")
    return shop


# ── Shop hours ────────────────────────────────────────────────────────────

async def set_shop_hours(session: AsyncSession, shop_id: UUID, payload: SetShopHoursRequest) -> list[ShopHours]:
    # Upsert all 7 days in one go
    for entry in payload.hours:
        result = await session.execute(
            select(ShopHours).where(ShopHours.shop_id == shop_id, ShopHours.day_of_week == entry.day_of_week)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = ShopHours(shop_id=shop_id, day_of_week=entry.day_of_week)
            session.add(row)
        row.is_open = entry.is_open
        row.opening_time = entry.opening_time
        row.closing_time = entry.closing_time
    await session.commit()
    result = await session.execute(select(ShopHours).where(ShopHours.shop_id == shop_id).order_by(ShopHours.day_of_week))
    return list(result.scalars().all())


async def get_shop_hours(session: AsyncSession, shop_id: UUID) -> list[ShopHours]:
    result = await session.execute(select(ShopHours).where(ShopHours.shop_id == shop_id).order_by(ShopHours.day_of_week))
    return list(result.scalars().all())


# ── Holiday / closure mode ────────────────────────────────────────────────

async def check_holiday_warning(session: AsyncSession, shop_id: UUID, closure_date: date) -> HolidayModeWarning:
    """Returns how many active bookings exist on that date (vendor confirms before creating closure)."""
    result = await session.execute(
        select(HaircutBooking.booking_id).where(
            HaircutBooking.shop_id == shop_id,
            HaircutBooking.appointment_date == closure_date,
            HaircutBooking.status.in_(["PENDING", "CONFIRMED"]),
        )
    )
    booking_ids = list(result.scalars().all())
    return HolidayModeWarning(
        closure_date=closure_date,
        existing_booking_count=len(booking_ids),
        booking_ids=booking_ids,
    )


async def confirm_create_closure(session: AsyncSession, shop_id: UUID, payload: CreateClosureRequest) -> ClosureResponse:
    """
    Creates a closure and cancels all existing bookings on that date.
    Refunds tokens for canceled bookings that were >1 hr away at the time.
    """
    # Cancel affected bookings first
    result = await session.execute(
        select(HaircutBooking).where(
            HaircutBooking.shop_id == shop_id,
            HaircutBooking.appointment_date == payload.closure_date,
            HaircutBooking.status.in_(["PENDING", "CONFIRMED"]),
        )
    )
    for booking in result.scalars().all():
        booking.status = "CANCELED"
        booking.cancel_reason = f"Shop closed: {payload.reason or 'Holiday mode'}"
        booking.cancel_requested_at = datetime.now(UTC)
        booking.updated_at = datetime.now(UTC)
        if booking.token_held and not booking.token_refunded:
            await _credit_token(session, booking.customer_id, booking.booking_id, "CANCEL_REFUND")
            booking.token_refunded = True
            booking.token_held = False

    # Insert closure row
    existing = await session.execute(
        select(ShopClosure).where(ShopClosure.shop_id == shop_id, ShopClosure.closure_date == payload.closure_date)
    )
    closure = existing.scalar_one_or_none()
    if closure is None:
        closure = ShopClosure(shop_id=shop_id, closure_date=payload.closure_date, reason=payload.reason)
        session.add(closure)
    else:
        closure.reason = payload.reason

    await session.commit()
    await session.refresh(closure)
    return ClosureResponse.model_validate(closure)


async def delete_closure(session: AsyncSession, shop_id: UUID, closure_date: date) -> None:
    result = await session.execute(
        select(ShopClosure).where(ShopClosure.shop_id == shop_id, ShopClosure.closure_date == closure_date)
    )
    row = result.scalar_one_or_none()
    if row:
        await session.delete(row)
        await session.commit()


# ── Services ──────────────────────────────────────────────────────────────

async def create_service(session: AsyncSession, shop_id: UUID, payload: CreateServiceRequest) -> ShopService:
    svc = ShopService(
        shop_id=shop_id,
        service_name=payload.service_name,
        fee=payload.fee,
        duration_minutes=payload.duration_minutes,
        display_order=payload.display_order,
    )
    session.add(svc)
    await session.commit()
    await session.refresh(svc)
    return svc


async def list_services(session: AsyncSession, shop_id: UUID) -> list[ShopService]:
    result = await session.execute(select(ShopService).where(ShopService.shop_id == shop_id).order_by(ShopService.display_order, ShopService.created_at))
    return list(result.scalars().all())


async def update_service(session: AsyncSession, shop_id: UUID, service_id: UUID, payload: UpdateServiceRequest) -> ShopService:
    svc = await session.get(ShopService, service_id)
    if not svc or svc.shop_id != shop_id:
        raise HTTPException(status_code=404, detail="Service not found.")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(svc, field, val)
    await session.commit()
    await session.refresh(svc)
    return svc


async def toggle_service(session: AsyncSession, shop_id: UUID, service_id: UUID) -> ShopService:
    svc = await session.get(ShopService, service_id)
    if not svc or svc.shop_id != shop_id:
        raise HTTPException(status_code=404, detail="Service not found.")
    svc.is_enabled = not svc.is_enabled
    await session.commit()
    await session.refresh(svc)
    return svc


async def delete_service(session: AsyncSession, shop_id: UUID, service_id: UUID) -> None:
    svc = await session.get(ShopService, service_id)
    if not svc or svc.shop_id != shop_id:
        raise HTTPException(status_code=404, detail="Service not found.")
    await session.delete(svc)
    await session.commit()


# ── Availability engine ───────────────────────────────────────────────────

async def _count_overlapping_bookings(session: AsyncSession, shop_id: UUID, appt_date: date, slot_start: time, duration_minutes: int) -> int:
    """
    Count active bookings whose time window overlaps [slot_start, slot_start+duration).
    Uses time arithmetic in Python (avoids dialect-specific INTERVAL + TIME issues).
    """
    start_dt = datetime.combine(appt_date, slot_start)
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    result = await session.execute(
        select(func.count()).select_from(HaircutBooking).where(
            HaircutBooking.shop_id == shop_id,
            HaircutBooking.appointment_date == appt_date,
            HaircutBooking.status.in_(["PENDING", "CONFIRMED"]),
        )
    )
    # We must filter in Python because TIME arithmetic varies by dialect.
    # For large-scale deployments, push this into a SQL expression or use TSRANGE.
    all_bookings_result = await session.execute(
        select(HaircutBooking.start_time, HaircutBooking.total_duration_minutes).where(
            HaircutBooking.shop_id == shop_id,
            HaircutBooking.appointment_date == appt_date,
            HaircutBooking.status.in_(["PENDING", "CONFIRMED"]),
        )
    )
    count = 0
    for row_start, row_dur in all_bookings_result.all():
        row_start_dt = datetime.combine(appt_date, row_start)
        row_end_dt = row_start_dt + timedelta(minutes=row_dur)
        if row_start_dt < end_dt and row_end_dt > start_dt:
            count += 1
    return count


async def _shop_has_any_hours_configured(session: AsyncSession, shop_id: UUID) -> bool:
    result = await session.execute(select(ShopHours.id).where(ShopHours.shop_id == shop_id).limit(1))
    return result.scalar_one_or_none() is not None


async def _resolve_day_hours(session: AsyncSession, shop_id: UUID, schema_dow: int) -> tuple[bool, time, time]:
    """Returns (is_open, opening_time, closing_time) for the given schema day-of-week.
    If the vendor hasn't configured any hours at all yet, default to 10 AM – 7 PM every day
    so the shop remains bookable until they set their real hours."""
    hours_result = await session.execute(
        select(ShopHours).where(ShopHours.shop_id == shop_id, ShopHours.day_of_week == schema_dow)
    )
    hours = hours_result.scalar_one_or_none()
    if hours:
        return hours.is_open, hours.opening_time, hours.closing_time
    if not await _shop_has_any_hours_configured(session, shop_id):
        return True, DEFAULT_OPENING_TIME, DEFAULT_CLOSING_TIME
    return False, DEFAULT_OPENING_TIME, DEFAULT_CLOSING_TIME


async def get_shop_availability(session: AsyncSession, shop_id: UUID, target_date: date) -> ShopAvailabilityResponse:
    shop = await session.get(BarberShop, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    # Check holiday closure
    closure_result = await session.execute(
        select(ShopClosure).where(ShopClosure.shop_id == shop_id, ShopClosure.closure_date == target_date)
    )
    if closure_result.scalar_one_or_none():
        return ShopAvailabilityResponse(shop_id=shop_id, date=target_date, is_open=False, is_closed_for_holiday=True, slots=[])

    # Check weekly schedule
    day_of_week = target_date.weekday()  # Mon=0…Sun=6 → convert: Python Mon=0,Sun=6; schema Sun=0,Sat=6
    # Schema: 0=Sun…6=Sat; Python: Mon=0…Sun=6
    schema_dow = (day_of_week + 1) % 7  # Python Mon(0)→schema 1, Sun(6)→schema 0
    is_open, opening_time, closing_time = await _resolve_day_hours(session, shop_id, schema_dow)
    if not is_open:
        return ShopAvailabilityResponse(shop_id=shop_id, date=target_date, is_open=False, is_closed_for_holiday=False, slots=[])

    # Generate 30-min slots
    slots: list[TimeSlot] = []
    now = datetime.now(UTC)
    cursor = datetime.combine(target_date, opening_time)
    close_dt = datetime.combine(target_date, closing_time)

    while cursor < close_dt:
        slot_time = cursor.time()
        slot_datetime = datetime.combine(target_date, slot_time)
        is_past = slot_datetime <= now.replace(tzinfo=None)
        if is_past:
            slots.append(TimeSlot(start_time=slot_time, is_available=False))
        else:
            concurrent = await _count_overlapping_bookings(session, shop_id, target_date, slot_time, SLOT_MINUTES)
            slots.append(TimeSlot(start_time=slot_time, is_available=concurrent < shop.total_chairs))
        cursor += timedelta(minutes=SLOT_MINUTES)

    return ShopAvailabilityResponse(shop_id=shop_id, date=target_date, is_open=True, is_closed_for_holiday=False, slots=slots)


# ── Bookings ──────────────────────────────────────────────────────────────

async def create_booking(session: AsyncSession, customer_id: UUID, payload: CreateBookingRequest) -> BookingResponse:
    shop = await session.get(BarberShop, payload.shop_id)
    if not shop or not shop.is_active:
        raise HTTPException(status_code=404, detail="Shop not found or inactive.")

    # Resolve services
    service_rows: list[ShopService] = []
    for sid in payload.service_ids:
        svc = await session.get(ShopService, sid)
        if not svc or svc.shop_id != payload.shop_id or not svc.is_enabled:
            raise HTTPException(status_code=400, detail=f"Service {sid} is not available at this shop.")
        service_rows.append(svc)

    # Booking reserves a chair, not specific services — services are optional/FYI.
    # When none are picked, fall back to the standard slot length and no fee
    # (fee is settled at the shop, not at booking time).
    total_duration = sum(s.duration_minutes for s in service_rows) if service_rows else SLOT_MINUTES
    total_fee = sum(float(s.fee) for s in service_rows) if service_rows else 0.0

    # Check closure
    closure = await session.execute(
        select(ShopClosure).where(ShopClosure.shop_id == payload.shop_id, ShopClosure.closure_date == payload.appointment_date)
    )
    if closure.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Shop is closed on the selected date.")

    # Check weekly hours
    schema_dow = (payload.appointment_date.weekday() + 1) % 7
    is_open, opening_time, closing_time = await _resolve_day_hours(session, payload.shop_id, schema_dow)
    if not is_open:
        raise HTTPException(status_code=400, detail="Shop is closed on the selected day.")

    if payload.start_time < opening_time or payload.start_time >= closing_time:
        raise HTTPException(status_code=400, detail="Selected time is outside shop opening hours.")

    # Check past time
    appt_dt = datetime.combine(payload.appointment_date, payload.start_time)
    if appt_dt <= datetime.now():
        raise HTTPException(status_code=400, detail="Cannot book a slot in the past.")

    # Check chair availability using total_duration
    concurrent = await _count_overlapping_bookings(session, payload.shop_id, payload.appointment_date, payload.start_time, total_duration)
    if concurrent >= shop.total_chairs:
        raise HTTPException(status_code=409, detail="This time slot is fully booked. Please choose another time.")

    # Check customer token
    token_row = await _get_or_create_token_row(session, customer_id)
    if token_row.balance < 1:
        raise HTTPException(status_code=400, detail="Insufficient booking tokens.")

    # Create booking
    booking = HaircutBooking(
        customer_id=customer_id,
        shop_id=payload.shop_id,
        appointment_date=payload.appointment_date,
        start_time=payload.start_time,
        total_duration_minutes=total_duration,
        total_fee=total_fee,
        otp_code=_gen_otp(),
    )
    session.add(booking)
    await session.flush()

    for svc in service_rows:
        session.add(HaircutBookingService(
            booking_id=booking.booking_id,
            service_id=svc.service_id,
            service_name=svc.service_name,
            fee=float(svc.fee),
            duration_minutes=svc.duration_minutes,
        ))

    await _debit_token(session, customer_id, booking.booking_id, "BOOKING_HOLD")
    await session.commit()
    await session.refresh(booking)

    services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == booking.booking_id))).scalars().all()
    return _booking_to_response(booking, shop, list(services))


async def cancel_booking(session: AsyncSession, customer_id: UUID, booking_id: UUID, reason: str | None) -> BookingResponse:
    booking = await session.get(HaircutBooking, booking_id)
    if not booking or booking.customer_id != customer_id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status not in ("PENDING", "CONFIRMED"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel a booking with status '{booking.status}'.")

    appt_dt = datetime.combine(booking.appointment_date, booking.start_time)
    now = datetime.now()
    if (appt_dt - now).total_seconds() < CANCEL_BLOCK_MINUTES * 60:
        raise HTTPException(
            status_code=400,
            detail=f"Cancellations are not allowed within {CANCEL_BLOCK_MINUTES} minutes of the appointment.",
        )

    booking.status = "CANCELED"
    booking.cancel_reason = reason
    booking.cancel_requested_at = datetime.now(UTC)
    booking.updated_at = datetime.now(UTC)

    if booking.token_held and not booking.token_refunded:
        await _credit_token(session, customer_id, booking_id, "CANCEL_REFUND")
        booking.token_refunded = True
        booking.token_held = False

    await session.commit()
    await session.refresh(booking)
    shop = await session.get(BarberShop, booking.shop_id)
    services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == booking_id))).scalars().all()
    return _booking_to_response(booking, shop, list(services))


async def get_active_booking(session: AsyncSession, customer_id: UUID) -> BookingResponse | None:
    result = await session.execute(
        select(HaircutBooking).where(
            HaircutBooking.customer_id == customer_id,
            HaircutBooking.status.in_(["PENDING", "CONFIRMED"]),
        ).order_by(HaircutBooking.appointment_date, HaircutBooking.start_time).limit(1)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        return None
    shop = await session.get(BarberShop, booking.shop_id)
    services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == booking.booking_id))).scalars().all()
    return _booking_to_response(booking, shop, list(services))


async def list_booking_history(session: AsyncSession, customer_id: UUID, limit: int = 20) -> list[BookingHistoryItem]:
    result = await session.execute(
        select(HaircutBooking)
        .where(
            HaircutBooking.customer_id == customer_id,
            HaircutBooking.status.in_(["COMPLETED", "CANCELED", "NO_SHOW"]),
        )
        .order_by(HaircutBooking.appointment_date.desc(), HaircutBooking.start_time.desc())
        .limit(limit)
    )
    bookings = result.scalars().all()
    if not bookings:
        return []

    booking_ids = [b.booking_id for b in bookings]
    reviewed_result = await session.execute(select(HaircutReview.booking_id).where(HaircutReview.booking_id.in_(booking_ids)))
    reviewed_ids = set(reviewed_result.scalars().all())

    items = []
    for b in bookings:
        shop = await session.get(BarberShop, b.shop_id)
        services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == b.booking_id))).scalars().all()
        base = _booking_to_response(b, shop, list(services))
        items.append(BookingHistoryItem(**base.model_dump(), has_review=b.booking_id in reviewed_ids))
    return items


# ── Manual check-in ───────────────────────────────────────────────────────

async def request_manual_checkin(session: AsyncSession, customer_id: UUID, booking_id: UUID, payload: ManualCheckinRequest) -> BookingResponse:
    booking = await session.get(HaircutBooking, booking_id)
    if not booking or booking.customer_id != customer_id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Booking is already '{booking.status}'.")

    shop = await session.get(BarberShop, booking.shop_id)
    if not shop or shop.lat is None or shop.lng is None:
        raise HTTPException(status_code=400, detail="Shop location is not set — manual check-in unavailable.")

    # Geofence check
    dist = _haversine_metres(payload.customer_lat, payload.customer_lng, float(shop.lat), float(shop.lng))
    if dist > GEOFENCE_RADIUS_METRES:
        raise HTTPException(status_code=400, detail=f"You are {dist:.0f}m from the shop. Must be within {GEOFENCE_RADIUS_METRES}m to request check-in.")

    # Time window check: appointment must have started and not more than WINDOW minutes ago
    appt_dt = datetime.combine(booking.appointment_date, booking.start_time)
    now = datetime.now()
    window_end = appt_dt + timedelta(minutes=MANUAL_CHECKIN_WINDOW_MINUTES)
    if now < appt_dt:
        raise HTTPException(status_code=400, detail="Your appointment hasn't started yet.")
    if now > window_end:
        raise HTTPException(status_code=400, detail=f"Manual check-in window has closed (was open until {window_end.strftime('%H:%M')}).")

    booking.manual_checkin_requested_at = datetime.now(UTC)
    booking.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(booking)

    services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == booking_id))).scalars().all()
    return _booking_to_response(booking, shop, list(services))


# ── Vendor: OTP check-in ──────────────────────────────────────────────────

async def vendor_otp_checkin(session: AsyncSession, vendor_id: UUID, booking_id: UUID, otp: str) -> BookingResponse:
    # Resolve vendor → shop
    shop_result = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    shop = shop_result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    booking = await session.get(HaircutBooking, booking_id)
    if not booking or booking.shop_id != shop.shop_id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status not in ("PENDING", "CONFIRMED"):
        raise HTTPException(status_code=400, detail="Booking is not active.")
    if booking.otp_code != otp:
        raise HTTPException(status_code=400, detail="Incorrect OTP.")

    booking.status = "COMPLETED"
    booking.otp_used_at = datetime.now(UTC)
    booking.updated_at = datetime.now(UTC)

    if booking.token_held and not booking.token_refunded:
        await _credit_token(session, booking.customer_id, booking_id, "COMPLETION_REFUND")
        booking.token_refunded = True
        booking.token_held = False

    await session.commit()
    await session.refresh(booking)
    services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == booking_id))).scalars().all()
    return _booking_to_response(booking, shop, list(services))


async def vendor_approve_manual_checkin(session: AsyncSession, vendor_id: UUID, booking_id: UUID) -> BookingResponse:
    shop_result = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    shop = shop_result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    booking = await session.get(HaircutBooking, booking_id)
    if not booking or booking.shop_id != shop.shop_id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if not booking.manual_checkin_requested_at:
        raise HTTPException(status_code=400, detail="No manual check-in request pending.")
    if booking.status not in ("PENDING", "CONFIRMED"):
        raise HTTPException(status_code=400, detail="Booking is not active.")

    booking.status = "COMPLETED"
    booking.manual_checkin_approved_at = datetime.now(UTC)
    booking.updated_at = datetime.now(UTC)

    if booking.token_held and not booking.token_refunded:
        await _credit_token(session, booking.customer_id, booking_id, "COMPLETION_REFUND")
        booking.token_refunded = True
        booking.token_held = False

    await session.commit()
    await session.refresh(booking)
    services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == booking_id))).scalars().all()
    return _booking_to_response(booking, shop, list(services))


# ── Vendor: today's appointments ──────────────────────────────────────────

async def get_today_appointments(session: AsyncSession, vendor_id: UUID) -> list[BookingResponse]:
    shop_result = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    shop = shop_result.scalar_one_or_none()
    if not shop:
        return []
    today = date.today()
    result = await session.execute(
        select(HaircutBooking).where(
            HaircutBooking.shop_id == shop.shop_id,
            HaircutBooking.appointment_date == today,
        ).order_by(HaircutBooking.start_time)
    )
    bookings = result.scalars().all()
    out = []
    for b in bookings:
        svcs = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == b.booking_id))).scalars().all()
        out.append(_booking_to_response(b, shop, list(svcs)))
    return out


# ── Shop discovery ────────────────────────────────────────────────────────

async def _rating_map(session: AsyncSession, shop_ids: list[UUID]) -> dict[UUID, tuple[float, int]]:
    if not shop_ids:
        return {}
    result = await session.execute(
        select(HaircutReview.shop_id, func.avg(HaircutReview.rating), func.count(HaircutReview.review_id))
        .where(HaircutReview.shop_id.in_(shop_ids))
        .group_by(HaircutReview.shop_id)
    )
    return {row[0]: (round(float(row[1]), 1), row[2]) for row in result.all()}


async def _favorite_set(session: AsyncSession, customer_id: UUID | None, shop_ids: list[UUID]) -> set[UUID]:
    if not customer_id or not shop_ids:
        return set()
    result = await session.execute(
        select(CustomerHaircutFavorite.shop_id).where(
            CustomerHaircutFavorite.customer_id == customer_id,
            CustomerHaircutFavorite.shop_id.in_(shop_ids),
        )
    )
    return set(result.scalars().all())


async def find_nearby_shops(session: AsyncSession, lat: float, lng: float, radius_km: float = 10.0, customer_id: UUID | None = None) -> list[NearbyShopResponse]:
    result = await session.execute(select(BarberShop).where(BarberShop.shop_status == "active", BarberShop.lat.isnot(None), BarberShop.lng.isnot(None)))  # noqa: E712
    shops = result.scalars().all()
    candidates = []
    for shop in shops:
        dist_m = _haversine_metres(lat, lng, float(shop.lat), float(shop.lng))
        dist_km = dist_m / 1000
        if dist_km <= radius_km:
            candidates.append((shop, round(dist_km, 2)))

    ratings = await _rating_map(session, [s.shop_id for s, _ in candidates])
    favorites = await _favorite_set(session, customer_id, [s.shop_id for s, _ in candidates])

    nearby = [
        NearbyShopResponse(
            shop_id=shop.shop_id,
            shop_name=shop.shop_name,
            address_line=shop.address_line,
            lat=float(shop.lat),
            lng=float(shop.lng),
            distance_km=dist_km,
            total_chairs=shop.total_chairs,
            is_active=shop.is_active,
            shop_image_url=shop.shop_image_url,
            rating_avg=ratings.get(shop.shop_id, (None, 0))[0],
            rating_count=ratings.get(shop.shop_id, (None, 0))[1],
            is_favorite=shop.shop_id in favorites,
        )
        for shop, dist_km in candidates
    ]
    nearby.sort(key=lambda s: s.distance_km or 0)
    return nearby


async def search_shops(session: AsyncSession, query: str, customer_id: UUID | None = None) -> list[NearbyShopResponse]:
    result = await session.execute(
        select(BarberShop).where(BarberShop.shop_status == "active", BarberShop.shop_name.ilike(f"%{query}%"))
    )
    shops = result.scalars().all()
    ratings = await _rating_map(session, [s.shop_id for s in shops])
    favorites = await _favorite_set(session, customer_id, [s.shop_id for s in shops])
    return [
        NearbyShopResponse(
            shop_id=s.shop_id, shop_name=s.shop_name, address_line=s.address_line,
            lat=float(s.lat) if s.lat else None, lng=float(s.lng) if s.lng else None,
            total_chairs=s.total_chairs, is_active=s.is_active,
            shop_image_url=s.shop_image_url,
            rating_avg=ratings.get(s.shop_id, (None, 0))[0],
            rating_count=ratings.get(s.shop_id, (None, 0))[1],
            is_favorite=s.shop_id in favorites,
        )
        for s in shops
    ]


async def get_shop_detail(session: AsyncSession, shop_id: UUID, customer_id: UUID | None = None) -> ShopDetailResponse:
    shop = await session.get(BarberShop, shop_id)
    if not shop or shop.shop_status != "active":
        raise HTTPException(status_code=404, detail="Shop not found or inactive.")
    ratings = await _rating_map(session, [shop_id])
    favorites = await _favorite_set(session, customer_id, [shop_id])
    rating_avg, rating_count = ratings.get(shop_id, (None, 0))
    return ShopDetailResponse(
        shop_id=shop.shop_id,
        shop_name=shop.shop_name,
        phone=shop.phone,
        address_line=shop.address_line,
        pin_code=shop.pin_code,
        lat=float(shop.lat) if shop.lat else None,
        lng=float(shop.lng) if shop.lng else None,
        total_chairs=shop.total_chairs,
        is_active=shop.is_active,
        shop_image_url=shop.shop_image_url,
        rating_avg=rating_avg,
        rating_count=rating_count,
        is_favorite=shop_id in favorites,
    )


# ── Reviews ───────────────────────────────────────────────────────────────

async def submit_review(session: AsyncSession, customer_id: UUID, booking_id: UUID, payload: SubmitReviewRequest) -> ReviewResponse:
    booking = await session.get(HaircutBooking, booking_id)
    if not booking or booking.customer_id != customer_id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status != "COMPLETED":
        raise HTTPException(status_code=400, detail="Only completed bookings can be reviewed.")
    existing = await session.execute(select(HaircutReview).where(HaircutReview.booking_id == booking_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already reviewed this booking.")

    review = HaircutReview(
        booking_id=booking_id,
        shop_id=booking.shop_id,
        customer_id=customer_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return ReviewResponse.model_validate(review)


async def list_shop_reviews(session: AsyncSession, shop_id: UUID) -> list[ReviewResponse]:
    result = await session.execute(
        select(HaircutReview).where(HaircutReview.shop_id == shop_id).order_by(HaircutReview.created_at.desc())
    )
    return [ReviewResponse.model_validate(r) for r in result.scalars().all()]


# ── Reschedule ────────────────────────────────────────────────────────────

MAX_RESCHEDULES = 1


async def reschedule_booking(session: AsyncSession, customer_id: UUID, booking_id: UUID, payload: RescheduleBookingRequest) -> BookingResponse:
    booking = await session.get(HaircutBooking, booking_id)
    if not booking or booking.customer_id != customer_id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status not in ("PENDING", "CONFIRMED"):
        raise HTTPException(status_code=400, detail=f"Cannot reschedule a booking with status '{booking.status}'.")
    if booking.reschedule_count >= MAX_RESCHEDULES:
        raise HTTPException(status_code=400, detail=f"This booking has already been rescheduled the maximum of {MAX_RESCHEDULES} time(s).")

    appt_dt = datetime.combine(booking.appointment_date, booking.start_time)
    if (appt_dt - datetime.now()).total_seconds() < CANCEL_BLOCK_MINUTES * 60:
        raise HTTPException(
            status_code=400,
            detail=f"Rescheduling is not allowed within {CANCEL_BLOCK_MINUTES} minutes of the appointment.",
        )

    shop = await session.get(BarberShop, booking.shop_id)
    if not shop or not shop.is_active:
        raise HTTPException(status_code=404, detail="Shop not found or inactive.")

    closure = await session.execute(
        select(ShopClosure).where(ShopClosure.shop_id == booking.shop_id, ShopClosure.closure_date == payload.appointment_date)
    )
    if closure.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Shop is closed on the selected date.")

    schema_dow = (payload.appointment_date.weekday() + 1) % 7
    is_open, opening_time, closing_time = await _resolve_day_hours(session, booking.shop_id, schema_dow)
    if not is_open:
        raise HTTPException(status_code=400, detail="Shop is closed on the selected day.")
    if payload.start_time < opening_time or payload.start_time >= closing_time:
        raise HTTPException(status_code=400, detail="Selected time is outside shop opening hours.")

    new_appt_dt = datetime.combine(payload.appointment_date, payload.start_time)
    if new_appt_dt <= datetime.now():
        raise HTTPException(status_code=400, detail="Cannot reschedule to a slot in the past.")

    concurrent = await _count_overlapping_bookings(session, booking.shop_id, payload.appointment_date, payload.start_time, booking.total_duration_minutes)
    # Exclude this booking from the overlap count if the new slot is the same as the old one (no-op move).
    already_counted = (
        payload.appointment_date == booking.appointment_date and payload.start_time == booking.start_time
    )
    if concurrent - (1 if already_counted else 0) >= shop.total_chairs:
        raise HTTPException(status_code=409, detail="This time slot is fully booked. Please choose another time.")

    booking.appointment_date = payload.appointment_date
    booking.start_time = payload.start_time
    booking.reschedule_count += 1
    booking.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(booking)

    services = (await session.execute(select(HaircutBookingService).where(HaircutBookingService.booking_id == booking_id))).scalars().all()
    return _booking_to_response(booking, shop, list(services))


# ── Favorites ─────────────────────────────────────────────────────────────

async def add_favorite(session: AsyncSession, customer_id: UUID, shop_id: UUID) -> FavoriteActionResponse:
    shop = await session.get(BarberShop, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")
    existing = await session.get(CustomerHaircutFavorite, (customer_id, shop_id))
    if not existing:
        session.add(CustomerHaircutFavorite(customer_id=customer_id, shop_id=shop_id))
        await session.commit()
    return FavoriteActionResponse(shop_id=shop_id, is_favorite=True)


async def remove_favorite(session: AsyncSession, customer_id: UUID, shop_id: UUID) -> FavoriteActionResponse:
    existing = await session.get(CustomerHaircutFavorite, (customer_id, shop_id))
    if existing:
        await session.delete(existing)
        await session.commit()
    return FavoriteActionResponse(shop_id=shop_id, is_favorite=False)


async def list_favorite_shops(session: AsyncSession, customer_id: UUID) -> list[NearbyShopResponse]:
    result = await session.execute(
        select(BarberShop)
        .join(CustomerHaircutFavorite, CustomerHaircutFavorite.shop_id == BarberShop.shop_id)
        .where(CustomerHaircutFavorite.customer_id == customer_id)
        .order_by(CustomerHaircutFavorite.created_at.desc())
    )
    shops = result.scalars().all()
    ratings = await _rating_map(session, [s.shop_id for s in shops])
    return [
        NearbyShopResponse(
            shop_id=s.shop_id, shop_name=s.shop_name, address_line=s.address_line,
            lat=float(s.lat) if s.lat else None, lng=float(s.lng) if s.lng else None,
            total_chairs=s.total_chairs, is_active=s.is_active,
            shop_image_url=s.shop_image_url,
            rating_avg=ratings.get(s.shop_id, (None, 0))[0],
            rating_count=ratings.get(s.shop_id, (None, 0))[1],
            is_favorite=True,
        )
        for s in shops
    ]


# ── Token balance ─────────────────────────────────────────────────────────

async def get_token_balance(session: AsyncSession, customer_id: UUID) -> TokenBalanceResponse:
    row = await _get_or_create_token_row(session, customer_id)
    await session.commit()
    return TokenBalanceResponse(customer_id=customer_id, balance=row.balance)


# ── Cron: mark no-shows ───────────────────────────────────────────────────

async def mark_no_shows(session: AsyncSession) -> int:
    """
    Called by the cron job. Marks PENDING bookings as NO_SHOW when:
    appointment_date + start_time + GRACE_MINUTES < now
    and no OTP or manual check-in was used.
    Permanently forfeits the held token.
    """
    cutoff = datetime.now() - timedelta(minutes=NO_SHOW_GRACE_MINUTES)
    result = await session.execute(
        select(HaircutBooking).where(
            HaircutBooking.status.in_(["PENDING", "CONFIRMED"]),
            HaircutBooking.otp_used_at.is_(None),
            HaircutBooking.manual_checkin_approved_at.is_(None),
        )
    )
    count = 0
    for booking in result.scalars().all():
        appt_dt = datetime.combine(booking.appointment_date, booking.start_time)
        if appt_dt < cutoff:
            booking.status = "NO_SHOW"
            booking.updated_at = datetime.now(UTC)
            if booking.token_held and not booking.token_refunded:
                session.add(HaircutTokenTransaction(
                    customer_id=booking.customer_id,
                    booking_id=booking.booking_id,
                    change=0,  # token is held and permanently forfeited — no change to balance
                    reason="NO_SHOW_FORFEIT",
                ))
                booking.token_held = False
                # token_refunded stays False — token is gone
            count += 1
    if count:
        await session.commit()
    return count


# ── Admin ─────────────────────────────────────────────────────────────────

def _shop_to_list_item(shop: BarberShop, vendor: HaircutVendorAccount | None) -> AdminShopListItem:
    return AdminShopListItem(
        shop_id=shop.shop_id,
        vendor_id=shop.vendor_id,
        shop_name=shop.shop_name,
        phone=shop.phone,
        address_line=shop.address_line,
        pin_code=shop.pin_code,
        total_chairs=shop.total_chairs,
        shop_status=shop.shop_status,
        is_active=shop.is_active,
        created_at=shop.created_at,
        owner_name=vendor.full_name if vendor else None,
        owner_phone=vendor.phone if vendor else None,
        account_status=vendor.account_status if vendor else None,
    )


def _shop_to_detail(shop: BarberShop, vendor: HaircutVendorAccount | None) -> AdminShopDetail:
    return AdminShopDetail(
        shop_id=shop.shop_id,
        vendor_id=shop.vendor_id,
        shop_name=shop.shop_name,
        phone=shop.phone,
        address_line=shop.address_line,
        pin_code=shop.pin_code,
        lat=float(shop.lat) if shop.lat is not None else None,
        lng=float(shop.lng) if shop.lng is not None else None,
        total_chairs=shop.total_chairs,
        shop_status=shop.shop_status,
        is_active=shop.is_active,
        shop_image_url=shop.shop_image_url,
        created_at=shop.created_at,
        updated_at=shop.updated_at,
        owner_name=vendor.full_name if vendor else None,
        owner_phone=vendor.phone if vendor else None,
        owner_address=vendor.owner_address if vendor else None,
        licence_url=vendor.licence_url if vendor else None,
        owner_id_url=vendor.owner_id_url if vendor else None,
        account_status=vendor.account_status if vendor else None,
    )


async def admin_list_shops(session: AsyncSession, status_filter: str | None = None) -> list[AdminShopListItem]:
    q = select(BarberShop)
    if status_filter:
        q = q.where(BarberShop.shop_status == status_filter)
    q = q.order_by(BarberShop.created_at.desc())
    result = await session.execute(q)
    shops = result.scalars().all()

    # batch-load vendors
    vendor_ids = list({s.vendor_id for s in shops})
    vendors: dict[UUID, HaircutVendorAccount] = {}
    if vendor_ids:
        vr = await session.execute(select(HaircutVendorAccount).where(HaircutVendorAccount.account_id.in_(vendor_ids)))
        vendors = {v.account_id: v for v in vr.scalars().all()}

    return [_shop_to_list_item(s, vendors.get(s.vendor_id)) for s in shops]


async def admin_get_shop(session: AsyncSession, shop_id: UUID) -> AdminShopDetail:
    shop = await session.get(BarberShop, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")
    vendor = await session.get(HaircutVendorAccount, shop.vendor_id)
    return _shop_to_detail(shop, vendor)


async def admin_set_shop_status(session: AsyncSession, shop_id: UUID, new_status: str) -> AdminShopDetail:
    if new_status not in ("pending", "active", "suspended"):
        raise HTTPException(status_code=400, detail="Invalid status. Must be pending, active, or suspended.")
    shop = await session.get(BarberShop, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")
    shop.shop_status = new_status
    shop.is_active = new_status == "active"
    shop.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(shop)
    vendor = await session.get(HaircutVendorAccount, shop.vendor_id)
    return _shop_to_detail(shop, vendor)


async def admin_list_vendors(session: AsyncSession, status_filter: str | None = None) -> list[AdminVendorListItem]:
    q = select(HaircutVendorAccount)
    if status_filter:
        q = q.where(HaircutVendorAccount.account_status == status_filter)
    q = q.order_by(HaircutVendorAccount.created_at.desc())
    vendors = (await session.execute(q)).scalars().all()

    # load shops
    vid_list = [v.account_id for v in vendors]
    shops: dict[UUID, BarberShop] = {}
    if vid_list:
        sr = await session.execute(select(BarberShop).where(BarberShop.vendor_id.in_(vid_list)))
        for s in sr.scalars().all():
            shops[s.vendor_id] = s

    items = []
    for v in vendors:
        sh = shops.get(v.account_id)
        items.append(AdminVendorListItem(
            account_id=v.account_id,
            full_name=v.full_name,
            phone=v.phone,
            email=v.email,
            owner_address=v.owner_address,
            licence_url=v.licence_url,
            owner_id_url=v.owner_id_url,
            account_status=v.account_status,
            created_at=v.created_at,
            shop_name=sh.shop_name if sh else None,
            shop_id=sh.shop_id if sh else None,
            shop_image_url=sh.shop_image_url if sh else None,
        ))
    return items


async def admin_approve_vendor(session: AsyncSession, vendor_id: UUID) -> AdminVendorListItem:
    vendor = await session.get(HaircutVendorAccount, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found.")
    vendor.account_status = "active"
    vendor.updated_at = datetime.now(UTC)
    # also activate their shop
    sr = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    shop = sr.scalar_one_or_none()
    if shop:
        shop.shop_status = "active"
        shop.is_active = True
        shop.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(vendor)
    if shop:
        await session.refresh(shop)
    return AdminVendorListItem(
        account_id=vendor.account_id,
        full_name=vendor.full_name,
        phone=vendor.phone,
        email=vendor.email,
        owner_address=vendor.owner_address,
        licence_url=vendor.licence_url,
        owner_id_url=vendor.owner_id_url,
        account_status=vendor.account_status,
        created_at=vendor.created_at,
        shop_name=shop.shop_name if shop else None,
        shop_id=shop.shop_id if shop else None,
        shop_image_url=shop.shop_image_url if shop else None,
    )


async def admin_reject_vendor(session: AsyncSession, vendor_id: UUID, reason: str | None) -> AdminVendorListItem:
    vendor = await session.get(HaircutVendorAccount, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found.")
    vendor.account_status = "rejected"
    vendor.updated_at = datetime.now(UTC)
    sr = await session.execute(select(BarberShop).where(BarberShop.vendor_id == vendor_id))
    shop = sr.scalar_one_or_none()
    if shop:
        shop.shop_status = "suspended"
        shop.is_active = False
        shop.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(vendor)
    return AdminVendorListItem(
        account_id=vendor.account_id,
        full_name=vendor.full_name,
        phone=vendor.phone,
        email=vendor.email,
        owner_address=vendor.owner_address,
        licence_url=vendor.licence_url,
        owner_id_url=vendor.owner_id_url,
        account_status=vendor.account_status,
        created_at=vendor.created_at,
        shop_name=shop.shop_name if shop else None,
        shop_id=shop.shop_id if shop else None,
        shop_image_url=shop.shop_image_url if shop else None,
    )


async def admin_get_day_detail(session: AsyncSession, shop_id: UUID, target_date: date) -> AdminDayDetail:
    shop = await session.get(BarberShop, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    # Check closure
    closure_result = await session.execute(
        select(ShopClosure).where(ShopClosure.shop_id == shop_id, ShopClosure.closure_date == target_date)
    )
    closure = closure_result.scalar_one_or_none()

    # Get all bookings for that date
    bookings_result = await session.execute(
        select(HaircutBooking).where(
            HaircutBooking.shop_id == shop_id,
            HaircutBooking.appointment_date == target_date,
        ).order_by(HaircutBooking.start_time)
    )
    bookings = bookings_result.scalars().all()

    admin_bookings: list[AdminDayBooking] = []
    for b in bookings:
        svc_result = await session.execute(
            select(HaircutBookingService).where(HaircutBookingService.booking_id == b.booking_id)
        )
        svc_names = [s.service_name for s in svc_result.scalars().all()]
        admin_bookings.append(AdminDayBooking(
            booking_id=b.booking_id,
            customer_id=b.customer_id,
            start_time=b.start_time,
            total_duration_minutes=b.total_duration_minutes,
            total_fee=float(b.total_fee),
            status=b.status,
            services=svc_names,
        ))

    completed = sum(1 for b in bookings if b.status == "COMPLETED")
    cancelled = sum(1 for b in bookings if b.status == "CANCELED")
    no_shows = sum(1 for b in bookings if b.status == "NO_SHOW")
    pending_confirmed = sum(1 for b in bookings if b.status in ("PENDING", "CONFIRMED"))

    return AdminDayDetail(
        date=target_date,
        is_closed=closure is not None,
        closure_reason=closure.reason if closure else None,
        total_bookings=len(bookings),
        completed=completed,
        cancelled=cancelled,
        no_shows=no_shows,
        pending_confirmed=pending_confirmed,
        bookings=admin_bookings,
    )


async def admin_get_shop_closures(session: AsyncSession, shop_id: UUID) -> list[ClosureResponse]:
    result = await session.execute(
        select(ShopClosure).where(ShopClosure.shop_id == shop_id).order_by(ShopClosure.closure_date)
    )
    return [ClosureResponse.model_validate(r) for r in result.scalars().all()]


async def admin_list_bookings(
    session: AsyncSession,
    shop_id: UUID,
    start_date: date,
    end_date: date,
    status_filter: str | None = None,
) -> list[AdminBookingListItem]:
    shop = await session.get(BarberShop, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    query = select(HaircutBooking).where(
        HaircutBooking.shop_id == shop_id,
        HaircutBooking.appointment_date >= start_date,
        HaircutBooking.appointment_date <= end_date,
    )
    if status_filter:
        query = query.where(HaircutBooking.status == status_filter)
    query = query.order_by(HaircutBooking.appointment_date, HaircutBooking.start_time)

    result = await session.execute(query)
    bookings = result.scalars().all()

    items: list[AdminBookingListItem] = []
    for b in bookings:
        svc_result = await session.execute(
            select(HaircutBookingService).where(HaircutBookingService.booking_id == b.booking_id)
        )
        svc_names = [s.service_name for s in svc_result.scalars().all()]
        items.append(AdminBookingListItem(
            booking_id=b.booking_id,
            customer_id=b.customer_id,
            appointment_date=b.appointment_date,
            start_time=b.start_time,
            total_duration_minutes=b.total_duration_minutes,
            total_fee=float(b.total_fee),
            status=b.status,
            services=svc_names,
        ))
    return items


async def admin_create_closure_range(
    session: AsyncSession, shop_id: UUID, payload: AdminCreateClosureRequest
) -> list[ClosureResponse]:
    """Lets admin/supervisor take a shop offline for the rest of today or a date
    range (e.g. vendor unreachable) — same effect as the vendor's own holiday
    mode, including cancelling + refunding tokens for affected bookings."""
    shop = await session.get(BarberShop, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")
    end_date = payload.end_date or payload.start_date
    if end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after the start date.")

    closures: list[ClosureResponse] = []
    current = payload.start_date
    while current <= end_date:
        closures.append(await confirm_create_closure(session, shop_id, CreateClosureRequest(closure_date=current, reason=payload.reason)))
        current += timedelta(days=1)
    return closures


async def list_upcoming_closures(session: AsyncSession, shop_id: UUID) -> list[ClosureResponse]:
    today = datetime.now(UTC).date()
    result = await session.execute(
        select(ShopClosure)
        .where(ShopClosure.shop_id == shop_id, ShopClosure.closure_date >= today)
        .order_by(ShopClosure.closure_date)
    )
    return [ClosureResponse.model_validate(r) for r in result.scalars().all()]
