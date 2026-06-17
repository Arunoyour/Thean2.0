"""Settlement service — cycle management, batch creation, ledger, proof upload."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.settlement import (
    PaymentProof,
    SettlementBatch,
    SettlementCycle,
    SettlementLine,
    StakeholderLedger,
)
from app.models.super_admin import SuperAdmin

# ── Upload directory ──────────────────────────────────────────────────────────
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "proofs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── Serialisers ───────────────────────────────────────────────────────────────

def _serialize_line(line: SettlementLine) -> dict:
    return {
        "line_id":       str(line.line_id),
        "line_type":     line.line_type,
        "reference_type": line.reference_type,
        "reference_id":  str(line.reference_id) if line.reference_id else None,
        "description":   line.description,
        "amount":        float(line.amount),
        "created_at":    line.created_at.isoformat(),
    }


def _serialize_proof(proof: PaymentProof) -> dict:
    return {
        "proof_id":       str(proof.proof_id),
        "batch_id":       str(proof.batch_id),
        "proof_type":     proof.proof_type,
        "amount":         float(proof.amount),
        "payment_method": proof.payment_method,
        "file_path":      proof.file_path,
        "notes":          proof.notes,
        "uploaded_by":    str(proof.uploaded_by) if proof.uploaded_by else None,
        "verified":       proof.verified,
        "verified_by":    str(proof.verified_by) if proof.verified_by else None,
        "verified_at":    proof.verified_at.isoformat() if proof.verified_at else None,
        "created_at":     proof.created_at.isoformat(),
    }


def _serialize_batch(
    batch: SettlementBatch,
    *,
    include_lines: bool = False,
    include_proofs: bool = False,
    include_cycle: bool = False,
) -> dict:
    data: dict = {
        "batch_id":          str(batch.batch_id),
        "cycle_id":          str(batch.cycle_id),
        "stakeholder_type":  batch.stakeholder_type,
        "stakeholder_id":    str(batch.stakeholder_id),
        "stakeholder_name":  batch.stakeholder_name,
        "opening_balance":   float(batch.opening_balance),
        "closing_balance":   float(batch.closing_balance),
        "total_credits":     float(batch.total_credits),
        "total_debits":      float(batch.total_debits),
        "net_payable":       float(batch.net_payable),
        "status":            batch.status,
        "approval_request_id": str(batch.approval_request_id) if batch.approval_request_id else None,
        "retry_count":       batch.retry_count,
        "notes":             batch.notes,
        "created_at":        batch.created_at.isoformat(),
        "updated_at":        batch.updated_at.isoformat(),
    }
    if include_lines:
        data["lines"] = [_serialize_line(l) for l in batch.lines]
    if include_proofs:
        data["proofs"] = [_serialize_proof(p) for p in batch.proofs]
    if include_cycle:
        # Only safe to access batch.cycle when the caller has eager-loaded it
        # (selectinload) — otherwise this would trigger an async lazy-load error.
        data["cycle_date"] = batch.cycle.cycle_date.isoformat() if batch.cycle else None
        data["cycle_type"] = batch.cycle.cycle_type if batch.cycle else None
    return data


def _serialize_cycle(cycle: SettlementCycle, *, include_batches: bool = False) -> dict:
    data: dict = {
        "cycle_id":    str(cycle.cycle_id),
        "cycle_date":  cycle.cycle_date.isoformat(),
        "cycle_type":  cycle.cycle_type,
        "status":      cycle.status,
        "notes":       cycle.notes,
        "created_by":  str(cycle.created_by) if cycle.created_by else None,
        "executed_at": cycle.executed_at.isoformat() if cycle.executed_at else None,
        "created_at":  cycle.created_at.isoformat(),
        "updated_at":  cycle.updated_at.isoformat(),
        "batch_count": len(cycle.batches),
        "total_payable": float(sum(b.net_payable for b in cycle.batches)),
    }
    if include_batches:
        data["batches"] = [_serialize_batch(b) for b in cycle.batches]
    return data


def _serialize_ledger_entry(entry: StakeholderLedger) -> dict:
    return {
        "entry_id":        str(entry.entry_id),
        "stakeholder_type": entry.stakeholder_type,
        "stakeholder_id":  str(entry.stakeholder_id),
        "stakeholder_name": entry.stakeholder_name,
        "entry_type":      entry.entry_type,
        "amount":          float(entry.amount),
        "running_balance": float(entry.running_balance),
        "reference_type":  entry.reference_type,
        "reference_id":    str(entry.reference_id) if entry.reference_id else None,
        "description":     entry.description,
        "batch_id":        str(entry.batch_id) if entry.batch_id else None,
        "created_at":      entry.created_at.isoformat(),
    }


# ── Ledger helper ─────────────────────────────────────────────────────────────

async def get_running_balance(
    session: AsyncSession,
    stakeholder_type: str,
    stakeholder_id: uuid.UUID,
) -> float:
    """Return the latest running_balance for a stakeholder, or 0.00."""
    result = await session.execute(
        select(StakeholderLedger.running_balance)
        .where(
            StakeholderLedger.stakeholder_type == stakeholder_type,
            StakeholderLedger.stakeholder_id == stakeholder_id,
        )
        .order_by(StakeholderLedger.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return float(row) if row is not None else 0.00


async def append_ledger_entry(
    session: AsyncSession,
    *,
    stakeholder_type: str,
    stakeholder_id: uuid.UUID,
    stakeholder_name: str,
    entry_type: str,
    amount: float,
    reference_type: str,
    description: str,
    reference_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
) -> StakeholderLedger:
    current = await get_running_balance(session, stakeholder_type, stakeholder_id)
    new_balance = current + amount if entry_type == "CREDIT" else current - amount
    entry = StakeholderLedger(
        stakeholder_type=stakeholder_type,
        stakeholder_id=stakeholder_id,
        stakeholder_name=stakeholder_name,
        entry_type=entry_type,
        amount=amount,
        running_balance=new_balance,
        reference_type=reference_type,
        reference_id=reference_id,
        description=description,
        batch_id=batch_id,
    )
    session.add(entry)
    return entry


# ── Cycle operations ──────────────────────────────────────────────────────────

async def list_cycles(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 30,
    offset: int = 0,
) -> list[dict]:
    q = select(SettlementCycle).order_by(SettlementCycle.cycle_date.desc())
    if status:
        q = q.where(SettlementCycle.status == status)
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_cycle(c) for c in result.scalars().all()]


async def create_cycle(
    session: AsyncSession,
    *,
    cycle_date: date,
    cycle_type: str = "DAILY",
    notes: str | None = None,
    created_by: uuid.UUID | None = None,
) -> dict:
    # Prevent duplicate cycles for same date + type
    existing = await session.execute(
        select(SettlementCycle).where(
            SettlementCycle.cycle_date == cycle_date,
            SettlementCycle.cycle_type == cycle_type,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"A {cycle_type} settlement cycle already exists for {cycle_date}.")

    cycle = SettlementCycle(
        cycle_date=cycle_date,
        cycle_type=cycle_type,
        notes=notes,
        created_by=created_by,
    )
    session.add(cycle)
    await session.flush()
    await session.refresh(cycle)
    return _serialize_cycle(cycle)


async def get_cycle(session: AsyncSession, cycle_id: uuid.UUID) -> dict:
    result = await session.execute(
        select(SettlementCycle).where(SettlementCycle.cycle_id == cycle_id)
    )
    cycle = result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Settlement cycle not found.")
    return _serialize_cycle(cycle, include_batches=True)


async def update_cycle_status(
    session: AsyncSession,
    cycle_id: uuid.UUID,
    new_status: str,
) -> dict:
    result = await session.execute(
        select(SettlementCycle).where(SettlementCycle.cycle_id == cycle_id)
    )
    cycle = result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Settlement cycle not found.")
    cycle.status = new_status
    if new_status == "EXECUTED":
        cycle.executed_at = datetime.utcnow()
    await session.flush()
    return _serialize_cycle(cycle)


# ── Batch operations ──────────────────────────────────────────────────────────

async def list_batches(
    session: AsyncSession,
    *,
    cycle_id: uuid.UUID | None = None,
    stakeholder_type: str | None = None,
    stakeholder_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    q = select(SettlementBatch).options(selectinload(SettlementBatch.cycle)).order_by(SettlementBatch.created_at.desc())
    if cycle_id:
        q = q.where(SettlementBatch.cycle_id == cycle_id)
    if stakeholder_type:
        q = q.where(SettlementBatch.stakeholder_type == stakeholder_type)
    if stakeholder_id:
        q = q.where(SettlementBatch.stakeholder_id == stakeholder_id)
    if status:
        q = q.where(SettlementBatch.status == status)
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_batch(b, include_cycle=True) for b in result.scalars().all()]


async def create_batch(
    session: AsyncSession,
    *,
    cycle_id: uuid.UUID,
    stakeholder_type: str,
    stakeholder_id: uuid.UUID,
    stakeholder_name: str,
    lines: list[dict],
    notes: str | None = None,
) -> dict:
    idempotency_key = f"{cycle_id}:{stakeholder_type}:{stakeholder_id}"

    # Idempotency — return existing batch if already created
    existing = await session.execute(
        select(SettlementBatch).where(SettlementBatch.idempotency_key == idempotency_key)
    )
    if existing_batch := existing.scalar_one_or_none():
        return _serialize_batch(existing_batch, include_lines=True)

    # Verify cycle exists and is OPEN or GENERATING
    cycle_result = await session.execute(
        select(SettlementCycle).where(SettlementCycle.cycle_id == cycle_id)
    )
    cycle = cycle_result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Settlement cycle not found.")
    if cycle.status not in ("OPEN", "GENERATING"):
        raise HTTPException(400, f"Cannot add batches to a cycle in status '{cycle.status}'.")

    # Snapshot opening balance
    opening_balance = await get_running_balance(session, stakeholder_type, stakeholder_id)

    # Calculate totals
    total_credits = sum(float(l["amount"]) for l in lines if l["line_type"] == "CREDIT")
    total_debits  = sum(float(l["amount"]) for l in lines if l["line_type"] == "DEBIT")
    net_payable   = total_credits - total_debits
    closing_balance = opening_balance + net_payable

    batch = SettlementBatch(
        cycle_id=cycle_id,
        stakeholder_type=stakeholder_type,
        stakeholder_id=stakeholder_id,
        stakeholder_name=stakeholder_name,
        opening_balance=opening_balance,
        closing_balance=closing_balance,
        total_credits=total_credits,
        total_debits=total_debits,
        net_payable=net_payable,
        idempotency_key=idempotency_key,
        notes=notes,
    )
    batch.cycle = cycle  # populate relationship in-memory to avoid an async lazy-load on serialize
    session.add(batch)
    await session.flush()

    # Insert lines
    for l in lines:
        session.add(SettlementLine(
            batch_id=batch.batch_id,
            line_type=l["line_type"],
            reference_type=l["reference_type"],
            reference_id=uuid.UUID(l["reference_id"]) if l.get("reference_id") else None,
            description=l["description"],
            amount=float(l["amount"]),
        ))

    await session.flush()
    await session.refresh(batch)
    return _serialize_batch(batch, include_lines=True)


async def get_batch(session: AsyncSession, batch_id: uuid.UUID) -> dict:
    result = await session.execute(
        select(SettlementBatch)
        .options(selectinload(SettlementBatch.cycle))
        .where(SettlementBatch.batch_id == batch_id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Settlement batch not found.")
    return _serialize_batch(batch, include_lines=True, include_proofs=True, include_cycle=True)


async def submit_batch_for_approval(
    session: AsyncSession,
    batch_id: uuid.UUID,
    actor: SuperAdmin,
) -> dict:
    """Move batch from DRAFT → PENDING_APPROVAL by creating an approval_request."""
    from app.services.approval_service import create_approval_request

    result = await session.execute(
        select(SettlementBatch).where(SettlementBatch.batch_id == batch_id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Settlement batch not found.")
    if batch.status != "DRAFT":
        raise HTTPException(400, f"Batch is already in status '{batch.status}'.")

    # Build approval lines from settlement lines
    approval_lines = [
        {
            "stakeholder_type": batch.stakeholder_type,
            "stakeholder_id":   str(batch.stakeholder_id),
            "stakeholder_name": batch.stakeholder_name,
            "description":      f"Net payout for {batch.stakeholder_name} — {batch.stakeholder_type}",
            "amount":           str(batch.net_payable),
        }
    ]

    req = await create_approval_request(
        session,
        request_type="SETTLEMENT_PAYOUT",
        payload={"batch_id": str(batch_id)},
        lines=approval_lines,
        idempotency_key=f"settlement_batch:{batch_id}",
        requested_by=actor.admin_id,
    )

    batch.status = "PENDING_APPROVAL"
    batch.approval_request_id = uuid.UUID(req["request_id"])
    await session.flush()
    return _serialize_batch(batch, include_lines=True)


async def execute_batch(session: AsyncSession, batch_id: uuid.UUID) -> dict:
    """Mark batch EXECUTED and write the closing ledger entry."""
    result = await session.execute(
        select(SettlementBatch).where(SettlementBatch.batch_id == batch_id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Settlement batch not found.")
    if batch.status not in ("APPROVED",):
        raise HTTPException(400, f"Cannot execute batch in status '{batch.status}'.")

    # Append payout entry to ledger
    await append_ledger_entry(
        session,
        stakeholder_type=batch.stakeholder_type,
        stakeholder_id=batch.stakeholder_id,
        stakeholder_name=batch.stakeholder_name,
        entry_type="DEBIT" if batch.net_payable >= 0 else "CREDIT",
        amount=abs(batch.net_payable),
        reference_type="SETTLEMENT_PAYOUT",
        description=f"Settlement payout — batch {batch_id}",
        batch_id=batch.batch_id,
    )

    batch.status = "EXECUTED"
    batch.updated_at = datetime.utcnow()
    await session.flush()
    return _serialize_batch(batch)


# ── Ledger queries ────────────────────────────────────────────────────────────

async def get_stakeholder_ledger(
    session: AsyncSession,
    stakeholder_type: str,
    stakeholder_id: uuid.UUID,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    q = (
        select(StakeholderLedger)
        .where(
            StakeholderLedger.stakeholder_type == stakeholder_type,
            StakeholderLedger.stakeholder_id == stakeholder_id,
        )
        .order_by(StakeholderLedger.created_at.desc())
    )
    if date_from:
        q = q.where(StakeholderLedger.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(StakeholderLedger.created_at <= datetime.combine(date_to, datetime.max.time()))
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    entries = result.scalars().all()
    current_balance = await get_running_balance(session, stakeholder_type, stakeholder_id)
    return {
        "stakeholder_type": stakeholder_type,
        "stakeholder_id":   str(stakeholder_id),
        "current_balance":  current_balance,
        "entries":          [_serialize_ledger_entry(e) for e in entries],
    }


# ── Payment proof operations ──────────────────────────────────────────────────

async def upload_proof(
    session: AsyncSession,
    *,
    batch_id: uuid.UUID,
    proof_type: str,
    amount: float,
    payment_method: str,
    notes: str | None,
    file: UploadFile | None,
    uploaded_by: uuid.UUID,
) -> dict:
    # Verify batch exists
    batch_result = await session.execute(
        select(SettlementBatch).where(SettlementBatch.batch_id == batch_id)
    )
    if not batch_result.scalar_one_or_none():
        raise HTTPException(404, "Settlement batch not found.")

    file_path: str | None = None
    if file and file.filename:
        ext = Path(file.filename).suffix
        safe_name = f"{uuid.uuid4()}{ext}"
        dest = UPLOAD_DIR / safe_name
        content = await file.read()
        dest.write_bytes(content)
        file_path = f"uploads/proofs/{safe_name}"

    proof = PaymentProof(
        batch_id=batch_id,
        proof_type=proof_type,
        amount=amount,
        payment_method=payment_method,
        file_path=file_path,
        notes=notes,
        uploaded_by=uploaded_by,
    )
    session.add(proof)
    await session.flush()
    return _serialize_proof(proof)


async def verify_proof(
    session: AsyncSession,
    proof_id: uuid.UUID,
    verifier_id: uuid.UUID,
) -> dict:
    result = await session.execute(
        select(PaymentProof).where(PaymentProof.proof_id == proof_id)
    )
    proof = result.scalar_one_or_none()
    if not proof:
        raise HTTPException(404, "Payment proof not found.")
    proof.verified    = True
    proof.verified_by = verifier_id
    proof.verified_at = datetime.utcnow()
    await session.flush()
    return _serialize_proof(proof)


async def list_proofs(session: AsyncSession, batch_id: uuid.UUID) -> list[dict]:
    result = await session.execute(
        select(PaymentProof)
        .where(PaymentProof.batch_id == batch_id)
        .order_by(PaymentProof.created_at.desc())
    )
    return [_serialize_proof(p) for p in result.scalars().all()]
