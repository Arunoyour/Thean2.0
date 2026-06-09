import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_super_admin
from app.db.session import get_pharmacy_session, get_session
from app.models.super_admin import SuperAdmin
from app.schemas.pharmacy import (
    PharmacyAccountResponse,
    PharmacyAdminUpdateRequest,
    PharmacyAvailabilityEventResponse,
    PharmacyProductCommentRequest,
    PharmacyProductReviewResponse,
)
from app.schemas.admin_customer import AdminCustomerDetailResponse, AdminCustomerSummaryResponse
from app.schemas.pharmacy import PharmacyStatusEventResponse, PharmacyStatusUpdateRequest
from app.schemas.super_admin import (
    SuperAdminAuthResponse,
    SuperAdminOtpRequest,
    SuperAdminOtpResponse,
    SuperAdminOtpVerifyRequest,
    SuperAdminResponse,
)
from app.services.pharmacy_service import (
    activate_pharmacy,
    approve_product,
    list_pharmacies,
    list_pharmacy_availability_events,
    list_products_for_review,
    list_pharmacy_timeline,
    request_product_revision,
    set_pharmacy_status,
    update_pharmacy_details,
)
from app.services.super_admin_service import (
    request_super_admin_otp,
    serialize_super_admin,
    verify_super_admin_otp,
)
from app.services.admin_customer_service import get_admin_customer_detail, list_admin_customers
from app.services.customer_order_service import (
    get_any_order_by_id,
    get_customer_order_media_file_path,
    get_sector_fee_configs,
    get_sector_fee_history,
    list_all_pharmacy_orders,
    list_substitution_audit_orders,
    serialize_order,
    set_sector_fee,
)
from app.schemas.customer_order import CustomerPharmacyOrderResponse, SectorFeeConfigResponse, SetSectorFeeRequest
from starlette.responses import FileResponse

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


@router.post("/request-otp", response_model=SuperAdminOtpResponse)
async def request_login_otp(
    payload: SuperAdminOtpRequest,
    session: AsyncSession = Depends(get_session),
):
    return await request_super_admin_otp(session, payload.phone_number)


@router.post("/verify-otp", response_model=SuperAdminAuthResponse)
async def verify_login_otp(
    payload: SuperAdminOtpVerifyRequest,
    session: AsyncSession = Depends(get_session),
):
    return await verify_super_admin_otp(session, payload.phone_number, payload.otp)


@router.get("/me", response_model=SuperAdminResponse)
async def me(admin: SuperAdmin = Depends(get_current_super_admin)):
    return serialize_super_admin(admin)


@router.get("/customers", response_model=list[AdminCustomerSummaryResponse])
async def customers(
    _: SuperAdmin = Depends(get_current_super_admin),
    core_session: AsyncSession = Depends(get_session),
    pharmacy_session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_admin_customers(core_session, pharmacy_session)


@router.get("/customers/{user_id}", response_model=AdminCustomerDetailResponse)
async def customer_detail(
    user_id: uuid.UUID,
    _: SuperAdmin = Depends(get_current_super_admin),
    core_session: AsyncSession = Depends(get_session),
    pharmacy_session: AsyncSession = Depends(get_pharmacy_session),
):
    return await get_admin_customer_detail(core_session, pharmacy_session, user_id)


@router.get("/pharmacies", response_model=list[PharmacyAccountResponse])
async def pharmacies(
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_pharmacies(session)


@router.post("/pharmacies/{account_id}/activate", response_model=PharmacyAccountResponse)
async def activate_pharmacy_account(
    account_id: uuid.UUID,
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await activate_pharmacy(session, account_id)


@router.post("/pharmacies/{account_id}/status", response_model=PharmacyAccountResponse)
async def update_pharmacy_status(
    account_id: uuid.UUID,
    payload: PharmacyStatusUpdateRequest,
    admin: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await set_pharmacy_status(
        session=session,
        account_id=account_id,
        is_active=payload.is_active,
        comment=payload.comment,
        changed_by_admin_id=admin.admin_id,
    )


@router.put("/pharmacies/{account_id}", response_model=PharmacyAccountResponse)
async def update_pharmacy(
    account_id: uuid.UUID,
    payload: PharmacyAdminUpdateRequest,
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await update_pharmacy_details(session, account_id, payload)


@router.get("/pharmacies/{account_id}/timeline", response_model=list[PharmacyStatusEventResponse])
async def pharmacy_timeline(
    account_id: uuid.UUID,
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_pharmacy_timeline(session, account_id)


@router.get(
    "/pharmacies/{account_id}/availability-events",
    response_model=list[PharmacyAvailabilityEventResponse],
)
async def pharmacy_availability_events(
    account_id: uuid.UUID,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_pharmacy_availability_events(session, account_id, date_from, date_to)


@router.get("/pharmacy/products", response_model=list[PharmacyProductReviewResponse])
async def pharmacy_products_for_review(
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_products_for_review(session)


@router.post("/pharmacy/products/{product_id}/approve", response_model=PharmacyProductReviewResponse)
async def approve_pharmacy_product(
    product_id: uuid.UUID,
    admin: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await approve_product(session, product_id, admin.admin_id)


@router.post("/pharmacy/products/{product_id}/revision", response_model=PharmacyProductReviewResponse)
async def request_pharmacy_product_revision(
    product_id: uuid.UUID,
    payload: PharmacyProductCommentRequest,
    admin: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await request_product_revision(session, product_id, admin.admin_id, payload)


@router.get("/pharmacy/orders/substitution-audit", response_model=list[CustomerPharmacyOrderResponse])
async def substitution_audit(
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_substitution_audit_orders(session)


@router.get("/pharmacy/orders", response_model=list[CustomerPharmacyOrderResponse])
async def all_pharmacy_orders(
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """All pharmacy orders across all pharmacies — newest first."""
    return await list_all_pharmacy_orders(session)


@router.get("/pharmacy/orders/{order_id}", response_model=CustomerPharmacyOrderResponse)
async def pharmacy_order_detail(
    order_id: uuid.UUID,
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    order = await get_any_order_by_id(session, order_id)
    return serialize_order(order)


@router.get("/pharmacy/orders/{order_id}/media/{user_id}/{media_id}/{filename}")
async def admin_pharmacy_order_media(
    order_id: uuid.UUID,
    user_id: uuid.UUID,
    media_id: str,
    filename: str,
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Serve prescription/voice media for any order — read-only admin view."""
    await get_any_order_by_id(session, order_id)   # confirms order exists
    return FileResponse(get_customer_order_media_file_path(user_id, media_id, filename))


# ── Sector Fee & Tax Config ───────────────────────────────────────────────

@router.get("/config/sector-fees", response_model=list[SectorFeeConfigResponse])
async def list_sector_fees(
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Return the current (latest) fee config for every sector."""
    return await get_sector_fee_configs(session)


@router.get("/config/sector-fees/{sector}/history", response_model=list[SectorFeeConfigResponse])
async def sector_fee_history(
    sector: str,
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Full change log for a single sector."""
    return await get_sector_fee_history(session, sector)


@router.post("/config/sector-fees/{sector}", response_model=SectorFeeConfigResponse, status_code=201)
async def update_sector_fee(
    sector: str,
    payload: SetSectorFeeRequest,
    _: SuperAdmin = Depends(get_current_super_admin),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Set a new platform fee + GST for the given sector (append-only)."""
    return await set_sector_fee(session, sector, payload)
