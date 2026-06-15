from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.super_admin import SuperAdmin


class Dispute(Base):
    __tablename__ = "disputes"

    dispute_id:       Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    raised_by_app:    Mapped[str]            = mapped_column(String(20), nullable=False)
    raised_by_id:     Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), nullable=False)
    raised_by_name:   Mapped[str]            = mapped_column(Text, nullable=False)
    dispute_type:     Mapped[str]            = mapped_column(String(30), nullable=False)
    reference_type:   Mapped[str]            = mapped_column(String(20), nullable=False)
    reference_id:     Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reference_detail: Mapped[dict]           = mapped_column(JSONB, nullable=False, default=dict)
    status:           Mapped[str]            = mapped_column(String(20), nullable=False, server_default="OPEN")
    assigned_to:      Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    resolution_notes: Mapped[str | None]     = mapped_column(Text)
    resolved_by:      Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    resolved_at:      Mapped[datetime | None] = mapped_column()
    reopened_count:   Mapped[int]            = mapped_column(Integer, nullable=False, default=0)
    reopened_at:      Mapped[datetime | None] = mapped_column()
    created_at:       Mapped[datetime]       = mapped_column(default=datetime.utcnow)
    updated_at:       Mapped[datetime]       = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    messages: Mapped[list[DisputeMessage]]        = relationship("DisputeMessage", back_populates="dispute", lazy="selectin", order_by="DisputeMessage.created_at")
    history:  Mapped[list[DisputeStatusHistory]]  = relationship("DisputeStatusHistory", back_populates="dispute", lazy="selectin", order_by="DisputeStatusHistory.created_at")
    assignee: Mapped[SuperAdmin | None]            = relationship("SuperAdmin", foreign_keys=[assigned_to])
    resolver: Mapped[SuperAdmin | None]            = relationship("SuperAdmin", foreign_keys=[resolved_by])


class DisputeMessage(Base):
    __tablename__ = "dispute_messages"

    message_id:         Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dispute_id:         Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("disputes.dispute_id", ondelete="CASCADE"), nullable=False)
    sender_type:        Mapped[str]          = mapped_column(String(20), nullable=False)
    sender_id:          Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    sender_name:        Mapped[str]          = mapped_column(Text, nullable=False)
    text_content:       Mapped[str | None]   = mapped_column(Text)
    voice_file_path:    Mapped[str | None]   = mapped_column(Text)
    voice_duration_secs: Mapped[int | None]  = mapped_column(Integer)
    image_file_path:    Mapped[str | None]   = mapped_column(Text)
    attachment_path:    Mapped[str | None]   = mapped_column(Text)
    attachment_name:    Mapped[str | None]   = mapped_column(Text)
    is_internal:        Mapped[bool]         = mapped_column(Boolean, nullable=False, default=False)
    created_at:         Mapped[datetime]     = mapped_column(default=datetime.utcnow)

    dispute: Mapped[Dispute] = relationship("Dispute", back_populates="messages")


class DisputeStatusHistory(Base):
    __tablename__ = "dispute_status_history"

    history_id:     Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dispute_id:     Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("disputes.dispute_id", ondelete="CASCADE"), nullable=False)
    old_status:     Mapped[str | None]     = mapped_column(String(20))
    new_status:     Mapped[str]            = mapped_column(String(20), nullable=False)
    changed_by:     Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL"))
    changed_by_name: Mapped[str]           = mapped_column(Text, nullable=False, server_default="SYSTEM")
    notes:          Mapped[str | None]     = mapped_column(Text)
    created_at:     Mapped[datetime]       = mapped_column(default=datetime.utcnow)

    dispute: Mapped[Dispute] = relationship("Dispute", back_populates="history")
