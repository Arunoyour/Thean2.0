import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("idx_users_created_at", "created_at"),
        Index("idx_users_phone_active", "phone_number", "is_active"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    phone_number: Mapped[str] = mapped_column(String(15), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(100), unique=True)
    full_name: Mapped[str | None] = mapped_column(String(100))
    wallet_balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )


class UserAddress(Base):
    __tablename__ = "user_addresses"
    __table_args__ = (
        Index("idx_user_addresses_user_id", "user_id"),
        Index("idx_user_addresses_lat_lng", "latitude", "longitude"),
    )

    address_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    latitude: Mapped[float] = mapped_column(nullable=False)
    longitude: Mapped[float] = mapped_column(nullable=False)
    address_line_1: Mapped[str] = mapped_column(Text, nullable=False)
    apartment_floor_gate: Mapped[str | None] = mapped_column(String(100))
    landmark: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str] = mapped_column(String(12), nullable=False)
    secondary_phone_number: Mapped[str | None] = mapped_column(String(15))
    location_capture_method: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="CURRENT_LOCATION",
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
