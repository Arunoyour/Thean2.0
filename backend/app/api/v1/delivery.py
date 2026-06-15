"""Delivery Boy API endpoints — all sessions use the delivery DB (schema D)."""
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from app.core.config import get_settings
from app.db.session import get_delivery_session
from app.db.session import get_session as get_main_session
from app.models.delivery import DeliveryAccount
from app.schemas.delivery import (
    AdminCodClearRequest,
    AutoAssignRequest,
    AutoAssignResult,
    CodSummaryResponse,
    DeliveryAccountResponse,
    DeliveryAssignRequest,
    DeliveryAuthResponse,
    DeliveryAvailabilityRequest,
    DeliveryLocationRequest,
    DeliveryOtpRequest,
    DeliveryOtpVerifyRequest,
    DeliveryOrderResponse,
    DeliveryRatingRequest,
    DeliveryRatingResponse,
    DeliveryRegisterRequest,
    DeliveryStatusUpdateRequest,
    DeliveryTrackingResponse,
    RateConfigResponse,
    SetRateRequest,
    SetSurgeConfigRequest,
    SetTierRateRequest,
    SetAccountTierRequest,
    SetAccountCustomRateRequest,
    SurgeConfigResponse,
    TierRateResponse,
    SendChatMessageRequest,
    CashoutRequest,
    EarningsSummaryResponse,
    UnassignedSourceOrder,
)
from app.services.delivery_service import (
    accept_delivery_order,
    admin_assign_delivery_order,
    admin_clear_cod,
    admin_set_account_status,
    advance_delivery_status,
    auto_assign_best_driver,
    get_active_delivery_order,
    get_cod_summary,
    get_current_rate,
    get_delivery_account,
    get_delivery_tracking,
    get_earnings_summary,
    get_rate_history,
    get_surge_config,
    list_all_delivery_accounts,
    list_all_delivery_orders_admin,
    list_chat_messages,
    list_delivery_orders,
    list_tier_rates,
    list_unassigned_orders,
    register_delivery_account,
    reject_delivery_order,
    request_cashout,
    request_delivery_otp,
    send_chat_message,
    set_account_custom_rate,
    set_account_tier,
    set_delivery_availability,
    set_rate,
    set_surge_config,
    set_tier_rate,
    submit_delivery_rating,
    update_delivery_location,
    upload_delivery_document,
    verify_delivery_otp,
    get_location_trail,
    get_all_active_locations,
)

router = APIRouter(prefix="/delivery", tags=["delivery"])
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_delivery_account(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_delivery_session),
) -> DeliveryAccount:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token.")
    try:
        settings = get_settings()
        payload = jwt.decode(credentials.credentials, settings.app_secret_key, algorithms=["HS256"])
        if payload.get("type") != "delivery":
            raise ValueError("Not a delivery token.")
        account_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, JWTError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

    from sqlalchemy import select
    result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.account_id == account_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found.")
    if account.account_status == "disabled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been disabled.")
    # COD block check — allow through so front-end can show the blocked screen,
    # but block any mutating delivery actions (handled per-endpoint / service).
    return account


async def _check_admin(token: str | None) -> None:
    settings = get_settings()
    if token != settings.super_admin_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")


# ── Registration & Auth ───────────────────────────────────────────────────

@router.post("/register", response_model=DeliveryAccountResponse, status_code=status.HTTP_201_CREATED)
async def register(
    full_name:      str          = Form(...),
    phone_number:   str          = Form(...),
    email:          str | None   = Form(None),
    vehicle_type:   str          = Form(...),
    vehicle_number: str | None   = Form(None),
    license_number: str | None   = Form(None),
    id_number:      str | None   = Form(None),
    rc_book_front:  UploadFile   = File(...),
    rc_book_back:   UploadFile   = File(...),
    insurance:      UploadFile   = File(...),
    profile_photo:  UploadFile   = File(...),
    session: AsyncSession = Depends(get_delivery_session),
):
    _MAX = 1 * 1024 * 1024  # 1 MB
    for label, f in [("RC book front", rc_book_front), ("RC book back", rc_book_back), ("Insurance", insurance), ("Profile photo", profile_photo)]:
        content = await f.read()
        if len(content) > _MAX:
            raise HTTPException(status_code=422, detail=f"{label} exceeds the 1 MB limit.")
        await f.seek(0)

    payload = DeliveryRegisterRequest(
        full_name=full_name, phone_number=phone_number, email=email,
        vehicle_type=vehicle_type, vehicle_number=vehicle_number,
        license_number=license_number, id_number=id_number,
    )
    account_resp = await register_delivery_account(session, payload)

    # Resolve the newly created account to save documents
    from sqlalchemy import select
    from app.models.delivery import DeliveryAccount as DA
    result = await session.execute(select(DA).where(DA.phone_number == phone_number))
    account_obj = result.scalar_one_or_none()
    if account_obj:
        for doc_type, file in [("rc_book_front", rc_book_front), ("rc_book_back", rc_book_back), ("insurance", insurance), ("profile_photo", profile_photo)]:
            await upload_delivery_document(session, account_obj.account_id, doc_type, file)

    return account_resp


@router.post("/documents/{doc_type}", status_code=status.HTTP_204_NO_CONTENT)
async def upload_document(
    doc_type: str,
    file: UploadFile = File(...),
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    if doc_type not in ("driving_license", "id_proof", "rc_book_front", "rc_book_back", "insurance", "profile_photo"):
        raise HTTPException(status_code=422, detail="Invalid doc_type")
    await upload_delivery_document(session, account.account_id, doc_type, file)


@router.post("/request-otp")
async def request_otp(
    payload: DeliveryOtpRequest,
    session: AsyncSession = Depends(get_delivery_session),
):
    return await request_delivery_otp(session, payload.phone_number)


@router.post("/verify-otp", response_model=DeliveryAuthResponse)
async def verify_otp(
    payload: DeliveryOtpVerifyRequest,
    session: AsyncSession = Depends(get_delivery_session),
):
    return await verify_delivery_otp(session, payload.phone_number, payload.otp)


# ── Profile ───────────────────────────────────────────────────────────────

@router.get("/me", response_model=DeliveryAccountResponse)
async def me(account: DeliveryAccount = Depends(get_current_delivery_account)):
    from app.services.delivery_service import serialize_account
    return serialize_account(account)


@router.patch("/me/availability", response_model=DeliveryAccountResponse)
async def set_availability(
    payload: DeliveryAvailabilityRequest,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await set_delivery_availability(session, account.account_id, payload.is_online)


@router.patch("/me/location", status_code=status.HTTP_204_NO_CONTENT)
async def update_location(
    payload: DeliveryLocationRequest,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    await update_delivery_location(session, account.account_id, payload.lat, payload.lng)


# ── Orders ────────────────────────────────────────────────────────────────

@router.get("/orders", response_model=list[DeliveryOrderResponse])
async def my_orders(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await list_delivery_orders(session, account.account_id)


@router.get("/orders/active", response_model=DeliveryOrderResponse | None)
async def active_order(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await get_active_delivery_order(session, account.account_id)


@router.post("/orders/{delivery_order_id}/accept", response_model=DeliveryOrderResponse)
async def accept_order(
    delivery_order_id: uuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    if account.cod_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is COD-blocked (₹{float(account.cod_balance):.0f} pending). Clear payment first.",
        )
    return await accept_delivery_order(session, account.account_id, delivery_order_id)


@router.post("/orders/{delivery_order_id}/reject", response_model=DeliveryOrderResponse)
async def reject_order(
    delivery_order_id: uuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await reject_delivery_order(session, account.account_id, delivery_order_id)


@router.post("/orders/{delivery_order_id}/advance", response_model=DeliveryOrderResponse)
async def advance_status(
    delivery_order_id: uuid.UUID,
    payload: DeliveryStatusUpdateRequest,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    if account.cod_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is COD-blocked (₹{float(account.cod_balance):.0f} pending). Clear payment first.",
        )
    return await advance_delivery_status(session, account.account_id, delivery_order_id, payload.pin)


# ── COD ───────────────────────────────────────────────────────────────────

@router.get("/cod", response_model=CodSummaryResponse)
async def cod_summary(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await get_cod_summary(session, account.account_id)


@router.post("/admin/cod-clear/{account_id}", response_model=DeliveryAccountResponse)
async def admin_cod_clear(
    account_id: uuid.UUID,
    payload: AdminCodClearRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await admin_clear_cod(session, account_id, payload.amount, payload.cleared_by, payload.note)


# ── Chat ──────────────────────────────────────────────────────────────────

@router.get("/orders/{delivery_order_id}/chat")
async def get_chat(
    delivery_order_id: uuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await list_chat_messages(session, delivery_order_id)


@router.post("/orders/{delivery_order_id}/chat")
async def post_chat(
    delivery_order_id: uuid.UUID,
    payload: SendChatMessageRequest,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await send_chat_message(session, delivery_order_id, account.account_id, "delivery", payload.message_text)


# ── Earnings ──────────────────────────────────────────────────────────────

@router.get("/earnings", response_model=EarningsSummaryResponse)
async def earnings(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await get_earnings_summary(session, account.account_id)


@router.post("/earnings/cashout")
async def cashout(
    payload: CashoutRequest,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    return await request_cashout(session, account.account_id, payload.amount, payload.upi_id)


# ── Document media ────────────────────────────────────────────────────────

@router.get("/documents/{doc_type}/file")
async def get_document_file(
    doc_type: str,
    account: DeliveryAccount = Depends(get_current_delivery_account),
):
    settings = get_settings()
    folder = Path(settings.media_root) / "delivery" / str(account.account_id) / doc_type
    files = list(folder.glob("*")) if folder.exists() else []
    if not files:
        raise HTTPException(status_code=404, detail="Document not found.")
    return FileResponse(files[0])


# ── Admin endpoints ───────────────────────────────────────────────────────

@router.get("/admin/accounts", response_model=list[DeliveryAccountResponse])
async def admin_list_accounts(
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await list_all_delivery_accounts(session)


@router.post("/admin/accounts/{account_id}/status", response_model=DeliveryAccountResponse)
async def admin_update_status(
    account_id: uuid.UUID,
    new_status: str,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    if new_status not in ("active", "disabled", "pending"):
        raise HTTPException(status_code=422, detail="Invalid status.")
    return await admin_set_account_status(session, account_id, new_status)


@router.post("/admin/assign", response_model=DeliveryOrderResponse, status_code=status.HTTP_201_CREATED)
async def admin_assign(
    payload: DeliveryAssignRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await admin_assign_delivery_order(session, payload)


@router.get("/admin/orders", response_model=list[DeliveryOrderResponse])
async def admin_list_orders(
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await list_all_delivery_orders_admin(session)


# ── Rate Config ───────────────────────────────────────────────────────────
# Public endpoint — delivery app and anyone can read the current rate.

@router.get("/config/rate", response_model=RateConfigResponse)
async def get_rate(session: AsyncSession = Depends(get_delivery_session)):
    """Return the current live rate per km. No auth required."""
    return await get_current_rate(session)


@router.get("/config/rate/history", response_model=list[RateConfigResponse])
async def rate_history(
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    """Full change log — admin only."""
    await _check_admin(x_super_admin_token)
    return await get_rate_history(session)


@router.post("/admin/config/rate", response_model=RateConfigResponse, status_code=201)
async def update_rate(
    payload: SetRateRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    """Set a new rate. Previous rates are preserved as change log."""
    await _check_admin(x_super_admin_token)
    return await set_rate(session, payload)


# ── Tier rates ────────────────────────────────────────────────────────────

@router.get("/admin/config/tier-rates", response_model=list[TierRateResponse])
async def get_tier_rates(
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await list_tier_rates(session)


@router.put("/admin/config/tier-rates/{tier}", response_model=TierRateResponse)
async def update_tier_rate(
    tier: str,
    payload: SetTierRateRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await set_tier_rate(session, tier, payload)


@router.put("/admin/delivery-boys/{account_id}/tier", response_model=DeliveryAccountResponse)
async def update_account_tier(
    account_id: uuid.UUID,
    payload: SetAccountTierRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await set_account_tier(session, account_id, payload.tier)


@router.put("/admin/delivery-boys/{account_id}/custom-rate", response_model=DeliveryAccountResponse)
async def update_account_custom_rate(
    account_id: uuid.UUID,
    payload: SetAccountCustomRateRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await set_account_custom_rate(session, account_id, payload.custom_rate_per_km)


# ── Surge Config ─────────────────────────────────────────────────────────

@router.get("/config/surge", response_model=SurgeConfigResponse)
async def get_surge(session: AsyncSession = Depends(get_delivery_session)):
    """Public — returns the current surge config so UIs can show the surge label and fee impact."""
    return await get_surge_config(session)


@router.put("/admin/config/surge", response_model=SurgeConfigResponse)
async def update_surge(
    payload: SetSurgeConfigRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    await _check_admin(x_super_admin_token)
    return await set_surge_config(session, payload)


# ── Customer-facing tracking ─────────────────────────────────────────────

@router.get("/tracking/{source_order_id}", response_model=DeliveryTrackingResponse | None)
async def customer_delivery_tracking(
    source_order_id: uuid.UUID,
    x_customer_id: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    """
    Customer app polls this every 5 seconds once the order is in transit.
    Returns driver's live lat/lng, status, and phone (after ORDER_PICKED_UP).
    Returns 404 when no active delivery order exists for this pharmacy order.
    """
    if not x_customer_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-Customer-Id header required.")
    try:
        customer_id = uuid.UUID(x_customer_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid X-Customer-Id.")

    result = await get_delivery_tracking(session, source_order_id, customer_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No active delivery found for this order.")
    return result


# ── Smart Auto-Assign ─────────────────────────────────────────────────────

@router.get("/admin/unassigned-orders", response_model=list[UnassignedSourceOrder])
async def get_unassigned_orders(
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    """List all pharmacy orders in READY_FOR_DELIVERY state with no delivery boy assigned."""
    await _check_admin(x_super_admin_token)
    return await list_unassigned_orders(session)


@router.post("/admin/auto-assign", response_model=AutoAssignResult)
async def admin_auto_assign(
    payload: AutoAssignRequest,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    """Score all eligible drivers and assign the best one to the given order."""
    await _check_admin(x_super_admin_token)
    return await auto_assign_best_driver(session, payload)


# ── Rating (customer submits after delivery) ──────────────────────────────

@router.post("/orders/{delivery_order_id}/rate", response_model=DeliveryRatingResponse)
async def rate_delivery(
    delivery_order_id: uuid.UUID,
    payload: DeliveryRatingRequest,
    session: AsyncSession = Depends(get_delivery_session),
    x_customer_id: str | None = None,  # passed as header by customer app
):
    """
    Customer submits a 1-5 star rating after their order is DELIVERED.
    Pass the customer's user_id via the X-Customer-Id header.
    """
    if not x_customer_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-Customer-Id header required.")
    try:
        customer_id = uuid.UUID(x_customer_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid X-Customer-Id.")
    return await submit_delivery_rating(session, delivery_order_id, customer_id, payload)


# ── Settlement endpoints (delivery boy views own settlement batches) ────────

@router.get("/settlement/batches")
async def my_settlement_batches(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(get_main_session),
):
    """List settlement batches for the logged-in delivery boy."""
    from app.services.settlement_service import list_batches
    return await list_batches(
        main_session,
        stakeholder_type="DELIVERY",
        stakeholder_id=account.account_id,
    )


@router.get("/settlement/batches/{batch_id}")
async def my_settlement_batch_detail(
    batch_id: uuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(get_main_session),
):
    """Get a specific settlement batch for the logged-in delivery boy."""
    from app.services.settlement_service import get_batch_detail
    detail = await get_batch_detail(main_session, batch_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Batch not found.")
    if str(detail.get("stakeholder_id")) != str(account.account_id):
        raise HTTPException(status_code=403, detail="Not your settlement batch.")
    return detail


@router.get("/settlement/batches/{batch_id}/proofs")
async def my_settlement_proofs(
    batch_id: uuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(get_main_session),
):
    """List payment proofs for a settlement batch."""
    from app.services.settlement_service import get_batch_detail, list_payment_proofs
    detail = await get_batch_detail(main_session, batch_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Batch not found.")
    if str(detail.get("stakeholder_id")) != str(account.account_id):
        raise HTTPException(status_code=403, detail="Not your settlement batch.")
    return await list_payment_proofs(main_session, batch_id)


# ── Dispute endpoints (delivery boy raises/views own disputes) ──────────────

@router.get("/disputes")
async def my_disputes(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(get_main_session),
):
    """List disputes raised by the logged-in delivery boy."""
    from app.services import dispute_service as dsvc
    return await dsvc.list_disputes(main_session, raised_by_id=account.account_id)


@router.get("/disputes/{dispute_id}")
async def my_dispute_detail(
    dispute_id: uuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(get_main_session),
):
    """Get a specific dispute for the logged-in delivery boy."""
    from app.services import dispute_service as dsvc
    detail = await dsvc.get_dispute(main_session, dispute_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Dispute not found.")
    if str(detail.get("raised_by_id")) != str(account.account_id):
        raise HTTPException(status_code=403, detail="Not your dispute.")
    return detail


@router.post("/disputes")
async def raise_delivery_dispute(
    dispute_type: str = Form(...),
    reference_type: Optional[str] = Form(None),
    reference_id: Optional[str] = Form(None),
    description: str = Form(...),
    image: Optional[UploadFile] = File(None),
    voice_note: Optional[UploadFile] = File(None),
    attachment: Optional[UploadFile] = File(None),
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(get_main_session),
):
    """Raise a new dispute as a delivery boy."""
    from app.services import dispute_service as dsvc
    raised_by_app = "TEAM_LEAD" if account.role == "TEAM_LEAD" else "DELIVERY_BOY"
    ref_id = uuid.UUID(reference_id) if reference_id else None
    result = await dsvc.raise_dispute(
        main_session,
        raised_by_app=raised_by_app,
        raised_by_id=account.account_id,
        raised_by_name=account.full_name,
        dispute_type=dispute_type,
        reference_type=reference_type or "OTHER",
        reference_id=ref_id,
        reference_detail={},
        text_content=description,
        voice_file=voice_note,
        voice_duration_secs=None,
        image_file=image,
        attachment_file=attachment,
    )
    await main_session.commit()
    return result


@router.post("/disputes/{dispute_id}/reopen")
async def reopen_delivery_dispute(
    dispute_id: uuid.UUID,
    description: str = Form(...),
    image: Optional[UploadFile] = File(None),
    voice_note: Optional[UploadFile] = File(None),
    attachment: Optional[UploadFile] = File(None),
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(get_main_session),
):
    """Reopen a resolved dispute as a delivery boy."""
    from app.services import dispute_service as dsvc
    raised_by_app = "TEAM_LEAD" if account.role == "TEAM_LEAD" else "DELIVERY_BOY"
    result = await dsvc.reopen_dispute(
        main_session,
        dispute_id,
        raised_by_id=account.account_id,
        raised_by_name=account.full_name,
        raised_by_app=raised_by_app,
        text_content=description,
        voice_file=voice_note,
        voice_duration_secs=None,
        image_file=image,
        attachment_file=attachment,
    )
    await main_session.commit()
    return result


# ── Team Lead endpoints ─────────────────────────────────────────────────────

def _require_team_lead(account: DeliveryAccount) -> DeliveryAccount:
    if account.role != "TEAM_LEAD":
        raise HTTPException(status_code=403, detail="Team lead access required.")
    return account


@router.get("/team/members")
async def team_members(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    """TEAM_LEAD: list all delivery accounts with live status."""
    _require_team_lead(account)
    from sqlalchemy import select
    from app.models.delivery import DeliveryAccount as DA
    result = await session.execute(
        select(DA).where(DA.role == "DELIVERY_BOY").order_by(DA.full_name)
    )
    members = result.scalars().all()
    return [
        {
            "account_id": str(m.account_id),
            "full_name": m.full_name,
            "phone_number": m.phone_number,
            "vehicle_type": m.vehicle_type,
            "account_status": m.account_status,
            "is_online": m.is_online,
            "current_lat": float(m.current_lat) if m.current_lat else None,
            "current_lng": float(m.current_lng) if m.current_lng else None,
            "location_updated_at": m.location_updated_at.isoformat() if m.location_updated_at else None,
            "cod_balance": float(m.cod_balance),
            "cod_blocked": m.cod_blocked,
            "avg_rating": float(m.avg_rating),
            "rating_count": m.rating_count,
            "total_assigned": m.total_assigned,
            "total_accepted": m.total_accepted,
            "total_cancelled": m.total_cancelled,
        }
        for m in members
    ]


@router.get("/team/members/{member_id}")
async def team_member_detail(
    member_id: uuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    """TEAM_LEAD: get full details for a specific delivery boy."""
    _require_team_lead(account)
    from sqlalchemy import select
    from app.models.delivery import DeliveryAccount as DA, DeliveryDocument
    result = await session.execute(select(DA).where(DA.account_id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")
    docs_result = await session.execute(
        select(DeliveryDocument).where(DeliveryDocument.account_id == member_id)
    )
    docs = docs_result.scalars().all()
    return {
        "account_id": str(member.account_id),
        "full_name": member.full_name,
        "phone_number": member.phone_number,
        "email": member.email,
        "vehicle_type": member.vehicle_type,
        "vehicle_number": member.vehicle_number,
        "account_status": member.account_status,
        "is_online": member.is_online,
        "current_lat": float(member.current_lat) if member.current_lat else None,
        "current_lng": float(member.current_lng) if member.current_lng else None,
        "location_updated_at": member.location_updated_at.isoformat() if member.location_updated_at else None,
        "cod_balance": float(member.cod_balance),
        "cod_blocked": member.cod_blocked,
        "avg_rating": float(member.avg_rating),
        "rating_count": member.rating_count,
        "total_assigned": member.total_assigned,
        "total_accepted": member.total_accepted,
        "total_cancelled": member.total_cancelled,
        "created_at": member.created_at.isoformat(),
        "documents": [
            {"doc_type": d.doc_type, "verified": d.verified, "uploaded_at": d.uploaded_at.isoformat()}
            for d in docs
        ],
    }


@router.get("/team/earnings")
async def team_earnings(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    """TEAM_LEAD: earnings summary for every delivery boy on the team."""
    _require_team_lead(account)
    from sqlalchemy import select, func as sqlfunc
    from app.models.delivery import DeliveryAccount as DA, DeliveryEarning
    from datetime import date, timedelta
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    members_result = await session.execute(
        select(DA).where(DA.role == "DELIVERY_BOY").order_by(DA.full_name)
    )
    members = members_result.scalars().all()

    rows = []
    for m in members:
        earn_result = await session.execute(
            select(
                sqlfunc.coalesce(sqlfunc.sum(DeliveryEarning.amount), 0).label("total"),
            ).where(DeliveryEarning.account_id == m.account_id)
        )
        total = float(earn_result.scalar() or 0)

        earn_today = await session.execute(
            select(sqlfunc.coalesce(sqlfunc.sum(DeliveryEarning.amount), 0)).where(
                DeliveryEarning.account_id == m.account_id,
                sqlfunc.date(DeliveryEarning.earned_at) == today,
            )
        )
        today_amt = float(earn_today.scalar() or 0)

        earn_week = await session.execute(
            select(sqlfunc.coalesce(sqlfunc.sum(DeliveryEarning.amount), 0)).where(
                DeliveryEarning.account_id == m.account_id,
                sqlfunc.date(DeliveryEarning.earned_at) >= week_start,
            )
        )
        week_amt = float(earn_week.scalar() or 0)

        rows.append({
            "account_id": str(m.account_id),
            "full_name": m.full_name,
            "is_online": m.is_online,
            "total_assigned": m.total_assigned,
            "total_accepted": m.total_accepted,
            "avg_rating": float(m.avg_rating),
            "today": today_amt,
            "this_week": week_amt,
            "all_time": total,
            "cod_balance": float(m.cod_balance),
            "cod_blocked": m.cod_blocked,
        })
    return rows


@router.get("/team/cod")
async def team_cod(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    """TEAM_LEAD: COD balance for all delivery boys (for reconciliation view)."""
    _require_team_lead(account)
    from sqlalchemy import select
    from app.models.delivery import DeliveryAccount as DA
    result = await session.execute(
        select(DA).where(DA.role == "DELIVERY_BOY", DA.cod_balance > 0).order_by(DA.cod_blocked.desc(), DA.cod_balance.desc())
    )
    members = result.scalars().all()
    return [
        {
            "account_id": str(m.account_id),
            "full_name": m.full_name,
            "phone_number": m.phone_number,
            "cod_balance": float(m.cod_balance),
            "cod_blocked": m.cod_blocked,
            "is_online": m.is_online,
        }
        for m in members
    ]


# ── Live location & trail ──────────────────────────────────────────────────

@router.get("/orders/{delivery_order_id}/location-trail")
async def location_trail(
    delivery_order_id: uuid.UUID,
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    """Full GPS trail for a delivery order — for admin replay."""
    await _check_admin(x_super_admin_token)
    return await get_location_trail(session, delivery_order_id)


@router.get("/admin/active-locations")
async def active_locations(
    x_super_admin_token: str | None = None,
    session: AsyncSession = Depends(get_delivery_session),
):
    """Admin: current position of every delivery boy with an active delivery order.
    Used by the live map."""
    await _check_admin(x_super_admin_token)
    return await get_all_active_locations(session)


# ── Order Disputes (delivery boy) ─────────────────────────────────────────────

import uuid as _duuid
from typing import Optional as _DOpt
from fastapi import File as _DFile, Form as _DForm, UploadFile as _DUpload
from app.db.session import get_session as _get_main_session_d


@router.post("/order-disputes", status_code=201)
async def delivery_raise_order_dispute(
    source_order_id: str = _DForm(...),
    tagged_sectors: str = _DForm("delivery"),
    text_content: _DOpt[str] = _DForm(None),
    voice_duration_secs: _DOpt[int] = _DForm(None),
    voice_file: _DOpt[_DUpload] = _DFile(None),
    image_file: _DOpt[_DUpload] = _DFile(None),
    attachment_file: _DOpt[_DUpload] = _DFile(None),
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(_get_main_session_d),
):
    from app.services import dispute_service as dsvc
    sectors = [s.strip() for s in tagged_sectors.split(",") if s.strip()]
    result = await dsvc.user_raise_order_dispute(
        main_session,
        raised_by_app="DELIVERY_BOY",
        raised_by_id=account.account_id,
        raised_by_name=account.full_name,
        source_order_id=_duuid.UUID(source_order_id),
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
async def delivery_dispute_unread_count(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(_get_main_session_d),
):
    from app.services import dispute_service as dsvc
    count = await dsvc.user_unread_count(main_session, account.account_id)
    return {"unread": count}


@router.get("/order-disputes")
async def delivery_list_order_disputes(
    status: _DOpt[str] = None,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(_get_main_session_d),
):
    from app.services import dispute_service as dsvc
    return await dsvc.user_list_disputes(main_session, account.account_id, status=status)


@router.get("/order-disputes/{dispute_id}")
async def delivery_get_order_dispute(
    dispute_id: _duuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(_get_main_session_d),
):
    from app.services import dispute_service as dsvc
    await dsvc.user_mark_read(main_session, dispute_id, account.account_id)
    return await dsvc.get_dispute(main_session, dispute_id)


@router.post("/order-disputes/{dispute_id}/reply")
async def delivery_reply_order_dispute(
    dispute_id: _duuid.UUID,
    text_content: _DOpt[str] = _DForm(None),
    voice_duration_secs: _DOpt[int] = _DForm(None),
    voice_file: _DOpt[_DUpload] = _DFile(None),
    image_file: _DOpt[_DUpload] = _DFile(None),
    attachment_file: _DOpt[_DUpload] = _DFile(None),
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(_get_main_session_d),
):
    from app.services import dispute_service as dsvc
    result = await dsvc.user_reply_dispute(
        main_session, dispute_id,
        raised_by_app="DELIVERY_BOY",
        raised_by_id=account.account_id,
        raised_by_name=account.full_name,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await main_session.commit()
    return result


@router.post("/order-disputes/{dispute_id}/close")
async def delivery_close_order_dispute(
    dispute_id: _duuid.UUID,
    account: DeliveryAccount = Depends(get_current_delivery_account),
    main_session: AsyncSession = Depends(_get_main_session_d),
):
    from app.services import dispute_service as dsvc
    result = await dsvc.user_close_dispute(main_session, dispute_id, account.account_id)
    await main_session.commit()
    return result


@router.get("/attention")
async def delivery_attention_items(
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    """Items needing immediate attention on delivery home page load."""
    from app.services.attention_service import get_delivery_attention
    return await get_delivery_attention(session, account.account_id)
