import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from app.api.pharmacy_dependencies import get_current_pharmacy, require_super_admin
from app.db.session import get_pharmacy_session, get_session as get_main_session
from app.models.pharmacy_merchant import PharmacyAccount, PharmacyProfile
from app.schemas.pharmacy import (
    PharmacyAccountResponse,
    PharmacyAvailabilityUpdateRequest,
    PharmacyAuthResponse,
    PharmacyOtpRequest,
    PharmacyOtpResponse,
    PharmacyOtpVerifyRequest,
    PharmacyProductCreateRequest,
    PharmacyProductCommentRequest,
    PharmacyProductResponse,
    PharmacyProductUpdateRequest,
    PharmacyRegisterRequest,
    NearbyPharmacyResponse,
    PharmacyStatusResponse,
    SetOperatingHoursRequest,
    OperatingHoursResponse,
    HolidayCreateRequest,
    HolidayResponse,
    PharmacyScheduleStatusResponse,
)
from app.schemas.customer_order import CustomerPharmacyOrderResponse, SubmitEstimateRequest, SubmitBillRequest
from app.services.customer_order_service import (
    accept_assigned_order,
    approve_price_estimate,
    ensure_pharmacy_can_access_media,
    get_customer_order_media_file_path,
    list_assigned_orders_for_pharmacy,
    list_orders_for_pharmacy_management,
    mark_order_ready_for_delivery,
    reject_assigned_order,
    submit_pharmacy_bill,
    submit_pharmacy_estimate,
)
from app.services.pharmacy_service import (
    activate_pharmacy,
    add_holiday,
    clear_operating_hours,
    create_pharmacy_product,
    delete_holiday,
    get_pharmacy_status,
    get_schedule_status,
    list_customer_visible_products,
    list_holidays,
    list_nearby_pharmacies,
    list_operating_hours,
    list_own_products,
    set_operating_hours,
    register_pharmacy,
    request_pharmacy_otp,
    resubmit_pharmacy_product,
    serialize_pharmacy,
    update_pharmacy_availability,
    update_pharmacy_product,
    verify_pharmacy_otp,
)

router = APIRouter(prefix="/pharmacy", tags=["pharmacy"])


@router.post("/register", response_model=PharmacyAccountResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: PharmacyRegisterRequest,
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await register_pharmacy(session, payload)


@router.post("/request-otp", response_model=PharmacyOtpResponse)
async def request_login_otp(
    payload: PharmacyOtpRequest,
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await request_pharmacy_otp(session, payload.phone_number)


@router.post("/verify-otp", response_model=PharmacyAuthResponse)
async def verify_login_otp(
    payload: PharmacyOtpVerifyRequest,
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await verify_pharmacy_otp(session, payload.phone_number, payload.otp)


@router.get("/me", response_model=PharmacyAccountResponse)
async def me(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
):
    return serialize_pharmacy(account_profile[0], account_profile[1])


@router.patch("/me/availability", response_model=PharmacyAccountResponse)
async def update_availability(
    payload: PharmacyAvailabilityUpdateRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await update_pharmacy_availability(
        session,
        account_profile[0],
        account_profile[1],
        payload.is_online,
    )


@router.get("/me/schedule-status", response_model=PharmacyScheduleStatusResponse)
async def schedule_status(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await get_schedule_status(session, account_profile[0], account_profile[1])


@router.get("/me/operating-hours", response_model=list[OperatingHoursResponse])
async def get_operating_hours(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_operating_hours(session, account_profile[0].account_id)


@router.put("/me/operating-hours", response_model=list[OperatingHoursResponse])
async def put_operating_hours(
    payload: SetOperatingHoursRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await set_operating_hours(session, account_profile[0].account_id, payload.days)


@router.delete("/me/operating-hours", status_code=status.HTTP_204_NO_CONTENT)
async def remove_operating_hours(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Delete the auto-schedule entirely. The pharmacy freezes at its current
    online/offline state — it will never auto-toggle again until a schedule is set."""
    await clear_operating_hours(session, account_profile[0].account_id)


@router.get("/me/holidays", response_model=list[HolidayResponse])
async def get_holidays(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_holidays(session, account_profile[0].account_id)


@router.post("/me/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
async def post_holiday(
    payload: HolidayCreateRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await add_holiday(session, account_profile[0].account_id, payload.holiday_date, payload.reason)


@router.delete("/me/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_holiday(
    holiday_id: uuid.UUID,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    await delete_holiday(session, account_profile[0].account_id, holiday_id)


@router.get("/admin/accounts/{account_id}/schedule-status", response_model=PharmacyScheduleStatusResponse)
async def admin_schedule_status(
    account_id: uuid.UUID,
    _: None = Depends(require_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .where(PharmacyAccount.account_id == account_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")
    account, profile = row
    return await get_schedule_status(session, account, profile)


@router.get("/admin/accounts")
async def list_pharmacy_accounts(
    _: None = Depends(require_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Return all pharmacy accounts with id + owner name + pharmacy name for admin dropdowns."""
    from sqlalchemy import select, outerjoin
    result = await session.execute(
        select(PharmacyAccount, PharmacyProfile)
        .outerjoin(PharmacyProfile, PharmacyProfile.account_id == PharmacyAccount.account_id)
        .order_by(PharmacyAccount.owner_name)
    )
    rows = result.all()
    return [
        {
            "account_id": str(acc.account_id),
            "display_name": f"{pro.store_name} ({acc.owner_name})" if pro and pro.store_name else acc.owner_name,
            "is_active": acc.is_active,
        }
        for acc, pro in rows
    ]


@router.post("/admin/accounts/{account_id}/activate", response_model=PharmacyAccountResponse)
async def activate(
    account_id: uuid.UUID,
    _: None = Depends(require_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await activate_pharmacy(session, account_id)


@router.get("/products", response_model=list[PharmacyProductResponse])
async def products(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_own_products(session, account_profile[0], account_profile[1])


@router.post("/products", response_model=PharmacyProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: PharmacyProductCreateRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await create_pharmacy_product(session, account_profile[0], account_profile[1], payload)


@router.put("/products/{product_id}", response_model=PharmacyProductResponse)
async def update_product(
    product_id: uuid.UUID,
    payload: PharmacyProductUpdateRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await update_pharmacy_product(
        session,
        account_profile[0],
        account_profile[1],
        product_id,
        payload,
    )


@router.post("/products/{product_id}/resubmit", response_model=PharmacyProductResponse)
async def resubmit_product(
    product_id: uuid.UUID,
    payload: PharmacyProductCommentRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await resubmit_pharmacy_product(
        session,
        account_profile[0],
        account_profile[1],
        product_id,
        payload,
    )


@router.get("/orders/assigned", response_model=list[CustomerPharmacyOrderResponse])
async def assigned_orders(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_assigned_orders_for_pharmacy(session, account_profile[0].account_id)


@router.get("/orders", response_model=list[CustomerPharmacyOrderResponse])
async def managed_orders(
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_orders_for_pharmacy_management(session, account_profile[0].account_id)


@router.post("/orders/{order_id}/accept", response_model=CustomerPharmacyOrderResponse)
async def accept_order(
    order_id: uuid.UUID,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await accept_assigned_order(session, account_profile[0].account_id, order_id)


@router.post("/orders/{order_id}/reject", response_model=CustomerPharmacyOrderResponse)
async def reject_order(
    order_id: uuid.UUID,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await reject_assigned_order(session, account_profile[0].account_id, order_id)


@router.post("/orders/{order_id}/submit-estimate", response_model=CustomerPharmacyOrderResponse)
async def submit_estimate(
    order_id: uuid.UUID,
    payload: SubmitEstimateRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await submit_pharmacy_estimate(session, account_profile[0].account_id, order_id, payload)


@router.post("/orders/{order_id}/submit-bill", response_model=CustomerPharmacyOrderResponse)
async def submit_bill(
    order_id: uuid.UUID,
    payload: SubmitBillRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await submit_pharmacy_bill(session, account_profile[0].account_id, order_id, payload)


@router.get("/orders/media/{user_id}/{media_id}/{filename}")
async def pharmacy_order_media(
    user_id: uuid.UUID,
    media_id: str,
    filename: str,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    await ensure_pharmacy_can_access_media(
        session,
        account_profile[0].account_id,
        user_id,
        media_id,
        filename,
    )
    return FileResponse(get_customer_order_media_file_path(user_id, media_id, filename))


@router.get("/public/products", response_model=list[PharmacyProductResponse])
async def public_products(session: AsyncSession = Depends(get_pharmacy_session)):
    return await list_customer_visible_products(session)


@router.get("/public/nearby", response_model=list[NearbyPharmacyResponse])
async def nearby_pharmacies(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    session: AsyncSession = Depends(get_pharmacy_session),
):
    bounded_radius = min(max(radius_km, 1.0), 60.0)
    return await list_nearby_pharmacies(session, latitude, longitude, bounded_radius)


@router.get("/public/{account_id}/status", response_model=PharmacyStatusResponse)
async def pharmacy_status(
    account_id: uuid.UUID,
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await get_pharmacy_status(session, account_id)


# ── Ready for Delivery ────────────────────────────────────────────────────

@router.post("/orders/{order_id}/ready-for-delivery", status_code=status.HTTP_204_NO_CONTENT)
async def ready_for_delivery(
    order_id: uuid.UUID,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """
    Pharmacy marks the order as packed and ready for pickup.
    Allowed only when order is in PRICE_APPROVED or PHARMACY_ACCEPTED status.
    Transitions the order to READY_FOR_DELIVERY and notifies the customer.
    """
    await mark_order_ready_for_delivery(session, account_profile[0].account_id, order_id)


# ── Pharmacy-facing Settlement ─────────────────────────────────────────────

@router.get("/settlement/batches")
async def my_settlement_batches(
    status_filter: Optional[str] = None,
    limit: int = 30,
    offset: int = 0,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_main_session),
):
    """List settlement batches for this pharmacy (read-only)."""
    from app.services import settlement_service as svc
    account, _ = account_profile
    return await svc.list_batches(
        session,
        stakeholder_type="PHARMACY",
        stakeholder_id=account.account_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get("/settlement/batches/{batch_id}")
async def my_settlement_batch_detail(
    batch_id: uuid.UUID,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_main_session),
):
    """Get a specific settlement batch — only if it belongs to this pharmacy."""
    from app.services import settlement_service as svc
    account, _ = account_profile
    batch = await svc.get_batch(session, batch_id)
    if str(batch.get("stakeholder_id")) != str(account.account_id):
        raise HTTPException(status_code=403, detail="Access denied.")
    return batch


@router.get("/settlement/batches/{batch_id}/proofs")
async def my_settlement_proofs(
    batch_id: uuid.UUID,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_main_session),
):
    """List payment proofs for a batch owned by this pharmacy."""
    from app.services import settlement_service as svc
    account, _ = account_profile
    batch = await svc.get_batch(session, batch_id)
    if str(batch.get("stakeholder_id")) != str(account.account_id):
        raise HTTPException(status_code=403, detail="Access denied.")
    return await svc.list_proofs(session, batch_id)


# ── Pharmacy-facing Disputes ───────────────────────────────────────────────

@router.get("/disputes")
async def my_disputes(
    status_filter: Optional[str] = None,
    dispute_type: Optional[str] = None,
    limit: int = 30,
    offset: int = 0,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_main_session),
):
    """List disputes raised by this pharmacy."""
    from app.services import dispute_service as dsvc
    account, profile = account_profile
    return await dsvc.list_disputes(
        session,
        raised_by_app="PHARMACY",
        raised_by_id=account.account_id,
        status=status_filter,
        dispute_type=dispute_type,
        limit=limit,
        offset=offset,
    )


@router.get("/disputes/{dispute_id}")
async def my_dispute_detail(
    dispute_id: uuid.UUID,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_main_session),
):
    """Get a specific dispute — only if raised by this pharmacy."""
    from app.services import dispute_service as dsvc
    account, _ = account_profile
    dispute = await dsvc.get_dispute(session, dispute_id)
    if str(dispute.get("raised_by_id")) != str(account.account_id):
        raise HTTPException(status_code=403, detail="Access denied.")
    return dispute


@router.post("/disputes")
async def raise_pharmacy_dispute(
    dispute_type: str                  = Form(...),
    reference_type: str                = Form(...),
    reference_id: Optional[str]        = Form(None),
    reference_detail: str              = Form("{}"),
    text_content: Optional[str]        = Form(None),
    voice_duration_secs: Optional[int] = Form(None),
    voice_file: Optional[UploadFile]   = File(None),
    image_file: Optional[UploadFile]   = File(None),
    attachment_file: Optional[UploadFile] = File(None),
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_main_session),
):
    """Raise a dispute from the pharmacy portal."""
    import json
    from app.services import dispute_service as dsvc
    account, profile = account_profile
    result = await dsvc.raise_dispute(
        session,
        raised_by_app="PHARMACY",
        raised_by_id=account.account_id,
        raised_by_name=profile.store_name if profile else str(account.account_id),
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
    await session.commit()
    return result


@router.post("/disputes/{dispute_id}/reopen")
async def reopen_pharmacy_dispute(
    dispute_id: uuid.UUID,
    text_content: Optional[str]        = Form(None),
    voice_duration_secs: Optional[int] = Form(None),
    voice_file: Optional[UploadFile]   = File(None),
    image_file: Optional[UploadFile]   = File(None),
    attachment_file: Optional[UploadFile] = File(None),
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_main_session),
):
    """Reopen a resolved dispute — only by the original pharmacy raiser."""
    from app.services import dispute_service as dsvc
    account, profile = account_profile
    result = await dsvc.reopen_dispute(
        session,
        dispute_id=dispute_id,
        raised_by_id=account.account_id,
        raised_by_name=profile.store_name if profile else str(account.account_id),
        raised_by_app="PHARMACY",
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await session.commit()
    return result


# ── Web Push Subscription ─────────────────────────────────────────────────────

from pydantic import BaseModel

class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

@router.post("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe_push(
    payload: PushSubscribeRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    from app.services.push_service import save_subscription
    await save_subscription(
        session,
        account_profile[0].account_id,
        payload.endpoint,
        payload.p256dh,
        payload.auth,
    )

@router.delete("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_push(
    payload: PushSubscribeRequest,
    account_profile: tuple[PharmacyAccount, PharmacyProfile] = Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    from app.services.push_service import delete_subscription
    await delete_subscription(session, account_profile[0].account_id, payload.endpoint)


@router.get("/push/vapid-public-key")
async def vapid_public_key():
    from app.core.config import get_settings
    return {"key": get_settings().vapid_public_key}


# ── Order Disputes (pharmacy) ─────────────────────────────────────────────────

import uuid as _puuid
from typing import Optional as _POpt
from fastapi import File as _PFile, Form as _PForm, UploadFile as _PUpload
from app.db.session import get_session as _get_main_session


@router.post("/order-disputes", status_code=201)
async def pharmacy_raise_order_dispute(
    source_order_id: str = _PForm(...),
    tagged_sectors: str = _PForm("pharmacy"),
    text_content: _POpt[str] = _PForm(None),
    voice_duration_secs: _POpt[int] = _PForm(None),
    voice_file: _POpt[_PUpload] = _PFile(None),
    image_file: _POpt[_PUpload] = _PFile(None),
    attachment_file: _POpt[_PUpload] = _PFile(None),
    account_profile: tuple = Depends(get_current_pharmacy),
    main_session: AsyncSession = Depends(_get_main_session),
):
    from app.services import dispute_service as dsvc
    account: PharmacyAccount = account_profile[0]
    sectors = [s.strip() for s in tagged_sectors.split(",") if s.strip()]
    result = await dsvc.user_raise_order_dispute(
        main_session,
        raised_by_app="PHARMACY",
        raised_by_id=account.account_id,
        raised_by_name=account.business_name or account.contact_name,
        source_order_id=_puuid.UUID(source_order_id),
        tagged_sectors=sectors,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await main_session.commit()
    return result


@router.get("/order-disputes/unread-count")
async def pharmacy_dispute_unread_count(
    account_profile: tuple = Depends(get_current_pharmacy),
    main_session: AsyncSession = Depends(_get_main_session),
):
    from app.services import dispute_service as dsvc
    count = await dsvc.user_unread_count(main_session, account_profile[0].account_id)
    return {"unread": count}


@router.get("/order-disputes")
async def pharmacy_list_order_disputes(
    status: _POpt[str] = None,
    account_profile: tuple = Depends(get_current_pharmacy),
    main_session: AsyncSession = Depends(_get_main_session),
):
    from app.services import dispute_service as dsvc
    return await dsvc.user_list_disputes(main_session, account_profile[0].account_id, status=status)


@router.get("/order-disputes/{dispute_id}")
async def pharmacy_get_order_dispute(
    dispute_id: _puuid.UUID,
    account_profile: tuple = Depends(get_current_pharmacy),
    main_session: AsyncSession = Depends(_get_main_session),
):
    from app.services import dispute_service as dsvc
    await dsvc.user_mark_read(main_session, dispute_id, account_profile[0].account_id)
    return await dsvc.get_dispute(main_session, dispute_id)


@router.post("/order-disputes/{dispute_id}/reply")
async def pharmacy_reply_order_dispute(
    dispute_id: _puuid.UUID,
    text_content: _POpt[str] = _PForm(None),
    voice_duration_secs: _POpt[int] = _PForm(None),
    voice_file: _POpt[_PUpload] = _PFile(None),
    image_file: _POpt[_PUpload] = _PFile(None),
    attachment_file: _POpt[_PUpload] = _PFile(None),
    account_profile: tuple = Depends(get_current_pharmacy),
    main_session: AsyncSession = Depends(_get_main_session),
):
    from app.services import dispute_service as dsvc
    account: PharmacyAccount = account_profile[0]
    result = await dsvc.user_reply_dispute(
        main_session, dispute_id,
        raised_by_app="PHARMACY",
        raised_by_id=account.account_id,
        raised_by_name=account.business_name or account.contact_name,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await main_session.commit()
    return result


@router.post("/order-disputes/{dispute_id}/close")
async def pharmacy_close_order_dispute(
    dispute_id: _puuid.UUID,
    account_profile: tuple = Depends(get_current_pharmacy),
    main_session: AsyncSession = Depends(_get_main_session),
):
    from app.services import dispute_service as dsvc
    result = await dsvc.user_close_dispute(main_session, dispute_id, account_profile[0].account_id)
    await main_session.commit()
    return result


@router.get("/attention")
async def pharmacy_attention_items(
    account_profile=Depends(get_current_pharmacy),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Items needing immediate attention on pharmacy home page load."""
    from app.services.attention_service import get_pharmacy_attention
    account = account_profile[0]
    return await get_pharmacy_attention(session, account.account_id)
