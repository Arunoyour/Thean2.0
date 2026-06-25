"""SQLAlchemy models for the Haircut Booking database (schema HC)."""
import uuid
from datetime import UTC, datetime, time

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Integer,
    Numeric, SmallInteger, String, Text, Time, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HaircutVendorAccount(Base):
    __tablename__ = "haircut_vendor_accounts"

    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    owner_address: Mapped[str | None] = mapped_column(Text)
    licence_url: Mapped[str | None] = mapped_column(Text)
    owner_id_url: Mapped[str | None] = mapped_column(Text)
    otp_code: Mapped[str | None] = mapped_column(String(6))
    otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    account_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    fcm_token: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class BarberShop(Base):
    __tablename__ = "barber_shops"

    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    shop_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    total_chairs: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    address_line: Mapped[str | None] = mapped_column(Text)
    pin_code: Mapped[str | None] = mapped_column(String(10))
    lat: Mapped[float | None] = mapped_column(Numeric(10, 7))
    lng: Mapped[float | None] = mapped_column(Numeric(10, 7))
    shop_image_url: Mapped[str | None] = mapped_column(Text)
    photo_taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    photo_lat: Mapped[float | None] = mapped_column(Numeric(10, 7))
    photo_lng: Mapped[float | None] = mapped_column(Numeric(10, 7))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    shop_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")  # pending | active | suspended
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class ShopHours(Base):
    __tablename__ = "shop_hours"
    __table_args__ = (
        UniqueConstraint("shop_id", "day_of_week", name="uq_shop_day"),
        CheckConstraint("closing_time > opening_time", name="chk_shop_hours_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=Sun … 6=Sat
    is_open: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    opening_time: Mapped[time] = mapped_column(Time, nullable=False)
    closing_time: Mapped[time] = mapped_column(Time, nullable=False)


class ShopClosure(Base):
    __tablename__ = "shop_closures"
    __table_args__ = (
        UniqueConstraint("shop_id", "closure_date", name="uq_shop_closure_date"),
    )

    closure_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    closure_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class ShopService(Base):
    __tablename__ = "shop_services"

    service_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    service_name: Mapped[str] = mapped_column(String(200), nullable=False)
    fee: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class HaircutBooking(Base):
    __tablename__ = "haircut_bookings"

    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    appointment_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    total_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    total_fee: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="PENDING")
    otp_code: Mapped[str] = mapped_column(String(6), nullable=False)
    otp_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_held: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    token_refunded: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    manual_checkin_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    manual_checkin_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reschedule_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class HaircutBookingService(Base):
    __tablename__ = "haircut_booking_services"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    service_name: Mapped[str] = mapped_column(String(200), nullable=False)
    fee: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)


class CustomerHaircutToken(Base):
    __tablename__ = "customer_haircut_tokens"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, server_default="3")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class HaircutTokenTransaction(Base):
    __tablename__ = "haircut_token_transactions"

    tx_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    change: Mapped[int] = mapped_column(Integer, nullable=False)   # +1 credit / -1 debit
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class HaircutReview(Base):
    __tablename__ = "haircut_reviews"

    review_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class CustomerHaircutFavorite(Base):
    __tablename__ = "customer_haircut_favorites"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
