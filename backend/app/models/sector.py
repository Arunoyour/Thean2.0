import uuid

from sqlalchemy import Boolean, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PharmacyStore(Base):
    __tablename__ = "pharmacy_stores"
    __table_args__ = (
        Index("idx_pharmacy_stores_online", "is_online"),
        Index("idx_pharmacy_stores_location", "latitude", "longitude"),
    )

    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    store_name: Mapped[str] = mapped_column(String(150), nullable=False)
    license_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    latitude: Mapped[float] = mapped_column(nullable=False)
    longitude: Mapped[float] = mapped_column(nullable=False)
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class VegetableStore(Base):
    __tablename__ = "vegetable_stores"
    __table_args__ = (
        Index("idx_vegetable_stores_online", "is_online"),
        Index("idx_vegetable_stores_location", "latitude", "longitude"),
    )

    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    store_name: Mapped[str] = mapped_column(String(150), nullable=False)
    latitude: Mapped[float] = mapped_column(nullable=False)
    longitude: Mapped[float] = mapped_column(nullable=False)
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class PrintShop(Base):
    __tablename__ = "print_shops"
    __table_args__ = (
        Index("idx_print_shops_online", "is_online"),
        Index("idx_print_shops_location", "latitude", "longitude"),
    )

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    shop_name: Mapped[str] = mapped_column(String(150), nullable=False)
    latitude: Mapped[float] = mapped_column(nullable=False)
    longitude: Mapped[float] = mapped_column(nullable=False)
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
