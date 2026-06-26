import uuid
from datetime import UTC, datetime

from datetime import date as date_type, time as time_type

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, SmallInteger, String, Text, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SectorFeeConfig(Base):
    """Append-only log of platform fee + GST per sector.
    Current config = latest row per sector ordered by effective_at DESC."""
    __tablename__ = "sector_fee_config"

    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    sector: Mapped[str] = mapped_column(String(30), nullable=False)
    platform_fee: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    gst_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    changed_by: Mapped[str] = mapped_column(String(100), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    effective_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class PharmacyAccount(Base):
    __tablename__ = "pharmacy_accounts"
    __table_args__ = (
        Index("idx_pharmacy_accounts_phone_active", "phone_number", "is_active"),
        Index("idx_pharmacy_accounts_created_at", "created_at"),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    owner_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(15), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(120), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PharmacyProfile(Base):
    __tablename__ = "pharmacy_profiles"
    __table_args__ = (
        Index("idx_pharmacy_profiles_license", "license_number"),
        Index("idx_pharmacy_profiles_listed", "is_listed"),
        Index("idx_pharmacy_profiles_online_listed", "is_online", "is_listed"),
        Index("idx_pharmacy_profiles_location", "latitude", "longitude"),
    )

    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    store_name: Mapped[str] = mapped_column(String(150), nullable=False)
    license_number: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    gstin: Mapped[str | None] = mapped_column(String(15))
    latitude: Mapped[float | None] = mapped_column()
    longitude: Mapped[float | None] = mapped_column()
    address_line_1: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str | None] = mapped_column(String(12))
    product_commission_percent: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        server_default="0",
    )
    prescription_commission_percent: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        server_default="0",
    )
    platform_fee: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        server_default="0",
    )
    store_image_url: Mapped[str | None] = mapped_column(Text)
    owner_photo_url: Mapped[str | None] = mapped_column(Text)
    drug_licence_url: Mapped[str | None] = mapped_column(Text)
    owner_id_url: Mapped[str | None] = mapped_column(Text)
    photo_taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    photo_lat: Mapped[float | None] = mapped_column()
    photo_lng: Mapped[float | None] = mapped_column()
    is_listed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    manual_override_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyOperatingHours(Base):
    """One row per weekday (0=Monday..6=Sunday) describing the pharmacy's auto on/off schedule."""
    __tablename__ = "pharmacy_operating_hours"
    __table_args__ = (
        UniqueConstraint("account_id", "day_of_week", name="uq_pharmacy_operating_hours_account_day"),
        Index("idx_pharmacy_operating_hours_account", "account_id"),
    )

    hours_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    open_time: Mapped[time_type] = mapped_column(Time, nullable=False)
    close_time: Mapped[time_type] = mapped_column(Time, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyHoliday(Base):
    """A specific date the pharmacy is force-closed, independent of the weekly schedule."""
    __tablename__ = "pharmacy_holidays"
    __table_args__ = (
        UniqueConstraint("account_id", "holiday_date", name="uq_pharmacy_holidays_account_date"),
        Index("idx_pharmacy_holidays_account_date", "account_id", "holiday_date"),
    )

    holiday_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    holiday_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyOtpChallenge(Base):
    __tablename__ = "pharmacy_otp_challenges"
    __table_args__ = (
        Index("idx_pharmacy_otp_phone_created", "phone_number", "created_at"),
        Index("idx_pharmacy_otp_expires", "expires_at"),
    )

    challenge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    phone_number: Mapped[str] = mapped_column(String(15), nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    attempts: Mapped[int] = mapped_column(nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PharmacyStatusEvent(Base):
    __tablename__ = "pharmacy_status_events"
    __table_args__ = (
        Index("idx_pharmacy_status_events_account_created", "account_id", "created_at"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    changed_by_admin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyAvailabilityEvent(Base):
    __tablename__ = "pharmacy_availability_events"
    __table_args__ = (
        Index("idx_pharmacy_availability_events_account_created", "account_id", "created_at"),
        Index("idx_pharmacy_availability_events_created", "created_at"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_type: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyProduct(Base):
    __tablename__ = "pharmacy_products"
    __table_args__ = (
        Index("idx_pharmacy_products_account_available", "account_id", "is_available"),
        Index("idx_pharmacy_products_name", "product_name"),
        Index("idx_pharmacy_products_category", "category"),
        Index("idx_pharmacy_products_approval_status", "approval_status", "created_at"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    product_name: Mapped[str] = mapped_column(String(150), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(80))
    unit_label: Mapped[str | None] = mapped_column(String(60))
    about: Mapped[str | None] = mapped_column(Text)
    ingredients: Mapped[str | None] = mapped_column(Text)
    health_benefits: Mapped[str | None] = mapped_column(Text)
    other_info: Mapped[str | None] = mapped_column(Text)
    disclaimer: Mapped[str | None] = mapped_column(
        Text,
        server_default=(
            "All images are for representational purposes only. It is advised that you read the batch "
            "and manufacturing details, directions for use, allergen information, health and nutritional "
            "claims (wherever applicable), and other details mentioned on the label before consuming the "
            "product. For combo items, individual prices can be viewed on the page."
        ),
    )
    pack_of: Mapped[int | None] = mapped_column()
    net_weight: Mapped[str | None] = mapped_column(String(60))
    calorie_count: Mapped[str | None] = mapped_column(String(60))
    dietary_preference: Mapped[str | None] = mapped_column(String(20))
    country_of_origin: Mapped[str | None] = mapped_column(String(100), server_default="India")
    shelf_life: Mapped[str | None] = mapped_column(String(100))
    price: Mapped[float] = mapped_column(nullable=False)
    offer_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    image_urls: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    stock_quantity: Mapped[int] = mapped_column(nullable=False, server_default="0")
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    approval_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        server_default="APPROVED",
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    revision_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyProductComment(Base):
    __tablename__ = "pharmacy_product_comments"
    __table_args__ = (
        Index("idx_pharmacy_product_comments_product_created", "product_id", "created_at"),
        Index("idx_pharmacy_product_comments_account_created", "account_id", "created_at"),
    )

    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_products.product_id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyRealtimeNotification(Base):
    __tablename__ = "pharmacy_realtime_notifications"
    __table_args__ = (
        Index("idx_pharmacy_notifications_target_created", "target_type", "target_id", "created_at"),
    )

    notification_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class CustomerPharmacyOrder(Base):
    __tablename__ = "customer_pharmacy_orders"
    __table_args__ = (
        Index("idx_customer_pharmacy_orders_user_created", "user_id", "created_at"),
        Index("idx_customer_pharmacy_orders_user_status_created", "user_id", "status", "created_at"),
        Index("idx_customer_pharmacy_orders_account_status_created", "account_id", "status", "created_at"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="SET NULL"),
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="PENDING_CUSTOMER_APPROVAL")
    estimated_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    final_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    doctor_name: Mapped[str | None] = mapped_column(String(150))
    patient_name: Mapped[str | None] = mapped_column(String(150))
    pharmacy_name: Mapped[str | None] = mapped_column(String(150))
    pharmacy_city: Mapped[str | None] = mapped_column(String(80))
    pharmacy_pincode: Mapped[str | None] = mapped_column(String(12))
    order_items: Mapped[list | None] = mapped_column(JSONB)
    order_notes: Mapped[dict | None] = mapped_column(JSONB)
    prescription_path: Mapped[str | None] = mapped_column(String(500))
    voice_note_path: Mapped[str | None] = mapped_column(String(500))
    requires_manual_review: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    customer_action_comment: Mapped[str | None] = mapped_column(String(500))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pharmacy_action_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_account_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    substitution_allowed: Mapped[bool | None] = mapped_column(Boolean)
    substitution_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    partial_fulfillment_allowed: Mapped[bool | None] = mapped_column(Boolean)
    partial_fulfillment_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    split_from_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customer_pharmacy_orders.order_id", ondelete="SET NULL"),
    )
    customer_review_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    price_breakdown: Mapped[dict | None] = mapped_column(JSONB)
    bill_items: Mapped[list | None] = mapped_column(JSONB)
    pickup_code: Mapped[str | None] = mapped_column(String(8))
    pickup_code_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class PharmacyOrderRevenueSettlementLedger(Base):
    __tablename__ = "pharmacy_order_revenue_settlement_ledger"
    __table_args__ = (
        Index("idx_pharmacy_revenue_ledger_account_created", "account_id", "created_at"),
        Index("idx_pharmacy_revenue_ledger_product_created", "product_id", "created_at"),
        Index("idx_pharmacy_revenue_ledger_settlement_status", "settlement_status", "created_at"),
    )

    ledger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    order_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_accounts.account_id", ondelete="RESTRICT"),
        nullable=False,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pharmacy_products.product_id", ondelete="RESTRICT"),
        nullable=False,
    )
    product_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    gross_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    product_commission_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    platform_commission_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    platform_fee_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    pharmacy_payable_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    settlement_status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="PENDING")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PushSubscription(Base):
    """Web Push subscriptions for pharmacy accounts — one row per device/browser."""
    __tablename__ = "push_subscriptions"
    __table_args__ = (
        Index("idx_push_subs_account", "account_id"),
    )

    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), server_default=func.now()
    )
