import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
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
    create_pharmacy_product,
    list_customer_visible_products,
    list_nearby_pharmacies,
    list_own_products,
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
