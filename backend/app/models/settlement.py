from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.super_admin import SuperAdmin


class SettlementCycle(Base):
    __tablename__ = "settlement_cycles"

    cycle_id:   Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_date: Mapped[date]      = mapped_column(Date, nullable=False)
    cycle_type: Mapped[str]       = mapped_column(String(20), nullable=False, server_default="DAILY")
    status:     Mapped[str]       = mapped_column(String(20), nullable=False, server_default="OPEN")
    notes:      Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    executed_at: Mapped[datetime | None] = mapped_column()
    created_at:  Mapped[datetime]        = mapped_column(default=datetime.utcnow)
    updated_at:  Mapped[datetime]        = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    batches: Mapped[list[SettlementBatch]] = relationship("SettlementBatch", back_populates="cycle", lazy="selectin")
    creator: Mapped[SuperAdmin | None]     = relationship("SuperAdmin", foreign_keys=[created_by])


class SettlementBatch(Base):
    __tablename__ = "settlement_batches"

    batch_id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_cycles.cycle_id", ondelete="CASCADE"), nullable=False)
    stakeholder_type:   Mapped[str]       = mapped_column(String(20), nullable=False)
    stakeholder_id:     Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    stakeholder_name:   Mapped[str]       = mapped_column(Text, nullable=False)
    opening_balance:    Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    closing_balance:    Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    total_credits:      Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    total_debits:       Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    net_payable:        Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    status:             Mapped[str]       = mapped_column(String(25), nullable=False, server_default="DRAFT")
    approval_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("approval_requests.request_id", ondelete="SET NULL"))
    idempotency_key:    Mapped[str]       = mapped_column(Text, unique=True, nullable=False)
    retry_count:        Mapped[int]       = mapped_column(Integer, nullable=False, default=0)
    notes:              Mapped[str | None] = mapped_column(Text)
    created_at:         Mapped[datetime]  = mapped_column(default=datetime.utcnow)
    updated_at:         Mapped[datetime]  = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    cycle:  Mapped[SettlementCycle]        = relationship("SettlementCycle", back_populates="batches")
    lines:  Mapped[list[SettlementLine]]   = relationship("SettlementLine", back_populates="batch", lazy="selectin")
    proofs: Mapped[list[PaymentProof]]     = relationship("PaymentProof", back_populates="batch", lazy="selectin")


class SettlementLine(Base):
    __tablename__ = "settlement_lines"

    line_id:        Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id:       Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_batches.batch_id", ondelete="CASCADE"), nullable=False)
    line_type:      Mapped[str]           = mapped_column(String(10), nullable=False)
    reference_type: Mapped[str]           = mapped_column(String(30), nullable=False)
    reference_id:   Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    description:    Mapped[str]           = mapped_column(Text, nullable=False)
    amount:         Mapped[float]         = mapped_column(Numeric(12, 2), nullable=False)
    created_at:     Mapped[datetime]      = mapped_column(default=datetime.utcnow)

    batch: Mapped[SettlementBatch] = relationship("SettlementBatch", back_populates="lines")


class StakeholderLedger(Base):
    __tablename__ = "stakeholder_ledger"

    entry_id:         Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stakeholder_type: Mapped[str]            = mapped_column(String(20), nullable=False)
    stakeholder_id:   Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), nullable=False)
    stakeholder_name: Mapped[str]            = mapped_column(Text, nullable=False)
    entry_type:       Mapped[str]            = mapped_column(String(10), nullable=False)
    amount:           Mapped[float]          = mapped_column(Numeric(12, 2), nullable=False)
    running_balance:  Mapped[float]          = mapped_column(Numeric(12, 2), nullable=False)
    reference_type:   Mapped[str]            = mapped_column(String(30), nullable=False)
    reference_id:     Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    description:      Mapped[str]            = mapped_column(Text, nullable=False)
    batch_id:         Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_batches.batch_id", ondelete="SET NULL"))
    created_at:       Mapped[datetime]       = mapped_column(default=datetime.utcnow)


class PaymentProof(Base):
    __tablename__ = "payment_proofs"

    proof_id:       Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id:       Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_batches.batch_id", ondelete="CASCADE"), nullable=False)
    proof_type:     Mapped[str]            = mapped_column(String(10), nullable=False)
    amount:         Mapped[float]          = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str]            = mapped_column(String(20), nullable=False, server_default="BANK_TRANSFER")
    file_path:      Mapped[str | None]     = mapped_column(Text)
    notes:          Mapped[str | None]     = mapped_column(Text)
    uploaded_by:    Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    verified:       Mapped[bool]           = mapped_column(Boolean, nullable=False, default=False)
    verified_by:    Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    verified_at:    Mapped[datetime | None] = mapped_column()
    created_at:     Mapped[datetime]       = mapped_column(default=datetime.utcnow)

    batch:    Mapped[SettlementBatch]     = relationship("SettlementBatch", back_populates="proofs")
    uploader: Mapped[SuperAdmin | None]   = relationship("SuperAdmin", foreign_keys=[uploaded_by])
    verifier: Mapped[SuperAdmin | None]   = relationship("SuperAdmin", foreign_keys=[verified_by])
