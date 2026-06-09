import asyncio
import json
import logging
import urllib.request
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.pharmacy_merchant import CustomerPharmacyOrder, PharmacyAccount, PharmacyProfile, SectorFeeConfig
from app.models.user import User
from app.schemas.customer_order import (
    BillLineItem,
    CreatePharmacyOrderRequest,
    CustomerOrderActionRequest,
    CustomerPharmacyOrderResponse,
    PharmacyOrderItem,
    SectorFeeConfigResponse,
    SetSectorFeeRequest,
    SubmitBillRequest,
    SubmitEstimateRequest,
    SubstitutionPermissionRequest,
)
from app.services.pharmacy_service import distance_km
from app.services.realtime import manager

logger = logging.getLogger(__name__)

# ── Delivery rate DB import (cross-DB) ───────────────────────────────────
from app.db.session import DeliverySessionLocal
from app.models.delivery import DeliveryRateConfig


async def _get_current_delivery_rate() -> float:
    """Fetch the live rate per km from the delivery DB."""
    async with DeliverySessionLocal() as session:
        result = await session.execute(
            select(DeliveryRateConfig).order_by(desc(DeliveryRateConfig.effective_at)).limit(1)
        )
        row = result.scalar_one_or_none()
        return float(row.rate_per_km) if row else 7.0


async def _get_sector_fee_config(session: AsyncSession, sector: str) -> tuple[float, float]:
    """Return (platform_fee, gst_percent) for the given sector — latest row."""
    result = await session.execute(
        select(SectorFeeConfig)
        .where(SectorFeeConfig.sector == sector)
        .order_by(desc(SectorFeeConfig.effective_at))
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return 5.0, 5.0  # safe defaults
    return float(row.platform_fee), float(row.gst_percent)


def _osrm_road_distance_km(origin_lat: float, origin_lng: float,
                             dest_lat: float, dest_lng: float) -> float:
    """Synchronous OSRM call → road distance in km.
    Falls back to straight-line haversine if OSRM is unreachable.
    """
    try:
        url = (
            f"https://router.project-osrm.org/route/v1/driving/"
            f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
            f"?overview=false&annotations=false"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Thean-Platform/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        if data.get("code") == "Ok":
            meters = data["routes"][0]["distance"]
            return round(meters / 1000, 3)
    except Exception as exc:
        logger.warning("OSRM unavailable (%s); falling back to haversine.", exc)
    # haversine fallback
    import math
    R = 6371
    dlat = math.radians(dest_lat - origin_lat)
    dlng = math.radians(dest_lng - origin_lng)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(origin_lat)) * math.cos(math.radians(dest_lat)) * math.sin(dlng / 2) ** 2
    return round(R * 2 * math.asin(math.sqrt(a)), 3)


async def get_sector_fee_configs(session: AsyncSession) -> list[SectorFeeConfigResponse]:
    """Latest config row for every sector."""
    SECTORS = ["pharmacy", "food", "fish", "grocery", "other"]
    rows = []
    for sector in SECTORS:
        result = await session.execute(
            select(SectorFeeConfig)
            .where(SectorFeeConfig.sector == sector)
            .order_by(desc(SectorFeeConfig.effective_at))
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            rows.append(SectorFeeConfigResponse.model_validate(row))
    return rows


async def get_sector_fee_history(session: AsyncSession, sector: str, limit: int = 50) -> list[SectorFeeConfigResponse]:
    result = await session.execute(
        select(SectorFeeConfig)
        .where(SectorFeeConfig.sector == sector)
        .order_by(desc(SectorFeeConfig.effective_at))
        .limit(limit)
    )
    return [SectorFeeConfigResponse.model_validate(r) for r in result.scalars().all()]


async def set_sector_fee(session: AsyncSession, sector: str, payload: SetSectorFeeRequest) -> SectorFeeConfigResponse:
    VALID = {"pharmacy", "food", "fish", "grocery", "other"}
    if sector not in VALID:
        raise HTTPException(status_code=422, detail=f"Unknown sector '{sector}'. Valid: {sorted(VALID)}")
    row = SectorFeeConfig(
        sector=sector,
        platform_fee=payload.platform_fee,
        gst_percent=payload.gst_percent,
        changed_by=payload.changed_by,
        reason=payload.reason,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return SectorFeeConfigResponse.model_validate(row)

PENDING_CUSTOMER_APPROVAL = "PENDING_CUSTOMER_APPROVAL"
ASSIGNED_TO_PHARMACY = "ASSIGNED_TO_PHARMACY"
PHARMACY_ACCEPTED = "PHARMACY_ACCEPTED"
PENDING_PRICE_REVIEW = "PENDING_PRICE_REVIEW"
PRICE_APPROVED = "PRICE_APPROVED"
READY_FOR_DELIVERY = "READY_FOR_DELIVERY"   # pharmacy has prepared the order — awaiting delivery boy
OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"       # delivery boy picked up — en route to customer
READY_FOR_PICKUP = "READY_FOR_PICKUP"
APPROVED = "APPROVED"
REJECTED = "REJECTED"
COMPLETED = "COMPLETED"
CANCELLED = "CANCELLED"
CUSTOMER_PRICE_REVIEW_SECONDS = 420  # 7 minutes
AUTO_APPROVAL_SECONDS = 120
MANUAL_REVIEW_SECONDS = 300
PHARMACY_SLA_SECONDS = 420
MAX_PRESCRIPTION_FILE_BYTES = 5 * 1024 * 1024
MAX_VOICE_NOTE_BYTES = 8 * 1024 * 1024
SUPPORTED_PRESCRIPTION_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}
SUPPORTED_VOICE_TYPES = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
}


def serialize_order(order: CustomerPharmacyOrder) -> CustomerPharmacyOrderResponse:
    notes = order.order_notes or {}
    return CustomerPharmacyOrderResponse(
        order_id=order.order_id,
        account_id=order.account_id,
        status=order.status,
        doctor_name=order.doctor_name,
        patient_name=order.patient_name,
        pharmacy_name=order.pharmacy_name,
        pharmacy_city=order.pharmacy_city,
        pharmacy_pincode=order.pharmacy_pincode,
        estimated_amount=str(order.estimated_amount) if order.estimated_amount is not None else None,
        final_amount=str(order.final_amount) if order.final_amount is not None else None,
        items=[PharmacyOrderItem(**item) for item in order.order_items or []],
        notes=notes,
        prescription_files=notes.get("prescription_files", []),
        voice_note_file=notes.get("voice_note_file"),
        customer_action_comment=order.customer_action_comment,
        assigned_at=order.assigned_at,
        pharmacy_action_deadline_at=order.pharmacy_action_deadline_at,
        substitution_allowed=order.substitution_allowed,
        substitution_decided_at=order.substitution_decided_at,
        customer_review_deadline_at=order.customer_review_deadline_at,
        price_breakdown=order.price_breakdown,
        bill_items=order.bill_items,
        pickup_code=order.pickup_code,
        pickup_code_generated_at=order.pickup_code_generated_at,
        created_at=order.created_at,
    )


def maybe_apply_time_based_transition(order: CustomerPharmacyOrder) -> bool:
    if order.status != PENDING_CUSTOMER_APPROVAL:
        return False

    notes = order.order_notes or {}
    billing_mode = notes.get("billing_mode", "auto")
    now = datetime.now(UTC)
    created_at = order.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)

    if billing_mode == "manual" and now >= created_at + timedelta(seconds=MANUAL_REVIEW_SECONDS):
        order.status = CANCELLED
        order.customer_action_comment = "Auto-cancelled because the 5-minute manual review window expired."
        return True

    if billing_mode != "manual" and now >= created_at + timedelta(seconds=AUTO_APPROVAL_SECONDS):
        assign_order_to_current_pharmacy(order, now)
        order.customer_action_comment = "Auto-approved after the 2-minute customer cancellation window expired."
        return True

    return False


def assign_order_to_current_pharmacy(order: CustomerPharmacyOrder, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    if order.account_id is None:
        return
    order.status = ASSIGNED_TO_PHARMACY
    order.assigned_at = now
    order.pharmacy_action_deadline_at = now + timedelta(seconds=PHARMACY_SLA_SECONDS)


async def create_customer_pharmacy_order(
    session: AsyncSession,
    user: User,
    payload: CreatePharmacyOrderRequest,
    media: dict | None = None,
) -> CustomerPharmacyOrderResponse:
    estimated_amount = Decimal(max(len(payload.items), 1) * 125)
    notes = payload.notes or {}
    media = media or {}
    account_id = notes.get("locked_pharmacy_account_id") or notes.get("selected_pharmacy_account_id")
    if account_id:
        try:
            target_account_id = account_id if isinstance(account_id, UUID) else UUID(str(account_id))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid selected pharmacy.") from exc
        await ensure_pharmacy_can_receive_customer_order(session, target_account_id)
    order = CustomerPharmacyOrder(
        user_id=user.user_id,
        account_id=UUID(account_id) if account_id else None,
        status=PENDING_CUSTOMER_APPROVAL,
        estimated_amount=estimated_amount,
        doctor_name=payload.doctor_name.strip(),
        patient_name=payload.patient_name.strip(),
        pharmacy_name=payload.pharmacy_name,
        pharmacy_city=payload.pharmacy_city,
        pharmacy_pincode=payload.pharmacy_pincode,
        order_items=[item.model_dump() for item in payload.items],
        order_notes={
            **notes,
            "billing_mode": payload.billing_mode,
            "inventory_protection": payload.inventory_protection,
            "has_prescription": payload.has_prescription,
            "has_voice_note": payload.has_voice_note,
            "prescription_files": media.get("prescription_files", []),
            "voice_note_file": media.get("voice_note_file"),
        },
        voice_note_path=media.get("voice_note_path") or ("attached" if payload.has_voice_note else None),
        prescription_path=media.get("prescription_path") or ("attached" if payload.has_prescription else None),
        requires_manual_review=payload.billing_mode == "manual",
        substitution_allowed=payload.substitution_allowed,
        substitution_decided_at=datetime.now(UTC) if payload.substitution_allowed is not None else None,
    )
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return serialize_order(order)


async def ensure_pharmacy_can_receive_customer_order(session: AsyncSession, account_id: UUID) -> None:
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.account_id == account_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected pharmacy not found.")

    account, profile = row[0], row[1]
    if not account.is_active or not profile.is_listed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Selected pharmacy is not currently listed for orders.",
        )
    if not profile.is_online:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This pharmacy is offline and can't take any order right now.",
        )


async def save_customer_order_media(
    user: User,
    prescription_files: list[UploadFile],
    voice_note: UploadFile | None,
) -> dict:
    settings = get_settings()
    order_media_id = str(uuid4())
    media_dir = Path(settings.media_root) / "customer-orders" / str(user.user_id) / order_media_id
    media_dir.mkdir(parents=True, exist_ok=True)

    saved_prescriptions = []
    for file_index, prescription_file in enumerate(prescription_files, start=1):
        saved_prescriptions.append(
            await save_customer_order_upload(
                media_dir,
                prescription_file,
                SUPPORTED_PRESCRIPTION_TYPES,
                MAX_PRESCRIPTION_FILE_BYTES,
                f"prescription-{file_index}",
            )
        )

    saved_voice = None
    if voice_note is not None:
        saved_voice = await save_customer_order_upload(
            media_dir,
            voice_note,
            SUPPORTED_VOICE_TYPES,
            MAX_VOICE_NOTE_BYTES,
            "voice-note",
        )

    def to_media_payload(saved_file: dict) -> dict:
        api_path = f"/customer/pharmacy-orders/media/{user.user_id}/{order_media_id}/{saved_file['filename']}"
        pharmacy_api_path = f"/pharmacy/orders/media/{user.user_id}/{order_media_id}/{saved_file['filename']}"
        return {
            **saved_file,
            "path": str(Path("customer-orders") / str(user.user_id) / order_media_id / saved_file["filename"]),
            "url": api_path,
            "pharmacy_url": pharmacy_api_path,
        }

    prescription_payloads = [to_media_payload(saved_file) for saved_file in saved_prescriptions]
    voice_payload = to_media_payload(saved_voice) if saved_voice else None
    return {
        "prescription_files": prescription_payloads,
        "voice_note_file": voice_payload,
        "prescription_path": prescription_payloads[0]["path"] if prescription_payloads else None,
        "voice_note_path": voice_payload["path"] if voice_payload else None,
    }


async def save_customer_order_upload(
    media_dir: Path,
    upload: UploadFile,
    supported_types: dict[str, str],
    max_bytes: int,
    prefix: str,
) -> dict:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    extension = supported_types.get(content_type)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{upload.filename or prefix} has an unsupported file type.",
        )

    file_bytes = await upload.read()
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{upload.filename or prefix} is too large.",
        )

    filename = f"{prefix}-{uuid4()}.{extension}"
    (media_dir / filename).write_bytes(file_bytes)
    return {
        "filename": filename,
        "original_name": upload.filename,
        "content_type": content_type,
        "size_bytes": len(file_bytes),
    }


def get_customer_order_media_file_path(
    user_id: UUID,
    media_id: str,
    filename: str,
) -> Path:
    if Path(filename).name != filename or Path(media_id).name != media_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid media path.")

    settings = get_settings()
    file_path = Path(settings.media_root) / "customer-orders" / str(user_id) / media_id / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found.")
    return file_path


async def ensure_pharmacy_can_access_media(
    session: AsyncSession,
    account_id: UUID,
    user_id: UUID,
    media_id: str,
    filename: str,
) -> None:
    media_path = str(Path("customer-orders") / str(user_id) / media_id / filename)
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.account_id == account_id)
        .where(CustomerPharmacyOrder.user_id == user_id)
    )
    for order in result.scalars().all():
        notes = order.order_notes or {}
        media_files = list(notes.get("prescription_files", []))
        voice_file = notes.get("voice_note_file")
        if voice_file:
            media_files.append(voice_file)
        if any(file_info.get("path") == media_path for file_info in media_files):
            return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Media access denied.")


async def _fetch_delivery_info_for_completed_orders(
    order_ids: list[UUID],
    customer_user_id: UUID,
) -> dict[UUID, dict]:
    """
    For COMPLETED pharmacy orders, cross-query the delivery DB to get:
      - delivery_order_id  (so customer can submit a rating)
      - delivery_rated     (True if this customer already submitted a rating)
    Returns {source_order_id: {"delivery_order_id": ..., "delivery_rated": bool}}
    """
    if not order_ids:
        return {}
    try:
        from app.db.session import DeliverySessionLocal
        from app.models.delivery import DeliveryOrder, DeliveryRating
        async with DeliverySessionLocal() as d_sess:
            # Fetch delivered delivery orders for these source orders
            d_result = await d_sess.execute(
                select(DeliveryOrder.source_order_id, DeliveryOrder.delivery_order_id)
                .where(
                    DeliveryOrder.source_order_id.in_(order_ids),
                    DeliveryOrder.status == "DELIVERED",
                )
            )
            rows = d_result.all()
            if not rows:
                return {}

            delivery_order_ids = [r[1] for r in rows]
            source_to_delivery = {r[0]: r[1] for r in rows}

            # Check which ones this customer has already rated
            rated_result = await d_sess.execute(
                select(DeliveryRating.delivery_order_id)
                .where(
                    DeliveryRating.delivery_order_id.in_(delivery_order_ids),
                    DeliveryRating.rated_by == customer_user_id,
                )
            )
            rated_ids = {r[0] for r in rated_result.all()}

            return {
                source_id: {
                    "delivery_order_id": d_id,
                    "delivery_rated": d_id in rated_ids,
                }
                for source_id, d_id in source_to_delivery.items()
            }
    except Exception:
        return {}


async def list_customer_pharmacy_orders(
    session: AsyncSession,
    user: User,
) -> list[CustomerPharmacyOrderResponse]:
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.user_id == user.user_id)
        .order_by(CustomerPharmacyOrder.created_at.desc())
    )
    orders = result.scalars().all()
    changed = any(maybe_apply_time_based_transition(order) for order in orders)
    if changed:
        await session.commit()
        for order in orders:
            if order.status == ASSIGNED_TO_PHARMACY and order.account_id:
                await notify_pharmacy_assignment(order)

    serialized = [serialize_order(order) for order in orders]

    # Enrich COMPLETED orders with delivery_order_id + delivery_rated (cross-DB, best-effort)
    completed_ids = [o.order_id for o in orders if o.status == COMPLETED]
    delivery_info = await _fetch_delivery_info_for_completed_orders(completed_ids, user.user_id)
    for resp in serialized:
        if resp.order_id in delivery_info:
            info = delivery_info[resp.order_id]
            resp.delivery_order_id = info["delivery_order_id"]
            resp.delivery_rated = info["delivery_rated"]

    return serialized


async def get_customer_pharmacy_order(
    session: AsyncSession,
    user: User,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_user(session, user, order_id)
    if maybe_apply_time_based_transition(order):
        await session.commit()
        await session.refresh(order)
        if order.status == ASSIGNED_TO_PHARMACY and order.account_id:
            await notify_pharmacy_assignment(order)
    return serialize_order(order)


async def update_customer_order_status(
    session: AsyncSession,
    user: User,
    order_id: UUID,
    next_status: str,
    payload: CustomerOrderActionRequest,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_user(session, user, order_id)
    if maybe_apply_time_based_transition(order):
        await session.commit()
        await session.refresh(order)
    if order.status != PENDING_CUSTOMER_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only orders pending customer approval can be acted on.",
        )
    if next_status == APPROVED:
        assign_order_to_current_pharmacy(order)
    else:
        order.status = next_status
    order.customer_action_comment = payload.comment.strip() if payload.comment else None
    await session.commit()
    await session.refresh(order)
    if order.status == ASSIGNED_TO_PHARMACY and order.account_id:
        await notify_pharmacy_assignment(order)
    return serialize_order(order)


async def list_assigned_orders_for_pharmacy(
    session: AsyncSession,
    account_id: UUID,
) -> list[CustomerPharmacyOrderResponse]:
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.account_id == account_id)
        .where(CustomerPharmacyOrder.status == ASSIGNED_TO_PHARMACY)
        .order_by(CustomerPharmacyOrder.assigned_at.desc())
    )
    return [serialize_order(order) for order in result.scalars().all()]


async def _fetch_delivery_pickup_pins(order_ids: list[UUID]) -> dict[UUID, str]:
    """
    Cross-query the delivery DB to get pickup_pin for each source_order_id.
    Returns {source_order_id: pickup_pin} for orders that have an active delivery order.
    Only fetches when the delivery order is in an assigned/active state.
    """
    if not order_ids:
        return {}
    try:
        from app.db.session import DeliverySessionLocal
        from app.models.delivery import DeliveryOrder
        _DELIVERY_ACTIVE = {
            "ASSIGNED_TO_DELIVERY", "DELIVERY_ACCEPTED",
            "ARRIVED_AT_STORE", "ORDER_PICKED_UP",
        }
        async with DeliverySessionLocal() as d_sess:
            result = await d_sess.execute(
                select(DeliveryOrder.source_order_id, DeliveryOrder.pickup_pin)
                .where(
                    DeliveryOrder.source_order_id.in_(order_ids),
                    DeliveryOrder.status.in_(_DELIVERY_ACTIVE),
                    DeliveryOrder.pickup_pin.isnot(None),
                )
            )
            return {row[0]: row[1] for row in result.all()}
    except Exception:
        return {}


async def list_orders_for_pharmacy_management(
    session: AsyncSession,
    account_id: UUID,
) -> list[CustomerPharmacyOrderResponse]:
    _VISIBLE_STATUSES = [
        ASSIGNED_TO_PHARMACY, PHARMACY_ACCEPTED,
        PRICE_APPROVED, PENDING_PRICE_REVIEW,
        READY_FOR_DELIVERY, OUT_FOR_DELIVERY,
        COMPLETED,
    ]
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.account_id == account_id)
        .where(CustomerPharmacyOrder.status.in_(_VISIBLE_STATUSES))
        .order_by(desc(func.coalesce(CustomerPharmacyOrder.assigned_at, CustomerPharmacyOrder.created_at)))
    )
    orders = result.scalars().all()
    serialized = [serialize_order(o) for o in orders]

    # Enrich with delivery pickup PINs (cross-DB, best-effort)
    ids_needing_pin = [
        o.order_id for o in orders
        if o.status in {READY_FOR_DELIVERY, OUT_FOR_DELIVERY}
    ]
    pin_map = await _fetch_delivery_pickup_pins(ids_needing_pin)
    for resp in serialized:
        if resp.order_id in pin_map:
            resp.delivery_pickup_pin = pin_map[resp.order_id]

    return serialized


async def accept_assigned_order(
    session: AsyncSession,
    account_id: UUID,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_pharmacy(session, account_id, order_id)
    if order.status != ASSIGNED_TO_PHARMACY:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order is not awaiting pharmacy review.")
    order.status = PHARMACY_ACCEPTED
    order.customer_action_comment = "Pharmacy accepted the order for bill review."
    await session.commit()
    await session.refresh(order)
    return serialize_order(order)


async def reject_assigned_order(
    session: AsyncSession,
    account_id: UUID,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_pharmacy(session, account_id, order_id)
    await handle_pharmacy_rejection_or_timeout(session, order, account_id, "Pharmacy rejected the order.")
    await session.commit()
    await session.refresh(order)
    return serialize_order(order)


async def handle_expired_pharmacy_assignments(session: AsyncSession) -> None:
    now = datetime.now(UTC)
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.status == ASSIGNED_TO_PHARMACY)
        .where(CustomerPharmacyOrder.pharmacy_action_deadline_at.is_not(None))
        .where(CustomerPharmacyOrder.pharmacy_action_deadline_at <= now)
    )
    orders = result.scalars().all()
    for order in orders:
        if order.account_id:
            await handle_pharmacy_rejection_or_timeout(
                session,
                order,
                order.account_id,
                "Pharmacy did not respond within the 7-minute SLA window.",
            )
    if orders:
        await session.commit()


async def handle_expired_customer_review_windows(session: AsyncSession) -> None:
    result = await session.execute(
        select(CustomerPharmacyOrder).where(CustomerPharmacyOrder.status == PENDING_CUSTOMER_APPROVAL)
    )
    orders = result.scalars().all()
    changed_orders = []
    for order in orders:
        if maybe_apply_time_based_transition(order):
            changed_orders.append(order)
    if changed_orders:
        await session.commit()
        for order in changed_orders:
            if order.status == ASSIGNED_TO_PHARMACY and order.account_id:
                await notify_pharmacy_assignment(order)


async def handle_pharmacy_rejection_or_timeout(
    session: AsyncSession,
    order: CustomerPharmacyOrder,
    rejected_account_id: UUID,
    reason: str,
) -> None:
    notes = order.order_notes or {}
    rejected_ids = set(order.rejected_account_ids or [])
    rejected_ids.add(str(rejected_account_id))
    order.rejected_account_ids = sorted(rejected_ids)

    should_reroute = bool(notes.get("pharmacy_choice_mode") == "auto" or notes.get("inventory_protection"))
    if should_reroute:
        next_account_id = await find_next_pharmacy_for_order(session, order, rejected_ids)
        if next_account_id:
            order.account_id = next_account_id
            order.order_notes = {**notes, "rerouted_from": str(rejected_account_id), "reroute_reason": reason}
            assign_order_to_current_pharmacy(order)
            await notify_pharmacy_assignment(order)
            return

    order.status = CANCELLED
    order.customer_action_comment = "order cancelled as Choose Pharmacy don't have stock."
    order.order_notes = {**notes, "cancellation_reason": reason, "can_recreate_any_nearby": True}
    await manager.send_customer(
        order.user_id,
        {
            "type": "order_cancelled",
            "order_id": str(order.order_id),
            "title": "Order cancelled",
            "message": "order cancelled as Choose Pharmacy don't have stock.",
            "payload": {
                "recreate_url": "/home/pharmacy/order",
                "order": serialize_order(order).model_dump(mode="json"),
            },
        },
    )


async def find_next_pharmacy_for_order(
    session: AsyncSession,
    order: CustomerPharmacyOrder,
    rejected_ids: set[str],
) -> UUID | None:
    notes = order.order_notes or {}
    latitude = notes.get("address_latitude")
    longitude = notes.get("address_longitude")
    if latitude is None or longitude is None:
        return None

    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.is_active.is_(True))
        .where(PharmacyProfile.is_listed.is_(True))
        .where(PharmacyProfile.is_online.is_(True))
        .where(PharmacyProfile.latitude.is_not(None))
        .where(PharmacyProfile.longitude.is_not(None))
    )
    candidates = []
    for account, profile in result.all():
        if str(account.account_id) in rejected_ids:
            continue
        distance = distance_km(float(latitude), float(longitude), profile.latitude, profile.longitude)
        if distance <= 5:
            candidates.append((distance, account.account_id))
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item[0])[0][1]


async def notify_pharmacy_assignment(order: CustomerPharmacyOrder) -> None:
    if not order.account_id:
        return
    await manager.send_pharmacy(
        order.account_id,
        {
            "type": "order_assigned",
            "order": serialize_order(order).model_dump(mode="json"),
            "sla_seconds": PHARMACY_SLA_SECONDS,
        },
    )


async def list_all_pharmacy_orders(
    session: AsyncSession,
) -> list[CustomerPharmacyOrderResponse]:
    """Return every pharmacy order across all pharmacies, newest first."""
    result = await session.execute(
        select(CustomerPharmacyOrder).order_by(CustomerPharmacyOrder.created_at.desc())
    )
    return [serialize_order(order) for order in result.scalars().all()]


async def get_any_order_by_id(
    session: AsyncSession,
    order_id: UUID,
) -> CustomerPharmacyOrder:
    result = await session.execute(
        select(CustomerPharmacyOrder).where(CustomerPharmacyOrder.order_id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    return order


async def list_substitution_audit_orders(
    session: AsyncSession,
) -> list[CustomerPharmacyOrderResponse]:
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.substitution_decided_at.is_not(None))
        .order_by(CustomerPharmacyOrder.substitution_decided_at.desc())
    )
    return [serialize_order(order) for order in result.scalars().all()]


async def set_substitution_permission(
    session: AsyncSession,
    user: User,
    order_id: UUID,
    payload: SubstitutionPermissionRequest,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_user(session, user, order_id)
    if order.status not in (ASSIGNED_TO_PHARMACY, PHARMACY_ACCEPTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Substitution permission can only be set while the order is with the pharmacy.",
        )
    order.substitution_allowed = payload.allowed
    order.substitution_decided_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(order)
    return serialize_order(order)


async def get_order_for_pharmacy(
    session: AsyncSession,
    account_id: UUID,
    order_id: UUID,
) -> CustomerPharmacyOrder:
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.order_id == order_id)
        .where(CustomerPharmacyOrder.account_id == account_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned order not found.")
    return order


async def reorder_customer_pharmacy_order(
    session: AsyncSession,
    user: User,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_user(session, user, order_id)
    if order.status != COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only completed orders can be re-ordered.",
        )
    payload = CreatePharmacyOrderRequest(
        doctor_name=order.doctor_name or "Self",
        patient_name=order.patient_name or user.full_name or "Customer",
        items=[PharmacyOrderItem(**item) for item in order.order_items or []],
        pharmacy_name=order.pharmacy_name,
        pharmacy_city=order.pharmacy_city,
        pharmacy_pincode=order.pharmacy_pincode,
        billing_mode=(order.order_notes or {}).get("billing_mode", "auto"),
        inventory_protection=bool((order.order_notes or {}).get("inventory_protection", True)),
        has_prescription=bool(order.prescription_path),
        has_voice_note=False,
        notes={"reordered_from": str(order.order_id)},
    )
    return await create_customer_pharmacy_order(session, user, payload)


async def recreate_cancelled_order_any_nearby(
    session: AsyncSession,
    user: User,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_user(session, user, order_id)
    if order.status != CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only cancelled orders can be recreated for nearby pharmacy search.",
        )
    notes = order.order_notes or {}
    payload = CreatePharmacyOrderRequest(
        doctor_name=order.doctor_name or "Self",
        patient_name=order.patient_name or user.full_name or "Customer",
        items=[PharmacyOrderItem(**item) for item in order.order_items or []],
        pharmacy_name=None,
        pharmacy_city=None,
        pharmacy_pincode=None,
        billing_mode="auto",
        inventory_protection=True,
        has_prescription=bool(order.prescription_path),
        has_voice_note=False,
        notes={
            **notes,
            "recreated_from": str(order.order_id),
            "pharmacy_choice_mode": "auto",
            "auto_choose_pharmacy": True,
            "inventory_protection": True,
            "locked_pharmacy_account_id": None,
            "locked_offer_order": False,
        },
    )
    return await create_customer_pharmacy_order(session, user, payload)


async def get_order_for_user(session: AsyncSession, user: User, order_id: UUID) -> CustomerPharmacyOrder:
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.order_id == order_id)
        .where(CustomerPharmacyOrder.user_id == user.user_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    return order


# ── Fulfillment workflow (Phase 1–4) ─────────────────────────────────────────

import random
import string


def _generate_pickup_code() -> str:
    """Generate a 6-character alphanumeric pickup code (uppercase)."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


async def submit_pharmacy_estimate(
    session: AsyncSession,
    account_id: UUID,
    order_id: UUID,
    payload: SubmitEstimateRequest,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_pharmacy(session, account_id, order_id)
    if order.status != PHARMACY_ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Estimate can only be submitted for accepted orders.",
        )
    now = datetime.now(UTC)
    notes_data = order.order_notes or {}

    # ── 1. Pharmacy location (from profile) ──────────────────────────────
    profile_result = await session.execute(
        select(PharmacyProfile).where(PharmacyProfile.account_id == account_id)
    )
    profile = profile_result.scalar_one_or_none()
    pharmacy_lat = float(profile.latitude) if profile and profile.latitude is not None else None
    pharmacy_lng = float(profile.longitude) if profile and profile.longitude is not None else None

    # ── 2. Customer delivery location (stored in order notes) ─────────────
    customer_lat = notes_data.get("address_latitude")
    customer_lng = notes_data.get("address_longitude")

    # ── 3. Road distance via OSRM ────────────────────────────────────────
    if pharmacy_lat and pharmacy_lng and customer_lat and customer_lng:
        road_km = await asyncio.get_event_loop().run_in_executor(
            None,
            _osrm_road_distance_km,
            float(pharmacy_lat), float(pharmacy_lng),
            float(customer_lat), float(customer_lng),
        )
    else:
        road_km = 0.0
        logger.warning("Missing coordinates for order %s — delivery charge set to ₹0.", order_id)

    # ── 4. Delivery charge (live rate × road distance) ────────────────────
    rate_per_km = await _get_current_delivery_rate()
    delivery_charge = round(road_km * rate_per_km, 2)

    # ── 5. Platform fee + GST from sector config ──────────────────────────
    platform_fee, gst_percent = await _get_sector_fee_config(session, "pharmacy")

    # ── 6. GST on full invoice (medicine + delivery + platform fee) ────────
    subtotal = payload.medicine_cost + delivery_charge + platform_fee
    gst_amount = round(subtotal * gst_percent / 100, 2)
    total = round(subtotal + gst_amount, 2)

    # ── 7. Persist ────────────────────────────────────────────────────────
    order.price_breakdown = {
        "medicine_cost":    round(payload.medicine_cost, 2),
        "delivery_charge":  delivery_charge,
        "delivery_km":      road_km,
        "rate_per_km":      rate_per_km,
        "platform_fee":     platform_fee,
        "gst_percent":      gst_percent,
        "gst_amount":       gst_amount,
        "subtotal":         round(subtotal, 2),
        "total":            total,
        "notes":            payload.notes,
    }
    order.estimated_amount = Decimal(str(total))
    order.status = PENDING_PRICE_REVIEW
    order.customer_review_deadline_at = now + timedelta(seconds=CUSTOMER_PRICE_REVIEW_SECONDS)
    await session.commit()
    await session.refresh(order)

    await manager.send_customer(
        order.user_id,
        {
            "type": "price_estimate_submitted",
            "order_id": str(order.order_id),
            "title": "Price estimate ready",
            "message": (
                f"Your pharmacy has sent a price estimate of ₹{total:.2f} "
                f"(medicines ₹{payload.medicine_cost:.2f} + delivery ₹{delivery_charge:.2f} "
                f"+ platform fee ₹{platform_fee:.2f} + GST ₹{gst_amount:.2f}). "
                f"Please review within 7 minutes."
            ),
            "payload": {"order": serialize_order(order).model_dump(mode="json")},
        },
    )
    return serialize_order(order)


async def approve_price_estimate(
    session: AsyncSession,
    user: User,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_user(session, user, order_id)
    if order.status != PENDING_PRICE_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order is not awaiting price review.",
        )
    now = datetime.now(UTC)
    deadline = order.customer_review_deadline_at
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)
    if deadline and now > deadline:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Price review window has expired.",
        )
    order.status = PRICE_APPROVED
    await session.commit()
    await session.refresh(order)
    await manager.send_pharmacy(
        order.account_id,
        {
            "type": "price_approved",
            "order_id": str(order.order_id),
            "title": "Customer approved",
            "message": "Customer approved the price estimate. Proceed to generate the final bill.",
            "payload": {"order": serialize_order(order).model_dump(mode="json")},
        },
    )
    return serialize_order(order)


async def reject_price_estimate(
    session: AsyncSession,
    user: User,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_user(session, user, order_id)
    if order.status != PENDING_PRICE_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order is not awaiting price review.",
        )
    notes = order.order_notes or {}
    order.status = REJECTED
    order.customer_action_comment = "Customer rejected the price estimate."
    order.order_notes = {**notes, "can_recreate_any_nearby": True, "cancellation_reason": "Customer rejected the price estimate."}
    await session.commit()
    await session.refresh(order)
    await manager.send_pharmacy(
        order.account_id,
        {
            "type": "price_rejected",
            "order_id": str(order.order_id),
            "title": "Order rejected by customer",
            "message": "The customer rejected the price estimate. This order workflow has ended.",
        },
    )
    return serialize_order(order)


async def submit_pharmacy_bill(
    session: AsyncSession,
    account_id: UUID,
    order_id: UUID,
    payload: SubmitBillRequest,
) -> CustomerPharmacyOrderResponse:
    order = await get_order_for_pharmacy(session, account_id, order_id)
    allowed_statuses = (PHARMACY_ACCEPTED, PRICE_APPROVED)
    if order.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill can only be submitted for accepted or price-approved orders.",
        )
    now = datetime.now(UTC)
    final_amount = sum(Decimal(item.amount) * item.qty for item in payload.items)
    order.bill_items = [item.model_dump() for item in payload.items]
    order.final_amount = final_amount
    order.status = READY_FOR_PICKUP
    order.pickup_code = _generate_pickup_code()
    order.pickup_code_generated_at = now
    await session.commit()
    await session.refresh(order)
    await manager.send_customer(
        order.user_id,
        {
            "type": "order_ready_for_pickup",
            "order_id": str(order.order_id),
            "title": "Order ready for pickup",
            "message": f"Your order from {order.pharmacy_name} is ready. Total: ₹{final_amount:.2f}.",
            "payload": {"order": serialize_order(order).model_dump(mode="json")},
        },
    )
    return serialize_order(order)


async def handle_expired_price_reviews(session: AsyncSession) -> None:
    """SLA worker: auto-reject PENDING_PRICE_REVIEW orders past their deadline."""
    now = datetime.now(UTC)
    result = await session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.status == PENDING_PRICE_REVIEW)
        .where(CustomerPharmacyOrder.customer_review_deadline_at.is_not(None))
        .where(CustomerPharmacyOrder.customer_review_deadline_at <= now)
    )
    orders = result.scalars().all()
    for order in orders:
        notes = order.order_notes or {}
        order.status = REJECTED
        order.customer_action_comment = "Order auto-rejected after 7-minute price review window expired."
        order.order_notes = {**notes, "can_recreate_any_nearby": True, "cancellation_reason": "Price review timed out."}
        if order.account_id:
            await manager.send_pharmacy(
                order.account_id,
                {
                    "type": "price_review_timeout",
                    "order_id": str(order.order_id),
                    "title": "Order Rejected by Customer (Timeout)",
                    "message": "Customer did not respond within the 7-minute price review window. Order has been rejected.",
                },
            )
        await manager.send_customer(
            order.user_id,
            {
                "type": "order_cancelled",
                "order_id": str(order.order_id),
                "title": "Order cancelled",
                "message": "Your order was cancelled because the 7-minute price review window expired. Would you like to find another pharmacy?",
                "payload": {
                    "order": serialize_order(order).model_dump(mode="json"),
                    "can_recreate": True,
                },
            },
        )
    if orders:
        await session.commit()


async def mark_order_ready_for_delivery(
    session: AsyncSession,
    account_id: UUID,
    order_id: UUID,
) -> CustomerPharmacyOrderResponse:
    """Pharmacy marks an order as packed and ready for a delivery boy to pick up.

    Allowed from PRICE_APPROVED or PHARMACY_ACCEPTED (for orders skipping
    manual review).  Sets status → READY_FOR_DELIVERY and notifies the customer.
    """
    order = await get_order_for_pharmacy(session, account_id, order_id)
    allowed = {PRICE_APPROVED, PHARMACY_ACCEPTED}
    if order.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Order must be in {allowed} to mark as ready for delivery. Current: {order.status}",
        )
    order.status = READY_FOR_DELIVERY
    await session.commit()
    await session.refresh(order)

    await manager.send_customer(
        order.user_id,
        {
            "type": "order_ready_for_delivery",
            "order_id": str(order.order_id),
            "title": "Order packed and ready",
            "message": "Your order has been packed and is waiting for a delivery boy to pick it up.",
            "payload": {"order": serialize_order(order).model_dump(mode="json")},
        },
    )
    return serialize_order(order)
