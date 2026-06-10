"""
Approval request service — full lifecycle.

States:
    PENDING_APPROVAL → APPROVED  → EXECUTED
    PENDING_APPROVAL → REJECTED  (retry_count < 2, system retries next cycle)
    PENDING_APPROVAL → REJECTED  (retry_count >= 2) → NEEDS_CORRECTION
    PENDING_APPROVAL → CANCELLED (SUPER/SUPERVISOR only)

Partial batches:
    Lines are decided independently.
    Approved lines execute immediately.
    Rejected lines hold independently and follow their own retry path.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approvals import ApprovalRequest, ApprovalRequestLine, Notification
from app.models.super_admin import SuperAdmin
from app.schemas.approvals import ApprovalLineResponse, ApprovalRequestResponse
from app.services.audit_service import AuditAction, audit
from app.services.notification_service import (
    notify_admin_targeted,
    notify_approval_queue,
    notify_delivery_boy,
)

# ── Serializers ───────────────────────────────────────────────────────────────

def serialize_line(line: ApprovalRequestLine) -> ApprovalLineResponse:
    return ApprovalLineResponse(
        line_id=line.line_id,
        request_id=line.request_id,
        stakeholder_type=line.stakeholder_type,
        stakeholder_id=line.stakeholder_id,
        stakeholder_name=line.stakeholder_name,
        description=line.description,
        amount=float(line.amount) if line.amount is not None else None,
        status=line.status,
        reviewed_by=line.reviewed_by,
        reviewed_at=line.reviewed_at,
        rejection_reason=line.rejection_reason,
        created_at=line.created_at,
        updated_at=line.updated_at,
    )


def serialize_request(req: ApprovalRequest, lines: list[ApprovalRequestLine]) -> ApprovalRequestResponse:
    return ApprovalRequestResponse(
        request_id=req.request_id,
        request_type=req.request_type,
        payload=req.payload,
        requested_by=req.requested_by,
        requested_at=req.requested_at,
        status=req.status,
        retry_count=req.retry_count,
        reviewed_by=req.reviewed_by,
        reviewed_at=req.reviewed_at,
        rejection_reason=req.rejection_reason,
        corrected_by=req.corrected_by,
        corrected_at=req.corrected_at,
        correction_comment=req.correction_comment,
        corrected_payload=req.corrected_payload,
        executed_at=req.executed_at,
        execution_error=req.execution_error,
        idempotency_key=req.idempotency_key,
        created_at=req.created_at,
        updated_at=req.updated_at,
        lines=[serialize_line(l) for l in lines],
    )


# ── Create (called by SYSTEM / cron) ─────────────────────────────────────────

async def create_approval_request(
    session: AsyncSession,
    *,
    request_type: str,
    payload: dict[str, Any],
    idempotency_key: str,
    lines: list[dict[str, Any]],
    retry_count: int = 0,
    requested_by: uuid.UUID | None = None,  # None = SYSTEM
) -> ApprovalRequest:
    """
    Create a new approval request with one or more lines.

    Args:
        lines: list of dicts with keys:
            stakeholder_type, stakeholder_id, stakeholder_name, description, amount (optional)
    """
    # Idempotency: return existing if already created
    existing = await session.scalar(
        select(ApprovalRequest).where(ApprovalRequest.idempotency_key == idempotency_key)
    )
    if existing:
        return existing

    req = ApprovalRequest(
        request_type=request_type,
        payload=payload,
        idempotency_key=idempotency_key,
        requested_by=requested_by,
        retry_count=retry_count,
        status="PENDING_APPROVAL",
    )
    session.add(req)
    await session.flush()  # get req.request_id

    for line_data in lines:
        line = ApprovalRequestLine(
            request_id=req.request_id,
            stakeholder_type=line_data["stakeholder_type"],
            stakeholder_id=line_data["stakeholder_id"],
            stakeholder_name=line_data.get("stakeholder_name"),
            description=line_data["description"],
            amount=line_data.get("amount"),
            status="PENDING",
        )
        session.add(line)

    await session.commit()
    await session.refresh(req)

    # Notify SUPER + all CHECKERs + SUPERVISORs
    await notify_approval_queue(
        session,
        notification_type="REQUEST_PENDING",
        title=f"New approval request: {request_type.replace('_', ' ').title()}",
        body=(
            f"A new {request_type.replace('_', ' ').lower()} request requires your review. "
            f"{len(lines)} line(s) pending."
        ),
        reference_type="approval_request",
        reference_id=req.request_id,
    )

    return req


# ── Review a single line ──────────────────────────────────────────────────────

async def review_line(
    session: AsyncSession,
    *,
    actor: SuperAdmin,
    request_id: uuid.UUID,
    line_id: uuid.UUID,
    decision: str,          # APPROVED | REJECTED
    rejection_reason: str | None,
) -> ApprovalRequestResponse:
    """
    Approve or reject one line within a request.
    After each line decision, checks if the request is fully decided and finalises.
    """
    # Validate rejection_reason mandatory
    if decision == "REJECTED" and not (rejection_reason or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rejection_reason is mandatory when rejecting.",
        )

    # Load request with row-lock
    req = await session.scalar(
        select(ApprovalRequest)
        .where(ApprovalRequest.request_id == request_id)
        .with_for_update()
    )
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")

    if req.status not in ("PENDING_APPROVAL",):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request is {req.status} — cannot review lines.",
        )

    # Self-approval guard: SYSTEM requests have requested_by=None, always reviewable
    if req.requested_by and req.requested_by == actor.admin_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot approve your own request.",
        )

    # Load the specific line
    line = await session.scalar(
        select(ApprovalRequestLine)
        .where(ApprovalRequestLine.line_id == line_id)
        .where(ApprovalRequestLine.request_id == request_id)
        .with_for_update()
    )
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line not found.")

    if line.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Line is already {line.status}.",
        )

    now = datetime.now(UTC)
    line.status = decision
    line.reviewed_by = actor.admin_id
    line.reviewed_at = now
    line.rejection_reason = rejection_reason if decision == "REJECTED" else None
    line.updated_at = now

    # Update request-level review fields (first reviewer wins for the request)
    if req.reviewed_by is None:
        req.reviewed_by = actor.admin_id
        req.reviewed_at = now

    await session.flush()

    # Check if all lines are decided — finalise if so
    await _finalise_if_complete(session, req=req, actor=actor)

    # Load all lines for the response
    lines_result = await session.execute(
        select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == request_id)
    )
    all_lines = list(lines_result.scalars().all())
    return serialize_request(req, all_lines)


# ── Finalise after all lines decided ─────────────────────────────────────────

async def _finalise_if_complete(
    session: AsyncSession,
    req: ApprovalRequest,
    actor: SuperAdmin,
) -> None:
    """
    Called after every line decision.
    - All APPROVED → execute all lines, mark request EXECUTED
    - Some APPROVED, some REJECTED → execute approved lines, mark request PARTIAL,
      rejected lines go through retry/NEEDS_CORRECTION independently
    - All REJECTED → follow retry logic
    """
    lines_result = await session.execute(
        select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == req.request_id)
    )
    lines = list(lines_result.scalars().all())

    pending = [l for l in lines if l.status == "PENDING"]
    if pending:
        # Still lines awaiting decision — nothing to finalise yet
        await session.commit()
        return

    approved = [l for l in lines if l.status == "APPROVED"]
    rejected = [l for l in lines if l.status == "REJECTED"]
    now = datetime.now(UTC)

    if approved:
        # Execute all approved lines immediately
        for line in approved:
            await _execute_line(session, req=req, line=line)

        if rejected:
            # Partial batch — batch proceeds with approved, rejected lines held
            req.status = "PARTIAL"
            req.updated_at = now
            await session.commit()

            # Notify queue about rejected lines being held
            await notify_approval_queue(
                session,
                notification_type="REQUEST_REJECTED",
                title=f"Partial approval: {len(rejected)} line(s) held",
                body=(
                    f"{len(approved)} line(s) approved and executed. "
                    f"{len(rejected)} line(s) held for retry/correction."
                ),
                reference_type="approval_request",
                reference_id=req.request_id,
            )

            # Notify each rejected stakeholder
            for line in rejected:
                await _notify_stakeholder_payment_hold(session, line=line)

        else:
            # All lines approved and executed
            req.status = "EXECUTED"
            req.executed_at = now
            req.updated_at = now
            await session.commit()

            await notify_approval_queue(
                session,
                notification_type="REQUEST_EXECUTED",
                title=f"Request fully executed: {req.request_type.replace('_', ' ').title()}",
                body=f"All {len(approved)} line(s) approved and executed successfully.",
                reference_type="approval_request",
                reference_id=req.request_id,
            )

    else:
        # All lines rejected — apply retry logic
        await _handle_all_rejected(session, req=req, lines=rejected)


async def _execute_line(
    session: AsyncSession,
    req: ApprovalRequest,
    line: ApprovalRequestLine,
) -> None:
    """
    Execute the action described by a single approved line.
    Currently marks the line as EXECUTED and records the result.
    Actual financial execution (COD clear, payout, etc.) will be wired in
    Phase 4 when settlement service is built.
    """
    now = datetime.now(UTC)
    line.status = "EXECUTED"
    line.updated_at = now
    await session.flush()

    # Notify the affected stakeholder their payment has been released
    await _notify_stakeholder_payment_released(session, line=line)


async def _handle_all_rejected(
    session: AsyncSession,
    req: ApprovalRequest,
    lines: list[ApprovalRequestLine],
) -> None:
    now = datetime.now(UTC)

    if req.retry_count < 2:
        # First or second attempt rejected → system will resubmit next nightly cycle
        req.status = "REJECTED"
        req.updated_at = now
        await session.commit()

        await notify_approval_queue(
            session,
            notification_type="REQUEST_REJECTED",
            title=f"Request rejected (retry {req.retry_count + 1}/2): {req.request_type.replace('_', ' ').title()}",
            body=(
                f"All lines rejected. System will automatically resubmit "
                f"in the next nightly cycle (attempt {req.retry_count + 1} of 2)."
            ),
            reference_type="approval_request",
            reference_id=req.request_id,
        )

        for line in lines:
            await _notify_stakeholder_payment_hold(session, line=line)

    else:
        # Second rejection → NEEDS_CORRECTION, requires manual intervention
        req.status = "NEEDS_CORRECTION"
        req.updated_at = now
        await session.commit()

        await notify_approval_queue(
            session,
            notification_type="REQUEST_NEEDS_CORRECTION",
            title=f"Manual correction required: {req.request_type.replace('_', ' ').title()}",
            body=(
                "This request has been rejected twice. "
                "A SUPER or CHECKER must review and manually correct it before resubmission."
            ),
            reference_type="approval_request",
            reference_id=req.request_id,
        )

        for line in lines:
            await _notify_stakeholder_payment_hold(session, line=line)


# ── Correct a NEEDS_CORRECTION request ───────────────────────────────────────

async def correct_request(
    session: AsyncSession,
    *,
    actor: SuperAdmin,
    request_id: uuid.UUID,
    corrected_payload: dict[str, Any],
    correction_comment: str,
) -> ApprovalRequestResponse:
    """
    SUPER or CHECKER manually corrects a NEEDS_CORRECTION request.
    Creates a NEW request (old one preserved as audit trail).
    """
    req = await session.scalar(
        select(ApprovalRequest)
        .where(ApprovalRequest.request_id == request_id)
        .with_for_update()
    )
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")

    if req.status != "NEEDS_CORRECTION":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request is {req.status} — only NEEDS_CORRECTION requests can be corrected.",
        )

    now = datetime.now(UTC)
    req.corrected_by = actor.admin_id
    req.corrected_at = now
    req.correction_comment = correction_comment
    req.corrected_payload = corrected_payload
    req.updated_at = now
    await session.flush()

    # Load original lines to replicate
    lines_result = await session.execute(
        select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == request_id)
    )
    original_lines = list(lines_result.scalars().all())

    # Create a fresh request — retry_count resets to 0, uses the corrected payload
    new_idempotency_key = f"{req.idempotency_key}-corrected-{now.date().isoformat()}"
    new_req = await create_approval_request(
        session,
        request_type=req.request_type,
        payload=corrected_payload,
        idempotency_key=new_idempotency_key,
        lines=[
            {
                "stakeholder_type": l.stakeholder_type,
                "stakeholder_id": l.stakeholder_id,
                "stakeholder_name": l.stakeholder_name,
                "description": l.description,
                "amount": float(l.amount) if l.amount is not None else None,
            }
            for l in original_lines
        ],
        retry_count=0,
        requested_by=actor.admin_id,
    )

    await notify_approval_queue(
        session,
        notification_type="REQUEST_PENDING",
        title=f"Corrected request submitted: {req.request_type.replace('_', ' ').title()}",
        body=(
            f"{actor.full_name} submitted a corrected version. "
            f"Comment: {correction_comment}"
        ),
        reference_type="approval_request",
        reference_id=new_req.request_id,
    )

    lines_result2 = await session.execute(
        select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == req.request_id)
    )
    return serialize_request(req, list(lines_result2.scalars().all()))


# ── Cancel a request ──────────────────────────────────────────────────────────

async def cancel_request(
    session: AsyncSession,
    *,
    actor: SuperAdmin,
    request_id: uuid.UUID,
    reason: str,
) -> ApprovalRequestResponse:
    """Cancel a PENDING_APPROVAL request. SUPER and SUPERVISOR only."""
    req = await session.scalar(
        select(ApprovalRequest)
        .where(ApprovalRequest.request_id == request_id)
        .with_for_update()
    )
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")

    if req.status != "PENDING_APPROVAL":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only PENDING_APPROVAL requests can be cancelled (current: {req.status}).",
        )

    now = datetime.now(UTC)
    req.status = "CANCELLED"
    req.rejection_reason = reason
    req.reviewed_by = actor.admin_id
    req.reviewed_at = now
    req.updated_at = now
    await session.commit()

    lines_result = await session.execute(
        select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == request_id)
    )
    lines = list(lines_result.scalars().all())
    return serialize_request(req, lines)


# ── List requests ─────────────────────────────────────────────────────────────

async def list_approval_requests(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    request_type_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ApprovalRequestResponse]:
    query = select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc())

    if status_filter:
        query = query.where(ApprovalRequest.status == status_filter)
    if request_type_filter:
        query = query.where(ApprovalRequest.request_type == request_type_filter)

    query = query.limit(limit).offset(offset)
    result = await session.execute(query)
    requests = list(result.scalars().all())

    out = []
    for req in requests:
        lines_result = await session.execute(
            select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == req.request_id)
        )
        out.append(serialize_request(req, list(lines_result.scalars().all())))
    return out


async def get_approval_request(
    session: AsyncSession, request_id: uuid.UUID
) -> ApprovalRequestResponse:
    req = await session.scalar(
        select(ApprovalRequest).where(ApprovalRequest.request_id == request_id)
    )
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")

    lines_result = await session.execute(
        select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == request_id)
    )
    return serialize_request(req, list(lines_result.scalars().all()))


# ── Retry helper (called by nightly cron) ────────────────────────────────────

async def resubmit_rejected_requests(session: AsyncSession) -> int:
    """
    Find all REJECTED requests with retry_count < 2 and create new requests
    with retry_count + 1.  Called by the nightly settlement cron.
    Returns the number of requests resubmitted.
    """
    result = await session.execute(
        select(ApprovalRequest)
        .where(ApprovalRequest.status == "REJECTED")
        .where(ApprovalRequest.retry_count < 2)
    )
    rejected = list(result.scalars().all())
    count = 0

    for req in rejected:
        lines_result = await session.execute(
            select(ApprovalRequestLine).where(ApprovalRequestLine.request_id == req.request_id)
        )
        lines = list(lines_result.scalars().all())
        # Only resubmit lines that were rejected (PARTIAL batches may have some executed)
        rejected_lines = [l for l in lines if l.status == "REJECTED"]

        if not rejected_lines:
            continue

        new_key = f"{req.idempotency_key}-retry-{req.retry_count + 1}"
        await create_approval_request(
            session,
            request_type=req.request_type,
            payload=req.payload,
            idempotency_key=new_key,
            lines=[
                {
                    "stakeholder_type": l.stakeholder_type,
                    "stakeholder_id": l.stakeholder_id,
                    "stakeholder_name": l.stakeholder_name,
                    "description": l.description,
                    "amount": float(l.amount) if l.amount is not None else None,
                }
                for l in rejected_lines
            ],
            retry_count=req.retry_count + 1,
            requested_by=None,  # SYSTEM resubmission
        )
        count += 1

    return count


# ── Stakeholder notification helpers ─────────────────────────────────────────

async def _notify_stakeholder_payment_hold(
    session: AsyncSession,
    line: ApprovalRequestLine,
) -> None:
    """Notify the affected delivery boy that their payment is on hold."""
    if line.stakeholder_type == "DELIVERY_BOY":
        await notify_delivery_boy(
            session,
            line.stakeholder_id,
            notification_type="PAYMENT_ON_HOLD",
            title="Payment on hold",
            body=(
                f"Your payment of ₹{line.amount:.2f} is currently on hold pending review. "
                f"Reason: {line.rejection_reason or 'Under review'}."
            ),
            reference_type="approval_request_line",
            reference_id=line.line_id,
        )


async def _notify_stakeholder_payment_released(
    session: AsyncSession,
    line: ApprovalRequestLine,
) -> None:
    """Notify the affected delivery boy that their payment has been processed."""
    if line.stakeholder_type == "DELIVERY_BOY":
        await notify_delivery_boy(
            session,
            line.stakeholder_id,
            notification_type="PAYMENT_RELEASED",
            title="Payment processed",
            body=f"Your payment of ₹{line.amount:.2f} has been approved and processed.",
            reference_type="approval_request_line",
            reference_id=line.line_id,
        )
