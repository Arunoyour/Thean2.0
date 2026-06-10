"""SQLAlchemy models for approval workflow, notifications, and audit log (schema T)."""
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# ── Approval requests ─────────────────────────────────────────────────────────

class ApprovalRequest(Base):
    """
    Every high-risk action initiated by the SYSTEM (cron / automation) creates one
    of these.  A CHECKER or SUPERVISOR/SUPER must approve before the action executes.

    Lifecycle:
        PENDING_APPROVAL → APPROVED → EXECUTED
        PENDING_APPROVAL → REJECTED (retry_count < 2) → auto-resubmit next cycle
        PENDING_APPROVAL → REJECTED (retry_count >= 2) → NEEDS_CORRECTION → new request
        PENDING_APPROVAL → CANCELLED (by SUPER/SUPERVISOR only)
    """
    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("idx_approval_requests_status",       "status"),
        Index("idx_approval_requests_type",         "request_type"),
        Index("idx_approval_requests_requested_by", "requested_by"),
        Index("idx_approval_requests_created_at",   "created_at"),
    )

    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    request_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # COD_CLEAR | MANUAL_LEDGER_ADJUSTMENT | ACCOUNT_STATUS_CHANGE |
    # SECTOR_FEE_CHANGE | DELIVERY_RATE_CHANGE | PAYOUT_OVERRIDE | SETTLEMENT_CANCELLATION

    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Structured description of what will be executed on approval.

    # NULL = created by SYSTEM (cron / automation)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL")
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    status: Mapped[str] = mapped_column(String(25), nullable=False, server_default="PENDING_APPROVAL")
    # PENDING_APPROVAL | APPROVED | REJECTED | NEEDS_CORRECTION | EXECUTED | CANCELLED

    # 0 = first attempt; 1 = first retry; >=2 → NEEDS_CORRECTION
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Checker review
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    # Mandatory on rejection — enforced at the service layer.

    # Correction (NEEDS_CORRECTION state)
    corrected_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL")
    )
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correction_comment: Mapped[str | None] = mapped_column(Text)
    corrected_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # Execution result
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    execution_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    execution_error: Mapped[str | None] = mapped_column(Text)

    # Prevents double-execution on retry
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class ApprovalRequestLine(Base):
    """
    One row per stakeholder within a batch approval request.
    Enables partial approve/reject — each line is decided independently.
    """
    __tablename__ = "approval_request_lines"
    __table_args__ = (
        Index("idx_approval_lines_request",     "request_id"),
        Index("idx_approval_lines_status",      "status"),
        Index("idx_approval_lines_stakeholder", "stakeholder_type", "stakeholder_id"),
    )

    line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("approval_requests.request_id", ondelete="CASCADE"),
        nullable=False,
    )

    stakeholder_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # DELIVERY_BOY | MERCHANT | PLATFORM
    stakeholder_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    stakeholder_name: Mapped[str | None] = mapped_column(String(200))

    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2))

    status: Mapped[str] = mapped_column(String(25), nullable=False, server_default="PENDING")
    # PENDING | APPROVED | REJECTED | NEEDS_CORRECTION | EXECUTED

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    # Mandatory on rejection — enforced at the service layer.

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


# ── In-app notifications ──────────────────────────────────────────────────────

class Notification(Base):
    """
    In-app notification delivered via WebSocket.
    Either targeted (recipient_id set) or broadcast to a role (recipient_role set).
    """
    __tablename__ = "notifications"
    __table_args__ = (
        Index("idx_notifications_recipient", "recipient_id", "is_read", "created_at"),
        Index("idx_notifications_role",      "recipient_role", "is_read", "created_at"),
        Index("idx_notifications_created_at","created_at"),
    )

    notification_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )

    # Targeted notification — NULL means broadcast to recipient_role
    recipient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="CASCADE")
    )
    # Broadcast role — used when recipient_id is NULL
    recipient_role: Mapped[str | None] = mapped_column(String(20))

    notification_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # REQUEST_PENDING | REQUEST_APPROVED | REQUEST_REJECTED |
    # REQUEST_NEEDS_CORRECTION | REQUEST_EXECUTED |
    # PAYMENT_ON_HOLD | PAYMENT_RELEASED

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    reference_type: Mapped[str | None] = mapped_column(String(40))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


# ── Audit log ─────────────────────────────────────────────────────────────────

class AuditLog(Base):
    """
    Immutable record of every action — successful or blocked — across the portal.
    Visible to SUPER and SUPERVISOR only.
    Rows older than 1 year are deleted by the nightly maintenance cron.
    """
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_actor",       "actor_id",   "created_at"),
        Index("idx_audit_logs_actor_role",  "actor_role", "created_at"),
        Index("idx_audit_logs_action_type", "action_type","created_at"),
        Index("idx_audit_logs_created_at",  "created_at"),
        Index("idx_audit_logs_success",     "success",    "created_at"),
    )

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )

    # NULL = action performed by SYSTEM (cron / automation)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("super_admins.admin_id", ondelete="SET NULL")
    )
    # Denormalised — preserved even if the admin account is later deleted
    actor_name: Mapped[str | None] = mapped_column(String(200))
    actor_role: Mapped[str] = mapped_column(String(20), nullable=False)
    # SUPER | SUPERVISOR | CHECKER | AUDITOR | TEAM_LEAD | SYSTEM

    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # LOGIN | LOGOUT | APPROVE_REQUEST | REJECT_REQUEST | CORRECT_REQUEST |
    # VIEW_LEDGER | EXPORT_REPORT | CREATE_ADMIN | DEACTIVATE_ADMIN | CHANGE_ROLE |
    # COD_CLEAR | FEE_CHANGE | RATE_CHANGE | VIEW_CUSTOMER | VIEW_DELIVERY_BOY |
    # ACCESS_DENIED | ...

    # Human-readable sentence — e.g.:
    # "Checker Aruna rejected COD clear of ₹2,400 for delivery boy Ravi (ID: abc-123)
    #  — reason: duplicate entry"
    description: Mapped[str] = mapped_column(Text, nullable=False)

    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(Text)

    # TRUE = action succeeded; FALSE = blocked or failed
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    http_method: Mapped[str | None] = mapped_column(String(10))
    http_path: Mapped[str | None] = mapped_column(Text)
    http_status: Mapped[int | None] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
