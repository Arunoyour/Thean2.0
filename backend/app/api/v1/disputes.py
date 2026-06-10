"""Dispute Management API."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.db.session import get_session
from app.models.super_admin import SuperAdmin
from app.services import dispute_service as svc
from app.services.audit_service import AuditAction, audit

router = APIRouter(prefix="/disputes", tags=["disputes"])


# ── Overview & List ────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.get_overview(session)


@router.get("")
async def list_disputes(
    raised_by_app: Optional[str]      = None,
    status: Optional[str]             = None,
    dispute_type: Optional[str]       = None,
    limit: int = 50,
    offset: int = 0,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.list_disputes(
        session,
        raised_by_app=raised_by_app,
        status=status,
        dispute_type=dispute_type,
        limit=limit,
        offset=offset,
    )


@router.get("/{dispute_id}")
async def get_dispute(
    dispute_id: uuid.UUID,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    return await svc.get_dispute(session, dispute_id)


# ── Raise (from admin portal — for testing; stakeholder apps call their own endpoints) ──

@router.post("")
async def raise_dispute(
    raised_by_app: str         = Form(...),
    raised_by_id: str          = Form(...),
    raised_by_name: str        = Form(...),
    dispute_type: str          = Form(...),
    reference_type: str        = Form(...),
    reference_id: Optional[str] = Form(None),
    reference_detail: str      = Form("{}"),          # JSON string
    text_content: Optional[str] = Form(None),
    voice_duration_secs: Optional[int] = Form(None),
    voice_file: Optional[UploadFile]   = File(None),
    image_file: Optional[UploadFile]   = File(None),
    attachment_file: Optional[UploadFile] = File(None),
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_session),
):
    import json
    result = await svc.raise_dispute(
        session,
        raised_by_app=raised_by_app,
        raised_by_id=uuid.UUID(raised_by_id),
        raised_by_name=raised_by_name,
        dispute_type=dispute_type,
        reference_type=reference_type,
        reference_id=uuid.UUID(reference_id) if reference_id else None,
        reference_detail=json.loads(reference_detail),
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await audit(session, actor=actor, action_type=AuditAction.DISPUTE_RAISE,
                description=f"Dispute raised for {raised_by_app}:{raised_by_id}",
                target_type="dispute", target_id=result["dispute_id"])
    await session.commit()
    return result


# ── Admin reply ────────────────────────────────────────────────────────────────

@router.post("/{dispute_id}/reply")
async def add_reply(
    dispute_id: uuid.UUID,
    text_content: Optional[str]       = Form(None),
    voice_duration_secs: Optional[int] = Form(None),
    is_internal: bool                 = Form(False),
    voice_file: Optional[UploadFile]  = File(None),
    image_file: Optional[UploadFile]  = File(None),
    attachment_file: Optional[UploadFile] = File(None),
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_session),
):
    result = await svc.add_admin_reply(
        session, dispute_id, actor,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
        is_internal=is_internal,
    )
    await audit(session, actor=actor, action_type=AuditAction.DISPUTE_REPLY,
                description=f"Admin reply on dispute {dispute_id}",
                target_type="dispute", target_id=str(dispute_id))
    await session.commit()
    return result


# ── Assign ─────────────────────────────────────────────────────────────────────

@router.post("/{dispute_id}/assign")
async def assign_dispute(
    dispute_id: uuid.UUID,
    payload: dict,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_session),
):
    result = await svc.assign_dispute(
        session, dispute_id, uuid.UUID(payload["assignee_id"]), actor
    )
    await audit(session, actor=actor, action_type=AuditAction.DISPUTE_ASSIGN,
                description=f"Dispute {dispute_id} assigned",
                target_type="dispute", target_id=str(dispute_id))
    await session.commit()
    return result


# ── Resolve ────────────────────────────────────────────────────────────────────

@router.post("/{dispute_id}/resolve")
async def resolve_dispute(
    dispute_id: uuid.UUID,
    payload: dict,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_session),
):
    if not payload.get("resolution_notes", "").strip():
        from fastapi import HTTPException
        raise HTTPException(400, "resolution_notes is required.")
    result = await svc.resolve_dispute(
        session, dispute_id, actor, payload["resolution_notes"]
    )
    await audit(session, actor=actor, action_type=AuditAction.DISPUTE_RESOLVE,
                description=f"Dispute {dispute_id} resolved",
                target_type="dispute", target_id=str(dispute_id))
    await session.commit()
    return result


# ── Reopen ─────────────────────────────────────────────────────────────────────

@router.post("/{dispute_id}/reopen")
async def reopen_dispute(
    dispute_id: uuid.UUID,
    raised_by_id: str             = Form(...),
    raised_by_name: str           = Form(...),
    raised_by_app: str            = Form(...),
    text_content: Optional[str]   = Form(None),
    voice_duration_secs: Optional[int] = Form(None),
    voice_file: Optional[UploadFile]   = File(None),
    image_file: Optional[UploadFile]   = File(None),
    attachment_file: Optional[UploadFile] = File(None),
    session: AsyncSession = Depends(get_session),
    # No role guard — stakeholder apps also call this; auth handled by caller
):
    result = await svc.reopen_dispute(
        session,
        dispute_id=dispute_id,
        raised_by_id=uuid.UUID(raised_by_id),
        raised_by_name=raised_by_name,
        raised_by_app=raised_by_app,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await session.commit()
    return result
