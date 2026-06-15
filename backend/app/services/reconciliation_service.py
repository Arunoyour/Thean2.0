"""Reconciliation service — three-way match engine, exception handling."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reconciliation import (
    BankStatementLine,
    GatewayEvent,
    ReconciliationException,
    ReconciliationMatch,
)
from app.models.settlement import SettlementBatch
from app.models.super_admin import SuperAdmin

# Variance threshold above which a match is flagged as EXCEPTION (in rupees)
VARIANCE_THRESHOLD = Decimal("1.00")


# ── Serialisers ───────────────────────────────────────────────────────────────

def _serialize_gateway_event(e: GatewayEvent) -> dict:
    return {
        "event_id":          str(e.event_id),
        "gateway":           e.gateway,
        "event_type":        e.event_type,
        "gateway_reference": e.gateway_reference,
        "amount":            float(e.amount),
        "currency":          e.currency,
        "status":            e.status,
        "processed":         e.processed,
        "batch_id":          str(e.batch_id) if e.batch_id else None,
        "created_at":        e.created_at.isoformat(),
    }


def _serialize_statement_line(l: BankStatementLine) -> dict:
    return {
        "statement_line_id": str(l.statement_line_id),
        "bank_name":         l.bank_name,
        "account_number":    l.account_number,
        "transaction_date":  l.transaction_date.isoformat(),
        "description":       l.description,
        "amount":            float(l.amount),
        "transaction_type":  l.transaction_type,
        "reference":         l.reference,
        "matched":           l.matched,
        "batch_id":          str(l.batch_id) if l.batch_id else None,
        "created_at":        l.created_at.isoformat(),
    }


def _serialize_exception(exc: ReconciliationException) -> dict:
    return {
        "exception_id":        str(exc.exception_id),
        "match_id":            str(exc.match_id),
        "exception_type":      exc.exception_type,
        "severity":            exc.severity,
        "description":         exc.description,
        "status":              exc.status,
        "assigned_to":         str(exc.assigned_to) if exc.assigned_to else None,
        "approval_request_id": str(exc.approval_request_id) if exc.approval_request_id else None,
        "resolution_notes":    exc.resolution_notes,
        "resolved_by":         str(exc.resolved_by) if exc.resolved_by else None,
        "resolved_at":         exc.resolved_at.isoformat() if exc.resolved_at else None,
        "created_at":          exc.created_at.isoformat(),
        "updated_at":          exc.updated_at.isoformat(),
    }


def _serialize_match(m: ReconciliationMatch, *, include_detail: bool = False) -> dict:
    data: dict = {
        "match_id":          str(m.match_id),
        "batch_id":          str(m.batch_id),
        "gateway_event_id":  str(m.gateway_event_id) if m.gateway_event_id else None,
        "statement_line_id": str(m.statement_line_id) if m.statement_line_id else None,
        "match_type":        m.match_type,
        "batch_amount":      float(m.batch_amount) if m.batch_amount is not None else None,
        "gateway_amount":    float(m.gateway_amount) if m.gateway_amount is not None else None,
        "statement_amount":  float(m.statement_amount) if m.statement_amount is not None else None,
        "variance":          float(m.variance),
        "status":            m.status,
        "resolved_by":       str(m.resolved_by) if m.resolved_by else None,
        "resolved_at":       m.resolved_at.isoformat() if m.resolved_at else None,
        "resolution_notes":  m.resolution_notes,
        "created_at":        m.created_at.isoformat(),
        "updated_at":        m.updated_at.isoformat(),
        "exception_count":   len(m.exceptions),
    }
    if include_detail:
        data["exceptions"] = [_serialize_exception(e) for e in m.exceptions]
        if m.gateway_event:
            data["gateway_event"] = _serialize_gateway_event(m.gateway_event)
        if m.statement_line:
            data["statement_line"] = _serialize_statement_line(m.statement_line)
    return data


# ── Gateway Events ────────────────────────────────────────────────────────────

async def ingest_gateway_event(
    session: AsyncSession,
    *,
    gateway: str,
    event_type: str,
    gateway_reference: str,
    amount: float,
    currency: str = "INR",
    status: str,
    raw_payload: dict,
    batch_id: uuid.UUID | None = None,
) -> dict:
    event = GatewayEvent(
        gateway=gateway,
        event_type=event_type,
        gateway_reference=gateway_reference,
        amount=amount,
        currency=currency,
        status=status,
        raw_payload=raw_payload,
        batch_id=batch_id,
    )
    session.add(event)
    await session.flush()
    return _serialize_gateway_event(event)


async def list_gateway_events(
    session: AsyncSession,
    *,
    processed: bool | None = None,
    batch_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    q = select(GatewayEvent).order_by(GatewayEvent.created_at.desc())
    if processed is not None:
        q = q.where(GatewayEvent.processed == processed)
    if batch_id:
        q = q.where(GatewayEvent.batch_id == batch_id)
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_gateway_event(e) for e in result.scalars().all()]


# ── Bank Statement Lines ──────────────────────────────────────────────────────

async def import_statement_lines(
    session: AsyncSession,
    *,
    lines: list[dict],
    uploaded_by: uuid.UUID,
) -> list[dict]:
    created = []
    for l in lines:
        obj = BankStatementLine(
            bank_name=l["bank_name"],
            account_number=l.get("account_number"),
            transaction_date=date.fromisoformat(l["transaction_date"]),
            description=l["description"],
            amount=float(l["amount"]),
            transaction_type=l["transaction_type"],
            reference=l.get("reference"),
            uploaded_by=uploaded_by,
        )
        session.add(obj)
        created.append(obj)
    await session.flush()
    return [_serialize_statement_line(l) for l in created]


async def list_statement_lines(
    session: AsyncSession,
    *,
    matched: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    q = select(BankStatementLine).order_by(BankStatementLine.transaction_date.desc())
    if matched is not None:
        q = q.where(BankStatementLine.matched == matched)
    if date_from:
        q = q.where(BankStatementLine.transaction_date >= date_from)
    if date_to:
        q = q.where(BankStatementLine.transaction_date <= date_to)
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_statement_line(l) for l in result.scalars().all()]


# ── Three-way Match Engine ────────────────────────────────────────────────────

async def run_three_way_match(
    session: AsyncSession,
    batch_id: uuid.UUID,
) -> dict:
    """
    Match a settlement batch against gateway events and bank statement lines.

    Algorithm:
    1. Pull all gateway events and statement lines linked to this batch
       (or with amounts matching net_payable within threshold).
    2. Attempt to find a matching gateway event + statement line pair.
    3. Classify the match type and variance.
    4. Raise exceptions for any non-full matches.

    Returns a summary dict with match_id, match_type, variance, and exception count.
    """
    # Fetch the batch
    batch_result = await session.execute(
        select(SettlementBatch).where(SettlementBatch.batch_id == batch_id)
    )
    batch = batch_result.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Settlement batch not found.")

    batch_amount = Decimal(str(batch.net_payable))

    # Find unprocessed gateway events for this batch amount (±threshold)
    gw_result = await session.execute(
        select(GatewayEvent).where(
            GatewayEvent.batch_id == batch_id,
            GatewayEvent.processed == False,  # noqa: E712
        )
    )
    gateway_events = gw_result.scalars().all()

    # Find unmatched statement lines for this batch amount (±threshold)
    stmt_result = await session.execute(
        select(BankStatementLine).where(
            BankStatementLine.batch_id == batch_id,
            BankStatementLine.matched == False,  # noqa: E712
        )
    )
    statement_lines = stmt_result.scalars().all()

    # Determine best gateway and statement match
    gateway_event   = gateway_events[0]   if gateway_events   else None
    statement_line  = statement_lines[0]  if statement_lines  else None

    gateway_amount   = Decimal(str(gateway_event.amount))  if gateway_event  else None
    statement_amount = Decimal(str(statement_line.amount)) if statement_line else None

    # Classify match type
    has_gateway   = gateway_event   is not None
    has_statement = statement_line  is not None

    if has_gateway and has_statement:
        gw_variance   = abs(batch_amount - gateway_amount)
        stmt_variance = abs(batch_amount - statement_amount)
        variance = max(gw_variance, stmt_variance)
        if variance <= VARIANCE_THRESHOLD:
            match_type = "FULL_MATCH"
            match_status = "MATCHED"
        else:
            match_type = "PARTIAL_MATCH"
            match_status = "EXCEPTION"
    elif has_gateway and not has_statement:
        variance = abs(batch_amount - gateway_amount)
        match_type = "GATEWAY_ONLY"
        match_status = "EXCEPTION"
    elif not has_gateway and has_statement:
        variance = abs(batch_amount - statement_amount)
        match_type = "STATEMENT_ONLY"
        match_status = "EXCEPTION"
    else:
        variance = batch_amount
        match_type = "BATCH_ONLY"
        match_status = "EXCEPTION"

    # Create the match record
    match = ReconciliationMatch(
        batch_id=batch_id,
        gateway_event_id=gateway_event.event_id   if gateway_event   else None,
        statement_line_id=statement_line.statement_line_id if statement_line else None,
        match_type=match_type,
        batch_amount=float(batch_amount),
        gateway_amount=float(gateway_amount)   if gateway_amount   is not None else None,
        statement_amount=float(statement_amount) if statement_amount is not None else None,
        variance=float(variance),
        status=match_status,
    )
    session.add(match)
    await session.flush()

    # Mark gateway event as processed
    if gateway_event:
        gateway_event.processed = True

    # Mark statement line as matched
    if statement_line:
        statement_line.matched = True

    # Raise exceptions for non-full matches
    exceptions_created = []
    if match_status == "EXCEPTION":
        exc_type, severity, description = _classify_exception(
            match_type, float(variance), float(batch_amount)
        )
        exc = ReconciliationException(
            match_id=match.match_id,
            exception_type=exc_type,
            severity=severity,
            description=description,
        )
        session.add(exc)
        exceptions_created.append(exc)

    await session.flush()
    await session.refresh(match)

    return {
        **_serialize_match(match),
        "exceptions_raised": len(exceptions_created),
    }


def _classify_exception(
    match_type: str,
    variance: float,
    batch_amount: float,
) -> tuple[str, str, str]:
    """Return (exception_type, severity, description)."""
    variance_pct = (variance / batch_amount * 100) if batch_amount else 0

    if match_type == "BATCH_ONLY":
        return (
            "MISSING_GATEWAY",
            "HIGH",
            f"No gateway event or bank statement found for batch amount ₹{batch_amount:,.2f}.",
        )
    if match_type == "GATEWAY_ONLY":
        return (
            "MISSING_STATEMENT",
            "MEDIUM",
            f"Gateway event found but no matching bank statement line. Variance ₹{variance:,.2f}.",
        )
    if match_type == "STATEMENT_ONLY":
        return (
            "MISSING_GATEWAY",
            "MEDIUM",
            f"Bank statement line found but no matching gateway event. Variance ₹{variance:,.2f}.",
        )
    # PARTIAL_MATCH
    severity = "HIGH" if variance_pct > 5 else "MEDIUM" if variance_pct > 1 else "LOW"
    return (
        "AMOUNT_MISMATCH",
        severity,
        f"Amount mismatch — variance ₹{variance:,.2f} ({variance_pct:.1f}% of batch amount).",
    )


# ── Match & Exception Queries ─────────────────────────────────────────────────

async def list_matches(
    session: AsyncSession,
    *,
    batch_id: uuid.UUID | None = None,
    status: str | None = None,
    match_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    q = select(ReconciliationMatch).order_by(ReconciliationMatch.created_at.desc())
    if batch_id:
        q = q.where(ReconciliationMatch.batch_id == batch_id)
    if status:
        q = q.where(ReconciliationMatch.status == status)
    if match_type:
        q = q.where(ReconciliationMatch.match_type == match_type)
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_match(m) for m in result.scalars().all()]


async def get_match(session: AsyncSession, match_id: uuid.UUID) -> dict:
    result = await session.execute(
        select(ReconciliationMatch).where(ReconciliationMatch.match_id == match_id)
    )
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(404, "Reconciliation match not found.")
    return _serialize_match(match, include_detail=True)


async def list_exceptions(
    session: AsyncSession,
    *,
    status: str | None = None,
    severity: str | None = None,
    exception_type: str | None = None,
    assigned_to: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    q = select(ReconciliationException).order_by(ReconciliationException.created_at.desc())
    if status:
        q = q.where(ReconciliationException.status == status)
    if severity:
        q = q.where(ReconciliationException.severity == severity)
    if exception_type:
        q = q.where(ReconciliationException.exception_type == exception_type)
    if assigned_to:
        q = q.where(ReconciliationException.assigned_to == assigned_to)
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_exception(e) for e in result.scalars().all()]


async def get_exception(session: AsyncSession, exception_id: uuid.UUID) -> dict:
    result = await session.execute(
        select(ReconciliationException).where(ReconciliationException.exception_id == exception_id)
    )
    exc = result.scalar_one_or_none()
    if not exc:
        raise HTTPException(404, "Reconciliation exception not found.")
    # Fetch match detail
    match = await get_match(session, exc.match_id)
    return {**_serialize_exception(exc), "match": match}


async def assign_exception(
    session: AsyncSession,
    exception_id: uuid.UUID,
    assignee_id: uuid.UUID,
) -> dict:
    result = await session.execute(
        select(ReconciliationException).where(ReconciliationException.exception_id == exception_id)
    )
    exc = result.scalar_one_or_none()
    if not exc:
        raise HTTPException(404, "Reconciliation exception not found.")
    exc.assigned_to = assignee_id
    exc.status      = "IN_REVIEW"
    exc.updated_at  = datetime.utcnow()
    await session.flush()
    return _serialize_exception(exc)


async def escalate_exception(
    session: AsyncSession,
    exception_id: uuid.UUID,
    actor: SuperAdmin,
) -> dict:
    """Push the exception into the approval queue as a CHECKER task."""
    from app.services.approval_service import create_approval_request

    result = await session.execute(
        select(ReconciliationException).where(ReconciliationException.exception_id == exception_id)
    )
    exc = result.scalar_one_or_none()
    if not exc:
        raise HTTPException(404, "Reconciliation exception not found.")
    if exc.status == "RESOLVED":
        raise HTTPException(400, "Exception is already resolved.")

    # Fetch match for context
    match_result = await session.execute(
        select(ReconciliationMatch).where(ReconciliationMatch.match_id == exc.match_id)
    )
    match = match_result.scalar_one_or_none()

    req = await create_approval_request(
        session,
        request_type="RECONCILIATION_EXCEPTION",
        payload={
            "exception_id": str(exception_id),
            "exception_type": exc.exception_type,
            "severity": exc.severity,
            "match_id": str(exc.match_id),
        },
        lines=[
            {
                "stakeholder_type": "SYSTEM",
                "stakeholder_id":   str(exception_id),
                "stakeholder_name": "Reconciliation Exception",
                "description":      exc.description,
                "amount":           str(match.variance) if match else "0",
            }
        ],
        idempotency_key=f"recon_exception:{exception_id}",
        requested_by=actor.admin_id,
    )

    exc.approval_request_id = uuid.UUID(req["request_id"])
    exc.status     = "ESCALATED"
    exc.updated_at = datetime.utcnow()
    await session.flush()
    return _serialize_exception(exc)


async def resolve_exception(
    session: AsyncSession,
    exception_id: uuid.UUID,
    actor: SuperAdmin,
    resolution_notes: str,
) -> dict:
    result = await session.execute(
        select(ReconciliationException).where(ReconciliationException.exception_id == exception_id)
    )
    exc = result.scalar_one_or_none()
    if not exc:
        raise HTTPException(404, "Reconciliation exception not found.")

    exc.status           = "RESOLVED"
    exc.resolution_notes = resolution_notes
    exc.resolved_by      = actor.admin_id
    exc.resolved_at      = datetime.utcnow()
    exc.updated_at       = datetime.utcnow()

    # Also resolve the parent match
    match_result = await session.execute(
        select(ReconciliationMatch).where(ReconciliationMatch.match_id == exc.match_id)
    )
    match = match_result.scalar_one_or_none()
    if match:
        match.status           = "RESOLVED"
        match.resolved_by      = actor.admin_id
        match.resolved_at      = datetime.utcnow()
        match.resolution_notes = resolution_notes

    await session.flush()
    return _serialize_exception(exc)


# ── Overview Stats ────────────────────────────────────────────────────────────

async def get_overview(session: AsyncSession) -> dict:
    """Summary statistics for the reconciliation dashboard."""

    total_matches = await session.scalar(select(func.count()).select_from(ReconciliationMatch))
    matched_count = await session.scalar(
        select(func.count()).select_from(ReconciliationMatch)
        .where(ReconciliationMatch.status == "MATCHED")
    )
    exception_count = await session.scalar(
        select(func.count()).select_from(ReconciliationMatch)
        .where(ReconciliationMatch.status == "EXCEPTION")
    )
    resolved_count = await session.scalar(
        select(func.count()).select_from(ReconciliationMatch)
        .where(ReconciliationMatch.status == "RESOLVED")
    )

    open_exceptions = await session.scalar(
        select(func.count()).select_from(ReconciliationException)
        .where(ReconciliationException.status == "OPEN")
    )
    high_severity = await session.scalar(
        select(func.count()).select_from(ReconciliationException)
        .where(
            ReconciliationException.status.in_(["OPEN", "IN_REVIEW"]),
            ReconciliationException.severity == "HIGH",
        )
    )

    unprocessed_gateway = await session.scalar(
        select(func.count()).select_from(GatewayEvent)
        .where(GatewayEvent.processed == False)  # noqa: E712
    )
    unmatched_statements = await session.scalar(
        select(func.count()).select_from(BankStatementLine)
        .where(BankStatementLine.matched == False)  # noqa: E712
    )

    match_rate = round((matched_count / total_matches * 100), 1) if total_matches else 0.0

    return {
        "total_matches":        total_matches,
        "matched_count":        matched_count,
        "exception_count":      exception_count,
        "resolved_count":       resolved_count,
        "match_rate":           match_rate,
        "open_exceptions":      open_exceptions,
        "high_severity":        high_severity,
        "unprocessed_gateway":  unprocessed_gateway,
        "unmatched_statements": unmatched_statements,
    }
