from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Line-level responses ──────────────────────────────────────────────────────

class ApprovalLineResponse(BaseModel):
    line_id: uuid.UUID
    request_id: uuid.UUID
    stakeholder_type: str
    stakeholder_id: uuid.UUID
    stakeholder_name: str | None
    description: str
    amount: float | None
    status: str
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime


# ── Request-level responses ───────────────────────────────────────────────────

class ApprovalRequestResponse(BaseModel):
    request_id: uuid.UUID
    request_type: str
    payload: dict[str, Any]
    requested_by: uuid.UUID | None        # None = SYSTEM
    requested_at: datetime
    status: str
    retry_count: int
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    corrected_by: uuid.UUID | None
    corrected_at: datetime | None
    correction_comment: str | None
    corrected_payload: dict[str, Any] | None
    executed_at: datetime | None
    execution_error: str | None
    idempotency_key: str
    created_at: datetime
    updated_at: datetime
    lines: list[ApprovalLineResponse] = []


# ── Actions ───────────────────────────────────────────────────────────────────

class ReviewLineRequest(BaseModel):
    """Approve or reject a single line within an approval request."""
    decision: str = Field(pattern="^(APPROVED|REJECTED)$")
    rejection_reason: str | None = Field(default=None, max_length=1000)
    # Mandatory when decision=REJECTED — enforced at service layer.


class CorrectRequestBody(BaseModel):
    """Payload submitted by SUPER/CHECKER to correct a NEEDS_CORRECTION request."""
    corrected_payload: dict[str, Any]
    correction_comment: str = Field(min_length=5, max_length=1000)


class CancelRequestBody(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


# ── Notification response ─────────────────────────────────────────────────────

class NotificationResponse(BaseModel):
    notification_id: uuid.UUID
    notification_type: str
    title: str
    body: str
    reference_type: str | None
    reference_id: uuid.UUID | None
    is_read: bool
    read_at: datetime | None
    created_at: datetime
