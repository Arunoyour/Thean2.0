"""
Approval queue API.

Endpoints:
    GET  /approvals                         — list requests (filterable)
    GET  /approvals/{id}                    — get one request with all lines
    POST /approvals/{id}/lines/{lid}/review — approve or reject one line
    POST /approvals/{id}/correct            — submit correction for NEEDS_CORRECTION
    POST /approvals/{id}/cancel             — cancel PENDING_APPROVAL request
    GET  /approvals/notifications           — unread in-app notifications
    POST /approvals/notifications/{nid}/read — mark notification as read
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_super_admin, require_role
from app.db.session import get_session
from app.models.approvals import Notification
from app.models.super_admin import SuperAdmin
from app.schemas.approvals import (
    ApprovalRequestResponse,
    CancelRequestBody,
    CorrectRequestBody,
    NotificationResponse,
    ReviewLineRequest,
)
from app.services.approval_service import (
    cancel_request,
    correct_request,
    get_approval_request,
    list_approval_requests,
    review_line,
)
from app.services.audit_service import AuditAction, audit

router = APIRouter(prefix="/approvals", tags=["approvals"])


# ── List & detail ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[ApprovalRequestResponse])
async def list_requests(
    status: str | None = Query(default=None),
    request_type: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    """
    List approval requests.
    - AUDITOR: read-only view (no action buttons on frontend).
    - CHECKER/SUPERVISOR/SUPER: can review.
    """
    return await list_approval_requests(
        session,
        status_filter=status,
        request_type_filter=request_type,
        limit=limit,
        offset=offset,
    )


@router.get("/{request_id}", response_model=ApprovalRequestResponse)
async def get_request(
    request_id: uuid.UUID,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await get_approval_request(session, request_id)


# ── Review a line ─────────────────────────────────────────────────────────────

@router.post("/{request_id}/lines/{line_id}/review", response_model=ApprovalRequestResponse)
async def review_request_line(
    request_id: uuid.UUID,
    line_id: uuid.UUID,
    payload: ReviewLineRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_session),
):
    """
    Approve or reject a single line within an approval request.
    rejection_reason is mandatory when decision=REJECTED.
    """
    result = await review_line(
        session,
        actor=admin,
        request_id=request_id,
        line_id=line_id,
        decision=payload.decision,
        rejection_reason=payload.rejection_reason,
    )

    action = AuditAction.APPROVE_REQUEST if payload.decision == "APPROVED" else AuditAction.REJECT_REQUEST
    description = (
        f"{admin.role} {admin.full_name} {payload.decision.lower()} line {line_id} "
        f"of request {request_id}."
    )
    if payload.decision == "REJECTED":
        description += f" Reason: {payload.rejection_reason}"

    await audit(
        session=session, actor=admin, action_type=action,
        description=description,
        target_type="approval_request_line", target_id=line_id,
        request=request,
    )
    return result


# ── Correct a NEEDS_CORRECTION request ───────────────────────────────────────

@router.post("/{request_id}/correct", response_model=ApprovalRequestResponse)
async def correct_approval_request(
    request_id: uuid.UUID,
    payload: CorrectRequestBody,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_session),
):
    """
    Submit a manual correction for a NEEDS_CORRECTION request.
    Creates a new request; the original is preserved as audit trail.
    """
    result = await correct_request(
        session,
        actor=admin,
        request_id=request_id,
        corrected_payload=payload.corrected_payload,
        correction_comment=payload.correction_comment,
    )
    await audit(
        session=session, actor=admin, action_type=AuditAction.CORRECT_REQUEST,
        description=(
            f"{admin.role} {admin.full_name} submitted a correction for request {request_id}. "
            f"Comment: {payload.correction_comment}"
        ),
        target_type="approval_request", target_id=request_id,
        request=request,
    )
    return result


# ── Cancel a request ──────────────────────────────────────────────────────────

@router.post("/{request_id}/cancel", response_model=ApprovalRequestResponse)
async def cancel_approval_request(
    request_id: uuid.UUID,
    payload: CancelRequestBody,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_session),
):
    """Cancel a PENDING_APPROVAL request. SUPER and SUPERVISOR only."""
    result = await cancel_request(
        session,
        actor=admin,
        request_id=request_id,
        reason=payload.reason,
    )
    await audit(
        session=session, actor=admin, action_type=AuditAction.CANCEL_REQUEST,
        description=(
            f"{admin.role} {admin.full_name} cancelled request {request_id}. "
            f"Reason: {payload.reason}"
        ),
        target_type="approval_request", target_id=request_id,
        request=request,
    )
    return result


# ── In-app notifications ──────────────────────────────────────────────────────

@router.get("/notifications/me", response_model=list[NotificationResponse])
async def my_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=30, le=100),
    admin: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_session),
):
    """Fetch in-app notifications for the current admin."""
    query = (
        select(Notification)
        .where(Notification.recipient_id == admin.admin_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        query = query.where(Notification.is_read.is_(False))

    result = await session.execute(query)
    notifications = result.scalars().all()

    return [
        NotificationResponse(
            notification_id=n.notification_id,
            notification_type=n.notification_type,
            title=n.title,
            body=n.body,
            reference_type=n.reference_type,
            reference_id=n.reference_id,
            is_read=n.is_read,
            read_at=n.read_at,
            created_at=n.created_at,
        )
        for n in notifications
    ]


@router.post("/notifications/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: uuid.UUID,
    admin: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_session),
):
    """Mark one notification as read."""
    notif = await session.scalar(
        select(Notification)
        .where(Notification.notification_id == notification_id)
        .where(Notification.recipient_id == admin.admin_id)
    )
    if notif and not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(UTC)
        await session.commit()
