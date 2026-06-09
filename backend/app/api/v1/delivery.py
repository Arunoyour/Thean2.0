"""Delivery Boy API endpoints — all sessions use the delivery DB (schema D)."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from app.core.config import get_settings
from app.db.session import get_delivery_session
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
    list_all_delivery_accounts,
    list_all_delivery_orders_admin,
    list_chat_messages,
    list_delivery_orders,
    list_unassigned_orders,
    register_delivery_account,
    reject_delivery_order,
    request_cashout,
    request_delivery_otp,
    send_chat_message,
    set_delivery_availability,
    set_rate,
    submit_delivery_rating,
    update_delivery_location,
    upload_delivery_document,
    verify_delivery_otp,
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
    payload: DeliveryRegisterRequest,
    session: AsyncSession = Depends(get_delivery_session),
):
    return await register_delivery_account(session, payload)


@router.post("/documents/{doc_type}", status_code=status.HTTP_204_NO_CONTENT)
async def upload_document(
    doc_type: str,
    file: UploadFile = File(...),
    account: DeliveryAccount = Depends(get_current_delivery_account),
    session: AsyncSession = Depends(get_delivery_session),
):
    if doc_type not in ("driving_license", "id_proof"):
        raise HTTPException(status_code=422, detail="doc_type must be driving_license or id_proof")
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
