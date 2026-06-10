import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_super_admin, require_role
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
    CreateAdminRequest,
    DeactivateAdminRequest,
    SuperAdminAuthResponse,
    SuperAdminOtpRequest,
    SuperAdminOtpResponse,
    SuperAdminOtpVerifyRequest,
    SuperAdminResponse,
    UpdateAdminRoleRequest,
)
from app.services.audit_service import AuditAction, audit
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
    create_admin,
    deactivate_admin,
    list_admins,
    request_super_admin_otp,
    serialize_super_admin,
    update_admin_role,
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


# ── Auth (public) ─────────────────────────────────────────────────────────────

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


# ── Admin management (SUPER only) ─────────────────────────────────────────────

@router.get("/admins", response_model=list[SuperAdminResponse])
async def list_all_admins(
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER")),
    session: AsyncSession = Depends(get_session),
):
    """List all admin accounts. SUPER only."""
    admins = await list_admins(session)
    await audit(
        session=session, actor=admin, action_type=AuditAction.VIEW_LEDGER,
        description=f"SUPER {admin.full_name} listed all admin accounts.",
        request=request,
    )
    return [serialize_super_admin(a) for a in admins]


@router.post("/admins", response_model=SuperAdminResponse, status_code=201)
async def create_new_admin(
    payload: CreateAdminRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER")),
    session: AsyncSession = Depends(get_session),
):
    """Create a new admin account. SUPER only."""
    new_admin = await create_admin(session, payload)
    await audit(
        session=session, actor=admin, action_type=AuditAction.CREATE_ADMIN,
        description=(
            f"SUPER {admin.full_name} created {payload.role} account "
            f"for {payload.full_name} ({payload.phone_number})."
        ),
        target_type="super_admin", target_id=new_admin.admin_id,
        request=request,
    )
    return serialize_super_admin(new_admin)


@router.patch("/admins/{target_admin_id}/role", response_model=SuperAdminResponse)
async def change_admin_role(
    target_admin_id: uuid.UUID,
    payload: UpdateAdminRoleRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER")),
    session: AsyncSession = Depends(get_session),
):
    """Change an admin's role. SUPER only."""
    updated = await update_admin_role(session, target_admin_id, payload.role)
    await audit(
        session=session, actor=admin, action_type=AuditAction.CHANGE_ROLE,
        description=(
            f"SUPER {admin.full_name} changed role of {updated.full_name} "
            f"to {payload.role}."
        ),
        target_type="super_admin", target_id=target_admin_id,
        request=request,
    )
    return serialize_super_admin(updated)


@router.delete("/admins/{target_admin_id}", status_code=204)
async def deactivate_admin_account(
    target_admin_id: uuid.UUID,
    payload: DeactivateAdminRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER")),
    session: AsyncSession = Depends(get_session),
):
    """Deactivate an admin account. SUPER only."""
    deactivated = await deactivate_admin(session, target_admin_id, admin.admin_id)
    await audit(
        session=session, actor=admin, action_type=AuditAction.DEACTIVATE_ADMIN,
        description=(
            f"SUPER {admin.full_name} deactivated {deactivated.full_name}'s account. "
            f"Reason: {payload.reason}"
        ),
        target_type="super_admin", target_id=target_admin_id,
        request=request,
    )


# ── Customers ─────────────────────────────────────────────────────────────────

@router.get("/customers", response_model=list[AdminCustomerSummaryResponse])
async def customers(
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    core_session: AsyncSession = Depends(get_session),
    pharmacy_session: AsyncSession = Depends(get_pharmacy_session),
):
    result = await list_admin_customers(core_session, pharmacy_session)
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.VIEW_CUSTOMER,
        description=f"{admin.role} {admin.full_name} viewed customer list.",
        request=request,
    )
    return result


@router.get("/customers/{user_id}", response_model=AdminCustomerDetailResponse)
async def customer_detail(
    user_id: uuid.UUID,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    core_session: AsyncSession = Depends(get_session),
    pharmacy_session: AsyncSession = Depends(get_pharmacy_session),
):
    result = await get_admin_customer_detail(core_session, pharmacy_session, user_id)
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.VIEW_CUSTOMER,
        description=f"{admin.role} {admin.full_name} viewed customer detail (user_id={user_id}).",
        target_type="user", target_id=user_id,
        request=request,
    )
    return result


# ── Pharmacies ────────────────────────────────────────────────────────────────

@router.get("/pharmacies", response_model=list[PharmacyAccountResponse])
async def pharmacies(
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_pharmacies(session)


@router.post("/pharmacies/{account_id}/activate", response_model=PharmacyAccountResponse)
async def activate_pharmacy_account(
    account_id: uuid.UUID,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_pharmacy_session),
    core_session: AsyncSession = Depends(get_session),
):
    result = await activate_pharmacy(session, account_id)
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.ACTIVATE_PHARMACY,
        description=f"{admin.role} {admin.full_name} activated pharmacy (account_id={account_id}).",
        target_type="pharmacy_account", target_id=account_id,
        request=request,
    )
    return result


@router.post("/pharmacies/{account_id}/status", response_model=PharmacyAccountResponse)
async def update_pharmacy_status(
    account_id: uuid.UUID,
    payload: PharmacyStatusUpdateRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_pharmacy_session),
    core_session: AsyncSession = Depends(get_session),
):
    result = await set_pharmacy_status(
        session=session,
        account_id=account_id,
        is_active=payload.is_active,
        comment=payload.comment,
        changed_by_admin_id=admin.admin_id,
    )
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.UPDATE_PHARMACY,
        description=(
            f"{admin.role} {admin.full_name} set pharmacy {account_id} "
            f"is_active={payload.is_active}. Comment: {payload.comment}"
        ),
        target_type="pharmacy_account", target_id=account_id,
        request=request,
    )
    return result


@router.put("/pharmacies/{account_id}", response_model=PharmacyAccountResponse)
async def update_pharmacy(
    account_id: uuid.UUID,
    payload: PharmacyAdminUpdateRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_pharmacy_session),
    core_session: AsyncSession = Depends(get_session),
):
    result = await update_pharmacy_details(session, account_id, payload)
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.UPDATE_PHARMACY,
        description=f"{admin.role} {admin.full_name} updated pharmacy details (account_id={account_id}).",
        target_type="pharmacy_account", target_id=account_id,
        request=request,
    )
    return result


@router.get("/pharmacies/{account_id}/timeline", response_model=list[PharmacyStatusEventResponse])
async def pharmacy_timeline(
    account_id: uuid.UUID,
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
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
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_pharmacy_availability_events(session, account_id, date_from, date_to)


# ── Pharmacy products ─────────────────────────────────────────────────────────

@router.get("/pharmacy/products", response_model=list[PharmacyProductReviewResponse])
async def pharmacy_products_for_review(
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_products_for_review(session)


@router.post("/pharmacy/products/{product_id}/approve", response_model=PharmacyProductReviewResponse)
async def approve_pharmacy_product(
    product_id: uuid.UUID,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_pharmacy_session),
    core_session: AsyncSession = Depends(get_session),
):
    result = await approve_product(session, product_id, admin.admin_id)
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.APPROVE_PRODUCT,
        description=f"{admin.role} {admin.full_name} approved pharmacy product (product_id={product_id}).",
        target_type="pharmacy_product", target_id=product_id,
        request=request,
    )
    return result


@router.post("/pharmacy/products/{product_id}/revision", response_model=PharmacyProductReviewResponse)
async def request_pharmacy_product_revision(
    product_id: uuid.UUID,
    payload: PharmacyProductCommentRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER")),
    session: AsyncSession = Depends(get_pharmacy_session),
    core_session: AsyncSession = Depends(get_session),
):
    result = await request_product_revision(session, product_id, admin.admin_id, payload)
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.REVISE_PRODUCT,
        description=(
            f"{admin.role} {admin.full_name} requested revision on product "
            f"{product_id}. Comment: {payload.comment}"
        ),
        target_type="pharmacy_product", target_id=product_id,
        request=request,
    )
    return result


# ── Orders ────────────────────────────────────────────────────────────────────

@router.get("/pharmacy/orders/substitution-audit", response_model=list[CustomerPharmacyOrderResponse])
async def substitution_audit(
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_substitution_audit_orders(session)


@router.get("/pharmacy/orders", response_model=list[CustomerPharmacyOrderResponse])
async def all_pharmacy_orders(
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_all_pharmacy_orders(session)


@router.get("/pharmacy/orders/{order_id}", response_model=CustomerPharmacyOrderResponse)
async def pharmacy_order_detail(
    order_id: uuid.UUID,
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
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
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    await get_any_order_by_id(session, order_id)
    return FileResponse(get_customer_order_media_file_path(user_id, media_id, filename))


# ── Sector fee & rate config ──────────────────────────────────────────────────

@router.get("/config/sector-fees", response_model=list[SectorFeeConfigResponse])
async def list_sector_fees(
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await get_sector_fee_configs(session)


@router.get("/config/sector-fees/{sector}/history", response_model=list[SectorFeeConfigResponse])
async def sector_fee_history(
    sector: str,
    _: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER", "AUDITOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await get_sector_fee_history(session, sector)


@router.post("/config/sector-fees/{sector}", response_model=SectorFeeConfigResponse, status_code=201)
async def update_sector_fee(
    sector: str,
    payload: SetSectorFeeRequest,
    request: Request,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_pharmacy_session),
    core_session: AsyncSession = Depends(get_session),
):
    """Change sector fee config. SUPER and SUPERVISOR only (high-risk action)."""
    result = await set_sector_fee(session, sector, payload)
    await audit(
        session=core_session, actor=admin, action_type=AuditAction.FEE_CHANGE,
        description=(
            f"{admin.role} {admin.full_name} updated sector fee for '{sector}': "
            f"platform_fee={payload.platform_fee_percent}%, gst={payload.gst_percent}%."
        ),
        request=request,
    )
    return result
