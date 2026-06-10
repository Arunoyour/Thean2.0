"""Settlement API — cycles, batches, ledger, payment proofs."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.db.session import get_session as get_db
from app.models.super_admin import SuperAdmin
from app.services import settlement_service as svc
from app.services.audit_service import AuditAction, audit

router = APIRouter(prefix="/settlement", tags=["settlement"])


# ── Cycles ─────────────────────────────────────────────────────────────────────

@router.get("/cycles")
async def list_cycles(
    status: Optional[str] = None,
    limit: int = 30,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_db),
):
    return await svc.list_cycles(session, status=status, limit=limit, offset=offset)


@router.post("/cycles")
async def create_cycle(
    cycle_date: date,
    cycle_type: str = "DAILY",
    notes: Optional[str] = None,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_db),
):
    result = await svc.create_cycle(
        session,
        cycle_date=cycle_date,
        cycle_type=cycle_type,
        notes=notes,
        created_by=actor.admin_id,
    )
    await audit(session, actor=actor, action_type=AuditAction.SETTLEMENT_CYCLE_CREATE,
                description=f"Created {cycle_type} cycle for {cycle_date}",
                target_type="settlement_cycle", target_id=result["cycle_id"])
    await session.commit()
    return result


@router.get("/cycles/{cycle_id}")
async def get_cycle(
    cycle_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_db),
):
    return await svc.get_cycle(session, cycle_id)


@router.patch("/cycles/{cycle_id}/status")
async def update_cycle_status(
    cycle_id: uuid.UUID,
    status: str,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_db),
):
    result = await svc.update_cycle_status(session, cycle_id, status)
    await audit(session, actor=actor, action_type=AuditAction.SETTLEMENT_CYCLE_STATUS,
                description=f"Cycle status updated to {status}",
                target_type="settlement_cycle", target_id=str(cycle_id))
    await session.commit()
    return result


# ── Batches ────────────────────────────────────────────────────────────────────

@router.get("/batches")
async def list_batches(
    cycle_id: Optional[uuid.UUID] = None,
    stakeholder_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_db),
):
    return await svc.list_batches(
        session,
        cycle_id=cycle_id,
        stakeholder_type=stakeholder_type,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.post("/batches")
async def create_batch(
    payload: dict,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_db),
):
    result = await svc.create_batch(
        session,
        cycle_id=uuid.UUID(payload["cycle_id"]),
        stakeholder_type=payload["stakeholder_type"],
        stakeholder_id=uuid.UUID(payload["stakeholder_id"]),
        stakeholder_name=payload["stakeholder_name"],
        lines=payload["lines"],
        notes=payload.get("notes"),
    )
    await audit(session, actor=actor, action_type=AuditAction.SETTLEMENT_BATCH_CREATE,
                description=f"Created batch for {payload['stakeholder_name']}",
                target_type="settlement_batch", target_id=result["batch_id"])
    await session.commit()
    return result


@router.get("/batches/{batch_id}")
async def get_batch(
    batch_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_db),
):
    return await svc.get_batch(session, batch_id)


@router.post("/batches/{batch_id}/submit")
async def submit_batch(
    batch_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_db),
):
    result = await svc.submit_batch_for_approval(session, batch_id, actor)
    await audit(session, actor=actor, action_type=AuditAction.SETTLEMENT_BATCH_SUBMIT,
                description="Batch submitted for approval",
                target_type="settlement_batch", target_id=str(batch_id))
    await session.commit()
    return result


@router.post("/batches/{batch_id}/execute")
async def execute_batch(
    batch_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_db),
):
    result = await svc.execute_batch(session, batch_id)
    await audit(session, actor=actor, action_type=AuditAction.SETTLEMENT_BATCH_EXECUTE,
                description="Batch executed — ledger updated",
                target_type="settlement_batch", target_id=str(batch_id))
    await session.commit()
    return result


# ── Ledger ─────────────────────────────────────────────────────────────────────

@router.get("/ledger/{stakeholder_type}/{stakeholder_id}")
async def get_ledger(
    stakeholder_type: str,
    stakeholder_id: uuid.UUID,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 100,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_db),
):
    await audit(session, actor=actor, action_type=AuditAction.VIEW_LEDGER,
                description=f"Viewed ledger for {stakeholder_type}:{stakeholder_id}",
                target_type=stakeholder_type.lower(), target_id=str(stakeholder_id))
    result = await svc.get_stakeholder_ledger(
        session,
        stakeholder_type,
        stakeholder_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    await session.commit()
    return result


# ── Payment Proofs ─────────────────────────────────────────────────────────────

@router.get("/batches/{batch_id}/proofs")
async def list_proofs(
    batch_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_db),
):
    return await svc.list_proofs(session, batch_id)


@router.post("/batches/{batch_id}/proofs")
async def upload_proof(
    batch_id: uuid.UUID,
    proof_type: str        = Form(...),
    amount: float          = Form(...),
    payment_method: str    = Form("BANK_TRANSFER"),
    notes: Optional[str]   = Form(None),
    file: Optional[UploadFile] = File(None),
    actor: SuperAdmin      = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession  = Depends(get_db),
):
    result = await svc.upload_proof(
        session,
        batch_id=batch_id,
        proof_type=proof_type,
        amount=amount,
        payment_method=payment_method,
        notes=notes,
        file=file,
        uploaded_by=actor.admin_id,
    )
    await audit(session, actor=actor, action_type=AuditAction.SETTLEMENT_PROOF_UPLOAD,
                description=f"{proof_type} proof uploaded for batch {batch_id}",
                target_type="settlement_batch", target_id=str(batch_id))
    await session.commit()
    return result


@router.post("/proofs/{proof_id}/verify")
async def verify_proof(
    proof_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_db),
):
    result = await svc.verify_proof(session, proof_id, actor.admin_id)
    await audit(session, actor=actor, action_type=AuditAction.SETTLEMENT_PROOF_VERIFY,
                description=f"Proof {proof_id} verified",
                target_type="payment_proof", target_id=str(proof_id))
    await session.commit()
    return result
