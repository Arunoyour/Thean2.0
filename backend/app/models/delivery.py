"""SQLAlchemy models for the Delivery database (schema D, database thean_delivery)."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, Boolean, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DeliveryRateConfig(Base):
    """Immutable rate change-log. Latest row by effective_at is the live rate."""
    __tablename__ = "delivery_rate_config"

    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    rate_per_km: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    changed_by: Mapped[str] = mapped_column(String(100), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    effective_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryAccount(Base):
    __tablename__ = "delivery_accounts"

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(200))
    vehicle_type: Mapped[str] = mapped_column(String(20), nullable=False)
    vehicle_number: Mapped[str | None] = mapped_column(String(20))
    # Fraud-prevention unique fields
    license_number: Mapped[str | None] = mapped_column(String(50))
    id_number: Mapped[str | None] = mapped_column(String(50))
    # Role — DELIVERY_BOY (field agent) | TEAM_LEAD (supervisor, logs in via super-admin portal)
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="DELIVERY_BOY")
    # Status
    account_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    current_lat: Mapped[float | None] = mapped_column(Numeric(10, 7))
    current_lng: Mapped[float | None] = mapped_column(Numeric(10, 7))
    location_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # COD tracking
    cod_balance: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    cod_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    cod_warned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Performance tracking
    total_assigned: Mapped[int] = mapped_column(nullable=False, server_default="0")
    total_accepted: Mapped[int] = mapped_column(nullable=False, server_default="0")
    total_cancelled: Mapped[int] = mapped_column(nullable=False, server_default="0")
    avg_rating: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False, server_default="5.00")
    rating_count: Mapped[int] = mapped_column(nullable=False, server_default="0")
    # OTP
    otp_code: Mapped[str | None] = mapped_column(String(6))
    otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryDocument(Base):
    __tablename__ = "delivery_documents"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id", ondelete="CASCADE"), nullable=False
    )
    doc_type: Mapped[str] = mapped_column(String(30), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(500))
    content_type: Mapped[str | None] = mapped_column(String(100))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryOrder(Base):
    __tablename__ = "delivery_orders"

    delivery_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id"), nullable=False
    )
    # Multi-sector source reference
    sector: Mapped[str] = mapped_column(String(30), nullable=False, server_default="pharmacy")
    source_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    status: Mapped[str] = mapped_column(String(40), nullable=False, server_default="ASSIGNED_TO_DELIVERY")
    distance_km: Mapped[float | None] = mapped_column(Numeric(8, 2))
    earnings_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    rate_per_km: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, server_default="7.00")
    # COD amount the delivery boy must collect from the customer (0 = prepaid)
    cod_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    pickup_pin: Mapped[str | None] = mapped_column(String(6))
    delivery_pin: Mapped[str | None] = mapped_column(String(6))
    accept_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_at_store_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_at_customer_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pickup_lat: Mapped[float | None] = mapped_column(Numeric(10, 7))
    pickup_lng: Mapped[float | None] = mapped_column(Numeric(10, 7))
    dropoff_lat: Mapped[float | None] = mapped_column(Numeric(10, 7))
    dropoff_lng: Mapped[float | None] = mapped_column(Numeric(10, 7))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryCodCollection(Base):
    """One row per delivered COD order — immutable audit record."""
    __tablename__ = "delivery_cod_collections"

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id"), nullable=False
    )
    delivery_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_orders.delivery_order_id"), unique=True, nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryCodPayout(Base):
    """Record of cash handed over to the organisation."""
    __tablename__ = "delivery_cod_payouts"

    payout_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    cleared_by: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(Text)
    payout_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryChatMessage(Base):
    __tablename__ = "delivery_chat_messages"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    delivery_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("delivery_orders.delivery_order_id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DeliveryEarning(Base):
    __tablename__ = "delivery_earnings"

    earning_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id"), nullable=False
    )
    delivery_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_orders.delivery_order_id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="credited")
    earned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryWallet(Base):
    __tablename__ = "delivery_wallet"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id"), unique=True, nullable=False
    )
    balance: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    total_earned: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    total_withdrawn: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryCashoutRequest(Base):
    __tablename__ = "delivery_cashout_requests"

    cashout_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    upi_id: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DeliveryRating(Base):
    """Customer rating submitted after a delivery is completed."""
    __tablename__ = "delivery_ratings"

    rating_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    delivery_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("delivery_orders.delivery_order_id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("delivery_accounts.account_id"), nullable=False
    )
    rated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # customer user_id
    rating: Mapped[int] = mapped_column(nullable=False)                               # 1–5
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DeliveryLocationLog(Base):
    """Append-only GPS heartbeat log — one row per 15-second ping while a delivery is active."""
    __tablename__ = "delivery_location_log"

    log_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    delivery_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("delivery_orders.delivery_order_id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("delivery_accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    lat: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), server_default=func.now()
    )
