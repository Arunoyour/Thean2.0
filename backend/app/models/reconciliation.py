from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.super_admin import SuperAdmin
    from app.models.settlement import SettlementBatch


class GatewayEvent(Base):
    __tablename__ = "gateway_events"

    event_id:          Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gateway:           Mapped[str]            = mapped_column(String(30), nullable=False, server_default="RAZORPAY")
    event_type:        Mapped[str]            = mapped_column(String(50), nullable=False)
    gateway_reference: Mapped[str]            = mapped_column(Text, nullable=False)
    amount:            Mapped[float]          = mapped_column(Numeric(12, 2), nullable=False)
    currency:          Mapped[str]            = mapped_column(String(5), nullable=False, server_default="INR")
    status:            Mapped[str]            = mapped_column(String(20), nullable=False)
    raw_payload:       Mapped[dict]           = mapped_column(JSONB, nullable=False, default=dict)
    processed:         Mapped[bool]           = mapped_column(Boolean, nullable=False, default=False)
    batch_id:          Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_batches.batch_id", ondelete="SET NULL"))
    created_at:        Mapped[datetime]       = mapped_column(default=datetime.utcnow)


class BankStatementLine(Base):
    __tablename__ = "bank_statement_lines"

    statement_line_id: Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bank_name:         Mapped[str]            = mapped_column(Text, nullable=False)
    account_number:    Mapped[str | None]     = mapped_column(String(20))
    transaction_date:  Mapped[date]           = mapped_column(Date, nullable=False)
    description:       Mapped[str]            = mapped_column(Text, nullable=False)
    amount:            Mapped[float]          = mapped_column(Numeric(12, 2), nullable=False)
    transaction_type:  Mapped[str]            = mapped_column(String(10), nullable=False)
    reference:         Mapped[str | None]     = mapped_column(Text)
    matched:           Mapped[bool]           = mapped_column(Boolean, nullable=False, default=False)
    batch_id:          Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_batches.batch_id", ondelete="SET NULL"))
    uploaded_by:       Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    created_at:        Mapped[datetime]       = mapped_column(default=datetime.utcnow)

    uploader: Mapped[SuperAdmin | None] = relationship("SuperAdmin", foreign_keys=[uploaded_by])


class ReconciliationMatch(Base):
    __tablename__ = "reconciliation_matches"

    match_id:           Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id:           Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_batches.batch_id", ondelete="CASCADE"), nullable=False)
    gateway_event_id:   Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("gateway_events.event_id", ondelete="SET NULL"))
    statement_line_id:  Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_statement_lines.statement_line_id", ondelete="SET NULL"))
    match_type:         Mapped[str]            = mapped_column(String(25), nullable=False)
    batch_amount:       Mapped[float | None]   = mapped_column(Numeric(12, 2))
    gateway_amount:     Mapped[float | None]   = mapped_column(Numeric(12, 2))
    statement_amount:   Mapped[float | None]   = mapped_column(Numeric(12, 2))
    variance:           Mapped[float]          = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    status:             Mapped[str]            = mapped_column(String(20), nullable=False, server_default="PENDING")
    resolved_by:        Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    resolved_at:        Mapped[datetime | None] = mapped_column()
    resolution_notes:   Mapped[str | None]     = mapped_column(Text)
    created_at:         Mapped[datetime]       = mapped_column(default=datetime.utcnow)
    updated_at:         Mapped[datetime]       = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    gateway_event:    Mapped[GatewayEvent | None]       = relationship("GatewayEvent", foreign_keys=[gateway_event_id])
    statement_line:   Mapped[BankStatementLine | None]  = relationship("BankStatementLine", foreign_keys=[statement_line_id])
    exceptions:       Mapped[list[ReconciliationException]] = relationship("ReconciliationException", back_populates="match", lazy="selectin")
    resolver:         Mapped[SuperAdmin | None]          = relationship("SuperAdmin", foreign_keys=[resolved_by])


class ReconciliationException(Base):
    __tablename__ = "reconciliation_exceptions"

    exception_id:        Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id:            Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("reconciliation_matches.match_id", ondelete="CASCADE"), nullable=False)
    exception_type:      Mapped[str]            = mapped_column(String(30), nullable=False)
    severity:            Mapped[str]            = mapped_column(String(10), nullable=False, server_default="MEDIUM")
    description:         Mapped[str]            = mapped_column(Text, nullable=False)
    status:              Mapped[str]            = mapped_column(String(20), nullable=False, server_default="OPEN")
    assigned_to:         Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    approval_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("approval_requests.request_id", ondelete="SET NULL"))
    resolution_notes:    Mapped[str | None]     = mapped_column(Text)
    resolved_by:         Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    resolved_at:         Mapped[datetime | None] = mapped_column()
    created_at:          Mapped[datetime]       = mapped_column(default=datetime.utcnow)
    updated_at:          Mapped[datetime]       = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    match:     Mapped[ReconciliationMatch]  = relationship("ReconciliationMatch", back_populates="exceptions")
    assignee:  Mapped[SuperAdmin | None]    = relationship("SuperAdmin", foreign_keys=[assigned_to])
    resolver:  Mapped[SuperAdmin | None]    = relationship("SuperAdmin", foreign_keys=[resolved_by])
