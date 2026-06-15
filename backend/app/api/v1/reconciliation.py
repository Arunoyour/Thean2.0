"""Reconciliation API — gateway events, statement lines, matches, exceptions."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.db.session import get_session
from app.models.super_admin import SuperAdmin
from app.services import reconciliation_service as svc
from app.services.audit_service import AuditAction, audit

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


# ── Overview ───────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.get_overview(session)


# ── Gateway Events ─────────────────────────────────────────────────────────────

@router.get("/gateway-events")
async def list_gateway_events(
    processed: Optional[bool] = None,
    batch_id: Optional[uuid.UUID] = None,
    limit: int = 50,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.list_gateway_events(
        session, processed=processed, batch_id=batch_id, limit=limit, offset=offset
    )


@router.post("/gateway-events")
async def ingest_gateway_event(
    payload: dict,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_session),
):
    result = await svc.ingest_gateway_event(
        session,
        gateway=payload.get("gateway", "RAZORPAY"),
        event_type=payload["event_type"],
        gateway_reference=payload["gateway_reference"],
        amount=float(payload["amount"]),
        currency=payload.get("currency", "INR"),
        status=payload["status"],
        raw_payload=payload.get("raw_payload", {}),
        batch_id=uuid.UUID(payload["batch_id"]) if payload.get("batch_id") else None,
    )
    await session.commit()
    return result


# ── Bank Statement Lines ───────────────────────────────────────────────────────

@router.get("/statement-lines")
async def list_statement_lines(
    matched: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    from datetime import date
    return await svc.list_statement_lines(
        session,
        matched=matched,
        date_from=date.fromisoformat(date_from) if date_from else None,
        date_to=date.fromisoformat(date_to) if date_to else None,
        limit=limit,
        offset=offset,
    )


@router.post("/statement-lines/import")
async def import_statement_lines(
    payload: dict,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_session),
):
    result = await svc.import_statement_lines(
        session,
        lines=payload["lines"],
        uploaded_by=actor.admin_id,
    )
    await audit(session, actor=actor, action_type=AuditAction.RECON_STATEMENT_IMPORT,
                description=f"Imported {len(result)} bank statement lines")
    await session.commit()
    return {"imported": len(result), "lines": result}


# ── Three-way Match ────────────────────────────────────────────────────────────

@router.post("/match/{batch_id}")
async def run_match(
    batch_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_session),
):
    result = await svc.run_three_way_match(session, batch_id)
    await audit(session, actor=actor, action_type=AuditAction.RECON_MATCH_RUN,
                description=f"Three-way match run for batch {batch_id} — {result['match_type']}",
                target_type="settlement_batch", target_id=str(batch_id))
    await session.commit()
    return result


@router.get("/matches")
async def list_matches(
    batch_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    match_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.list_matches(
        session, batch_id=batch_id, status=status, match_type=match_type,
        limit=limit, offset=offset,
    )


@router.get("/matches/{match_id}")
async def get_match(
    match_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.get_match(session, match_id)


# ── Exceptions ─────────────────────────────────────────────────────────────────

@router.get("/exceptions")
async def list_exceptions(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    exception_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.list_exceptions(
        session, status=status, severity=severity,
        exception_type=exception_type, limit=limit, offset=offset,
    )


@router.get("/exceptions/{exception_id}")
async def get_exception(
    exception_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.get_exception(session, exception_id)


@router.post("/exceptions/{exception_id}/assign")
async def assign_exception(
    exception_id: uuid.UUID,
    payload: dict,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_session),
):
    result = await svc.assign_exception(
        session, exception_id, uuid.UUID(payload["assignee_id"])
    )
    await audit(session, actor=actor, action_type=AuditAction.RECON_EXCEPTION_ASSIGN,
                description=f"Exception {exception_id} assigned",
                target_type="reconciliation_exception", target_id=str(exception_id))
    await session.commit()
    return result


@router.post("/exceptions/{exception_id}/escalate")
async def escalate_exception(
    exception_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_session),
):
    result = await svc.escalate_exception(session, exception_id, actor)
    await audit(session, actor=actor, action_type=AuditAction.RECON_EXCEPTION_ESCALATE,
                description=f"Exception {exception_id} escalated to approval queue",
                target_type="reconciliation_exception", target_id=str(exception_id))
    await session.commit()
    return result


@router.post("/exceptions/{exception_id}/resolve")
async def resolve_exception(
    exception_id: uuid.UUID,
    payload: dict,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_session),
):
    if not payload.get("resolution_notes", "").strip():
        from fastapi import HTTPException
        raise HTTPException(400, "resolution_notes is required.")
    result = await svc.resolve_exception(
        session, exception_id, actor, payload["resolution_notes"]
    )
    await audit(session, actor=actor, action_type=AuditAction.RECON_EXCEPTION_RESOLVE,
                description=f"Exception {exception_id} resolved",
                target_type="reconciliation_exception", target_id=str(exception_id))
    await session.commit()
    return result
