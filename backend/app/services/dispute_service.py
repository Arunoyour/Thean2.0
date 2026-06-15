"""Dispute service — raise, review, resolve, reopen lifecycle with media support."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dispute import Dispute, DisputeMessage, DisputeStatusHistory
from app.models.super_admin import SuperAdmin

ADMIN_CLOSE_MIN_DAYS = 60

VOICE_DIR      = Path(__file__).resolve().parents[2] / "uploads" / "disputes" / "voice"
IMAGE_DIR      = Path(__file__).resolve().parents[2] / "uploads" / "disputes" / "images"
ATTACH_DIR     = Path(__file__).resolve().parents[2] / "uploads" / "disputes" / "files"
MAX_VOICE_SECS = 180  # 3 minutes

for _d in (VOICE_DIR, IMAGE_DIR, ATTACH_DIR):
    _d.mkdir(parents=True, exist_ok=True)


# ── Serialisers ───────────────────────────────────────────────────────────────

def _serialize_message(m: DisputeMessage) -> dict:
    return {
        "message_id":         str(m.message_id),
        "dispute_id":         str(m.dispute_id),
        "sender_type":        m.sender_type,
        "sender_id":          str(m.sender_id) if m.sender_id else None,
        "sender_name":        m.sender_name,
        "text_content":       m.text_content,
        "voice_file_path":    m.voice_file_path,
        "voice_duration_secs": m.voice_duration_secs,
        "image_file_path":    m.image_file_path,
        "attachment_path":    m.attachment_path,
        "attachment_name":    m.attachment_name,
        "is_internal":        m.is_internal,
        "created_at":         m.created_at.isoformat(),
    }


def _serialize_history(h: DisputeStatusHistory) -> dict:
    return {
        "history_id":     str(h.history_id),
        "old_status":     h.old_status,
        "new_status":     h.new_status,
        "changed_by":     str(h.changed_by) if h.changed_by else None,
        "changed_by_name": h.changed_by_name,
        "notes":          h.notes,
        "created_at":     h.created_at.isoformat(),
    }


def _serialize_dispute(d: Dispute, *, include_messages: bool = False, include_history: bool = False) -> dict:
    age_days = (datetime.utcnow() - d.created_at).days
    data: dict = {
        "dispute_id":       str(d.dispute_id),
        "raised_by_app":    d.raised_by_app,
        "raised_by_id":     str(d.raised_by_id),
        "raised_by_name":   d.raised_by_name,
        "dispute_type":     d.dispute_type,
        "reference_type":   d.reference_type,
        "reference_id":     str(d.reference_id) if d.reference_id else None,
        "reference_detail": d.reference_detail,
        "status":           d.status,
        "assigned_to":      str(d.assigned_to) if d.assigned_to else None,
        "resolution_notes": d.resolution_notes,
        "resolved_by":      str(d.resolved_by) if d.resolved_by else None,
        "resolved_at":      d.resolved_at.isoformat() if d.resolved_at else None,
        "reopened_count":   d.reopened_count,
        "reopened_at":      d.reopened_at.isoformat() if d.reopened_at else None,
        "message_count":    len(d.messages),
        "created_at":       d.created_at.isoformat(),
        "updated_at":       d.updated_at.isoformat(),
        # order-dispute extensions
        "source_order_id":  str(d.source_order_id) if d.source_order_id else None,
        "tagged_sectors":   d.tagged_sectors or [],
        "unread_by_raiser": d.unread_by_raiser,
        "unread_by_admin":  d.unread_by_admin,
        "closed_by_raiser": d.closed_by_raiser,
        "age_days":         age_days,
        "admin_can_close":  age_days >= ADMIN_CLOSE_MIN_DAYS,
    }
    if include_messages:
        data["messages"] = [_serialize_message(m) for m in d.messages]
    if include_history:
        data["history"] = [_serialize_history(h) for h in d.history]
    return data


# ── File helpers ──────────────────────────────────────────────────────────────

async def _save_file(upload: UploadFile, dest_dir: Path) -> str:
    ext       = Path(upload.filename).suffix if upload.filename else ""
    safe_name = f"{uuid.uuid4()}{ext}"
    dest      = dest_dir / safe_name
    dest.write_bytes(await upload.read())
    return str(dest.relative_to(Path(__file__).resolve().parents[2]))


async def _build_message(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    sender_type: str,
    sender_id: uuid.UUID | None,
    sender_name: str,
    text_content: str | None,
    voice_file: UploadFile | None,
    voice_duration_secs: int | None,
    image_file: UploadFile | None,
    attachment_file: UploadFile | None,
    is_internal: bool = False,
) -> DisputeMessage:
    # Validate at least one content piece
    has_text  = bool(text_content and text_content.strip())
    has_voice = voice_file is not None and voice_file.filename
    has_image = image_file is not None and image_file.filename
    has_attach = attachment_file is not None and attachment_file.filename

    if not any([has_text, has_voice, has_image, has_attach]):
        raise HTTPException(400, "At least one of text, voice, image, or file attachment is required.")

    # Validate voice duration
    if voice_duration_secs and voice_duration_secs > MAX_VOICE_SECS:
        raise HTTPException(400, f"Voice recording cannot exceed {MAX_VOICE_SECS} seconds (3 minutes).")

    voice_path  = await _save_file(voice_file,      VOICE_DIR)  if has_voice  else None
    image_path  = await _save_file(image_file,      IMAGE_DIR)  if has_image  else None
    attach_path = await _save_file(attachment_file, ATTACH_DIR) if has_attach else None

    msg = DisputeMessage(
        dispute_id=dispute_id,
        sender_type=sender_type,
        sender_id=sender_id,
        sender_name=sender_name,
        text_content=text_content if has_text else None,
        voice_file_path=voice_path,
        voice_duration_secs=voice_duration_secs if has_voice else None,
        image_file_path=image_path,
        attachment_path=attach_path,
        attachment_name=attachment_file.filename if has_attach else None,
        is_internal=is_internal,
    )
    session.add(msg)
    return msg


def _add_history(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    old_status: str | None,
    new_status: str,
    changed_by: SuperAdmin | None = None,
    notes: str | None = None,
) -> DisputeStatusHistory:
    h = DisputeStatusHistory(
        dispute_id=dispute_id,
        old_status=old_status,
        new_status=new_status,
        changed_by=changed_by.admin_id if changed_by else None,
        changed_by_name=changed_by.full_name if changed_by else "SYSTEM",
        notes=notes,
    )
    session.add(h)
    return h


# ── Raise Dispute ─────────────────────────────────────────────────────────────

async def raise_dispute(
    session: AsyncSession,
    *,
    raised_by_app: str,
    raised_by_id: uuid.UUID,
    raised_by_name: str,
    dispute_type: str,
    reference_type: str,
    reference_id: uuid.UUID | None,
    reference_detail: dict,
    text_content: str | None,
    voice_file: UploadFile | None,
    voice_duration_secs: int | None,
    image_file: UploadFile | None,
    attachment_file: UploadFile | None,
) -> dict:
    dispute = Dispute(
        raised_by_app=raised_by_app,
        raised_by_id=raised_by_id,
        raised_by_name=raised_by_name,
        dispute_type=dispute_type,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_detail=reference_detail,
    )
    session.add(dispute)
    await session.flush()

    await _build_message(
        session,
        dispute_id=dispute.dispute_id,
        sender_type=raised_by_app,
        sender_id=raised_by_id,
        sender_name=raised_by_name,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
        is_internal=False,
    )

    _add_history(session, dispute.dispute_id, None, "OPEN", notes="Dispute raised")
    await session.flush()
    await session.refresh(dispute)
    return _serialize_dispute(dispute, include_messages=True)


# ── Admin reply ───────────────────────────────────────────────────────────────

async def admin_reply_and_mark_unread(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    actor: SuperAdmin,
    *,
    text_content: str | None,
    voice_file: UploadFile | None,
    voice_duration_secs: int | None,
    image_file: UploadFile | None,
    attachment_file: UploadFile | None,
    is_internal: bool = False,
) -> dict:
    """Admin sends a reply — marks dispute unread for the raiser."""
    return await add_admin_reply(
        session,
        dispute_id,
        actor,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
        is_internal=is_internal,
        _mark_unread_raiser=True,
    )


async def add_admin_reply(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    actor: SuperAdmin,
    *,
    text_content: str | None,
    voice_file: UploadFile | None,
    voice_duration_secs: int | None,
    image_file: UploadFile | None,
    attachment_file: UploadFile | None,
    is_internal: bool = False,
    _mark_unread_raiser: bool = False,
) -> dict:
    dispute = await _get_or_404(session, dispute_id)
    if dispute.status == "CLOSED":
        raise HTTPException(400, "Cannot reply to a closed dispute.")

    await _build_message(
        session,
        dispute_id=dispute_id,
        sender_type="ADMIN",
        sender_id=actor.admin_id,
        sender_name=actor.full_name,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
        is_internal=is_internal,
    )

    # Move to IN_REVIEW if still OPEN
    if dispute.status == "OPEN":
        _add_history(session, dispute_id, "OPEN", "IN_REVIEW", changed_by=actor, notes="Admin replied")
        dispute.status = "IN_REVIEW"
        dispute.assigned_to = actor.admin_id

    # Notify raiser of new reply
    dispute.unread_by_raiser = True
    dispute.unread_by_admin  = False
    dispute.updated_at = datetime.utcnow()

    await session.flush()
    return _serialize_message(dispute.messages[-1]) if dispute.messages else {}


# ── Assign ────────────────────────────────────────────────────────────────────

async def assign_dispute(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    assignee_id: uuid.UUID,
    actor: SuperAdmin,
) -> dict:
    dispute = await _get_or_404(session, dispute_id)
    dispute.assigned_to = assignee_id
    dispute.updated_at  = datetime.utcnow()
    _add_history(session, dispute_id, dispute.status, dispute.status,
                 changed_by=actor, notes=f"Assigned to admin {assignee_id}")
    await session.flush()
    return _serialize_dispute(dispute)


# ── Resolve ───────────────────────────────────────────────────────────────────

async def resolve_dispute(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    actor: SuperAdmin,
    resolution_notes: str,
) -> dict:
    dispute = await _get_or_404(session, dispute_id)
    if dispute.status in ("RESOLVED", "CLOSED"):
        raise HTTPException(400, f"Dispute is already {dispute.status}.")

    old_status = dispute.status
    dispute.status           = "RESOLVED"
    dispute.resolution_notes = resolution_notes
    dispute.resolved_by      = actor.admin_id
    dispute.resolved_at      = datetime.utcnow()
    dispute.updated_at       = datetime.utcnow()

    _add_history(session, dispute_id, old_status, "RESOLVED",
                 changed_by=actor, notes=resolution_notes)

    # System message with resolution
    session.add(DisputeMessage(
        dispute_id=dispute_id,
        sender_type="ADMIN",
        sender_id=actor.admin_id,
        sender_name=actor.full_name,
        text_content=f"Dispute resolved: {resolution_notes}",
        is_internal=False,
    ))

    await session.flush()
    await session.refresh(dispute)
    return _serialize_dispute(dispute, include_messages=True, include_history=True)


# ── Reopen ────────────────────────────────────────────────────────────────────

async def reopen_dispute(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    *,
    raised_by_id: uuid.UUID,
    raised_by_name: str,
    raised_by_app: str,
    text_content: str | None,
    voice_file: UploadFile | None,
    voice_duration_secs: int | None,
    image_file: UploadFile | None,
    attachment_file: UploadFile | None,
) -> dict:
    dispute = await _get_or_404(session, dispute_id)
    if dispute.status not in ("RESOLVED",):
        raise HTTPException(400, "Only resolved disputes can be reopened.")
    if str(dispute.raised_by_id) != str(raised_by_id):
        raise HTTPException(403, "Only the original raiser can reopen this dispute.")

    old_status = dispute.status
    dispute.status         = "REOPENED"
    dispute.reopened_count += 1
    dispute.reopened_at    = datetime.utcnow()
    dispute.resolution_notes = None
    dispute.resolved_by    = None
    dispute.resolved_at    = None
    dispute.updated_at     = datetime.utcnow()

    _add_history(session, dispute_id, old_status, "REOPENED",
                 notes=f"Dispute reopened (count: {dispute.reopened_count})")

    await _build_message(
        session,
        dispute_id=dispute_id,
        sender_type=raised_by_app,
        sender_id=raised_by_id,
        sender_name=raised_by_name,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
        is_internal=False,
    )

    await session.flush()
    await session.refresh(dispute)
    return _serialize_dispute(dispute, include_messages=True)


# ── Queries ───────────────────────────────────────────────────────────────────

async def list_disputes(
    session: AsyncSession,
    *,
    raised_by_app: str | None = None,
    raised_by_id: uuid.UUID | None = None,
    status: str | None = None,
    dispute_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    q = select(Dispute).order_by(Dispute.created_at.desc())
    if raised_by_app:
        q = q.where(Dispute.raised_by_app == raised_by_app)
    if raised_by_id:
        q = q.where(Dispute.raised_by_id == raised_by_id)
    if status:
        q = q.where(Dispute.status == status)
    if dispute_type:
        q = q.where(Dispute.dispute_type == dispute_type)
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_dispute(d) for d in result.scalars().all()]


async def get_dispute(session: AsyncSession, dispute_id: uuid.UUID) -> dict:
    d = await _get_or_404(session, dispute_id)
    return _serialize_dispute(d, include_messages=True, include_history=True)


async def get_overview(session: AsyncSession) -> dict:
    total   = await session.scalar(select(func.count()).select_from(Dispute))
    open_   = await session.scalar(select(func.count()).select_from(Dispute).where(Dispute.status == "OPEN"))
    review  = await session.scalar(select(func.count()).select_from(Dispute).where(Dispute.status == "IN_REVIEW"))
    resolved = await session.scalar(select(func.count()).select_from(Dispute).where(Dispute.status == "RESOLVED"))
    reopened = await session.scalar(select(func.count()).select_from(Dispute).where(Dispute.status == "REOPENED"))

    by_app = {}
    for app in ("CUSTOMER", "PHARMACY", "DELIVERY_BOY", "TEAM_LEAD"):
        count = await session.scalar(
            select(func.count()).select_from(Dispute).where(Dispute.raised_by_app == app)
        )
        by_app[app.lower()] = count

    return {
        "total": total, "open": open_, "in_review": review,
        "resolved": resolved, "reopened": reopened, "by_app": by_app,
    }


async def _get_or_404(session: AsyncSession, dispute_id: uuid.UUID) -> Dispute:
    result = await session.execute(
        select(Dispute).where(Dispute.dispute_id == dispute_id)
    )
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Dispute not found.")
    return d


# ── Admin close (60-day rule) ─────────────────────────────────────────────────

async def admin_close_dispute(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    actor: SuperAdmin,
    resolution_notes: str,
) -> dict:
    dispute = await _get_or_404(session, dispute_id)
    if dispute.status == "CLOSED":
        raise HTTPException(400, "Dispute is already closed.")
    age_days = (datetime.utcnow() - dispute.created_at).days
    if age_days < ADMIN_CLOSE_MIN_DAYS:
        days_left = ADMIN_CLOSE_MIN_DAYS - age_days
        raise HTTPException(
            400,
            f"Admin can only close disputes that are at least {ADMIN_CLOSE_MIN_DAYS} days old. "
            f"This dispute is {age_days} days old — {days_left} more day(s) required."
        )
    old_status = dispute.status
    dispute.status           = "CLOSED"
    dispute.closed_by_raiser = False
    dispute.resolution_notes = resolution_notes
    dispute.resolved_by      = actor.admin_id
    dispute.resolved_at      = datetime.utcnow()
    dispute.updated_at       = datetime.utcnow()
    _add_history(session, dispute_id, old_status, "CLOSED", changed_by=actor, notes=resolution_notes)
    await session.flush()
    await session.refresh(dispute)
    return _serialize_dispute(dispute, include_messages=True)


# ── User-facing: raise order dispute ─────────────────────────────────────────

async def user_raise_order_dispute(
    session: AsyncSession,
    *,
    raised_by_app: str,
    raised_by_id: uuid.UUID,
    raised_by_name: str,
    source_order_id: uuid.UUID,
    tagged_sectors: list[str],
    text_content: str | None,
    voice_file: UploadFile | None,
    voice_duration_secs: int | None,
    image_file: UploadFile | None,
    attachment_file: UploadFile | None,
) -> dict:
    # Enforce: no open dispute for same user + order
    existing = await session.execute(
        select(Dispute).where(
            Dispute.raised_by_id == raised_by_id,
            Dispute.source_order_id == source_order_id,
            Dispute.status.in_(["OPEN", "IN_REVIEW", "REOPENED"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "You already have an open dispute for this order.")

    dispute = Dispute(
        raised_by_app=raised_by_app,
        raised_by_id=raised_by_id,
        raised_by_name=raised_by_name,
        dispute_type="ORDER_DISPUTE",
        reference_type="ORDER",
        reference_id=source_order_id,
        reference_detail={},
        source_order_id=source_order_id,
        tagged_sectors=tagged_sectors,
        unread_by_raiser=False,
        unread_by_admin=True,
    )
    session.add(dispute)
    await session.flush()

    await _build_message(
        session,
        dispute_id=dispute.dispute_id,
        sender_type=raised_by_app,
        sender_id=raised_by_id,
        sender_name=raised_by_name,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    _add_history(session, dispute.dispute_id, None, "OPEN", notes="Dispute raised by user")
    await session.flush()
    await session.refresh(dispute)
    return _serialize_dispute(dispute, include_messages=True)


# ── User-facing: reply to dispute ────────────────────────────────────────────

async def user_reply_dispute(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    *,
    raised_by_app: str,
    raised_by_id: uuid.UUID,
    raised_by_name: str,
    text_content: str | None,
    voice_file: UploadFile | None,
    voice_duration_secs: int | None,
    image_file: UploadFile | None,
    attachment_file: UploadFile | None,
) -> dict:
    dispute = await _get_or_404(session, dispute_id)
    if str(dispute.raised_by_id) != str(raised_by_id):
        raise HTTPException(403, "Not your dispute.")
    if dispute.status == "CLOSED":
        raise HTTPException(400, "Cannot reply to a closed dispute.")

    await _build_message(
        session,
        dispute_id=dispute_id,
        sender_type=raised_by_app,
        sender_id=raised_by_id,
        sender_name=raised_by_name,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    dispute.unread_by_admin  = True
    dispute.unread_by_raiser = False
    # If it was IN_REVIEW, revert to OPEN so admin knows there's a new message
    if dispute.status == "IN_REVIEW":
        _add_history(session, dispute_id, "IN_REVIEW", "REOPENED", notes="User replied")
        dispute.status = "REOPENED"
    dispute.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(dispute)
    return _serialize_dispute(dispute, include_messages=True)


# ── User-facing: close own dispute ───────────────────────────────────────────

async def user_close_dispute(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    raised_by_id: uuid.UUID,
) -> dict:
    dispute = await _get_or_404(session, dispute_id)
    if str(dispute.raised_by_id) != str(raised_by_id):
        raise HTTPException(403, "Not your dispute.")
    if dispute.status == "CLOSED":
        raise HTTPException(400, "Already closed.")
    old_status = dispute.status
    dispute.status           = "CLOSED"
    dispute.closed_by_raiser = True
    dispute.updated_at       = datetime.utcnow()
    _add_history(session, dispute_id, old_status, "CLOSED", notes="Closed by user")
    await session.flush()
    await session.refresh(dispute)
    return _serialize_dispute(dispute, include_messages=True)


# ── User-facing: list own disputes ───────────────────────────────────────────

async def user_list_disputes(
    session: AsyncSession,
    raised_by_id: uuid.UUID,
    status: str | None = None,
) -> list[dict]:
    q = (
        select(Dispute)
        .where(Dispute.raised_by_id == raised_by_id)
        .order_by(Dispute.updated_at.desc())
    )
    if status:
        q = q.where(Dispute.status == status)
    result = await session.execute(q)
    return [_serialize_dispute(d) for d in result.scalars().all()]


# ── User-facing: unread count for home page indicator ────────────────────────

async def user_unread_count(session: AsyncSession, raised_by_id: uuid.UUID) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(Dispute)
        .where(
            Dispute.raised_by_id == raised_by_id,
            Dispute.unread_by_raiser.is_(True),
            Dispute.status != "CLOSED",
        )
    )
    return count or 0


# ── User-facing: mark dispute read (when user opens thread) ──────────────────

async def user_mark_read(
    session: AsyncSession,
    dispute_id: uuid.UUID,
    raised_by_id: uuid.UUID,
) -> None:
    dispute = await _get_or_404(session, dispute_id)
    if str(dispute.raised_by_id) == str(raised_by_id):
        dispute.unread_by_raiser = False
        await session.flush()


# ── Admin board: list with sector + age sorting ───────────────────────────────

async def admin_list_disputes(
    session: AsyncSession,
    *,
    raised_by_app: str | None = None,
    sector: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    q = select(Dispute).order_by(Dispute.created_at.asc())  # oldest first on admin board
    if raised_by_app:
        q = q.where(Dispute.raised_by_app == raised_by_app)
    if sector:
        from sqlalchemy import cast
        from sqlalchemy.dialects.postgresql import ARRAY
        q = q.where(Dispute.tagged_sectors.contains([sector]))
    if status:
        q = q.where(Dispute.status == status)
    else:
        # Default: open/in-review/reopened only
        q = q.where(Dispute.status.in_(["OPEN", "IN_REVIEW", "REOPENED"]))
    q = q.limit(limit).offset(offset)
    result = await session.execute(q)
    return [_serialize_dispute(d) for d in result.scalars().all()]


async def admin_dispute_summary(session: AsyncSession) -> dict:
    total = await session.scalar(select(func.count()).select_from(Dispute))
    open_ = await session.scalar(
        select(func.count()).select_from(Dispute)
        .where(Dispute.status.in_(["OPEN", "IN_REVIEW", "REOPENED"]))
    )
    closed = await session.scalar(
        select(func.count()).select_from(Dispute).where(Dispute.status == "CLOSED")
    )
    unread = await session.scalar(
        select(func.count()).select_from(Dispute)
        .where(Dispute.unread_by_admin.is_(True), Dispute.status != "CLOSED")
    )
    by_sector: dict[str, int] = {}
    for sector in ("pharmacy", "delivery"):
        cnt = await session.scalar(
            select(func.count()).select_from(Dispute)
            .where(Dispute.tagged_sectors.contains([sector]))
        )
        by_sector[sector] = cnt or 0
    by_app: dict[str, int] = {}
    for app in ("CUSTOMER", "PHARMACY", "DELIVERY_BOY"):
        cnt = await session.scalar(
            select(func.count()).select_from(Dispute)
            .where(Dispute.raised_by_app == app, Dispute.status != "CLOSED")
        )
        by_app[app.lower()] = cnt or 0
    return {
        "total": total, "open": open_, "closed": closed,
        "unread_by_admin": unread,
        "by_sector": by_sector, "by_app": by_app,
    }
