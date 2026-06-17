"""Haircut Booking API — REST endpoints."""
import aiofiles
import os
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.db.session import get_haircut_session, get_session
from app.models.super_admin import SuperAdmin
from app.services.audit_service import AuditAction, audit
from app.schemas.haircut import (
    AdminBookingListItem,
    AdminCreateClosureRequest,
    AdminDayDetail,
    AdminSetShopStatusRequest,
    AdminShopDetail,
    AdminShopListItem,
    AdminVendorActionRequest,
    AdminVendorListItem,
    BookingHistoryItem,
    BookingResponse,
    CancelBookingRequest,
    ClosureResponse,
    CreateBookingRequest,
    CreateClosureRequest,
    CreateServiceRequest,
    FavoriteActionResponse,
    HolidayModeWarning,
    ManualCheckinRequest,
    NearbyShopResponse,
    OtpCheckinRequest,
    RescheduleBookingRequest,
    ReviewResponse,
    ServiceResponse,
    SetShopHoursRequest,
    ShopAvailabilityResponse,
    ShopDetailResponse,
    ShopHoursResponse,
    ShopResponse,
    ShopSetupRequest,
    SubmitReviewRequest,
    TokenBalanceResponse,
    UpdateServiceRequest,
    VendorAuthResponse,
    VendorRegisterRequest,
    VendorRequestOtpRequest,
    VendorVerifyOtpRequest,
)
from app.services import haircut_service as svc
from app.core.config import get_settings
from app.core.security import create_access_token, decode_access_token

router = APIRouter(prefix="/haircut", tags=["haircut"])
settings = get_settings()


# ── Auth helpers ──────────────────────────────────────────────────────────

def _vendor_id_from_token(x_vendor_token: str = Header(...)) -> UUID:
    payload = decode_access_token(x_vendor_token)
    if not payload or payload.get("role") != "haircut_vendor":
        raise HTTPException(status_code=401, detail="Invalid or expired vendor token.")
    return UUID(payload["sub"])


def _customer_id_from_token(x_customer_token: str = Header(...)) -> UUID:
    payload = decode_access_token(x_customer_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired customer token.")
    return UUID(payload["sub"])


def _optional_customer_id_from_token(x_customer_token: str | None = Header(default=None)) -> UUID | None:
    if not x_customer_token:
        return None
    payload = decode_access_token(x_customer_token)
    if not payload:
        return None
    return UUID(payload["sub"])


# ── Vendor auth ───────────────────────────────────────────────────────────

_FILE_SIZE_LIMIT = 5 * 1024 * 1024  # 5 MB per file


async def _save_upload(file: UploadFile, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    if len(content) > _FILE_SIZE_LIMIT:
        raise HTTPException(status_code=422, detail=f"{file.filename} exceeds the 5 MB limit.")
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)
    relative = dest.relative_to(settings.media_root)
    return f"{settings.media_url}/{relative.as_posix()}"


@router.post("/vendor/register", status_code=201)
async def vendor_register(
    full_name:     str          = Form(...),
    phone:         str          = Form(...),
    email:         str | None   = Form(None),
    owner_address: str | None   = Form(None),
    shop_name:     str          = Form(...),
    shop_address:  str | None   = Form(None),
    pin_code:      str | None   = Form(None),
    lat:           float | None = Form(None),
    lng:           float | None = Form(None),
    shop_image:    UploadFile   = File(...),
    shop_licence:  UploadFile   = File(...),
    owner_id_doc:  UploadFile   = File(...),
    session: AsyncSession = Depends(get_haircut_session),
):
    """Register a new vendor with shop and document uploads. Account starts as pending."""
    import uuid as _uuid
    tmp_id = str(_uuid.uuid4())  # temporary dir until we know the real account_id
    base = Path(settings.media_root) / "haircut" / "tmp" / tmp_id

    ext_img = Path(shop_image.filename).suffix or ".jpg"
    ext_lic = Path(shop_licence.filename).suffix or ".pdf"
    ext_oid = Path(owner_id_doc.filename).suffix or ".jpg"

    img_path = await _save_upload(shop_image, base / f"shop_image{ext_img}")
    lic_path = await _save_upload(shop_licence, base / f"licence{ext_lic}")
    oid_path = await _save_upload(owner_id_doc, base / f"owner_id{ext_oid}")

    payload = VendorRegisterRequest(
        full_name=full_name, phone=phone, email=email,
        owner_address=owner_address,
        shop_name=shop_name, shop_address=shop_address,
        pin_code=pin_code, lat=lat, lng=lng,
    )
    return await svc.vendor_register(session, payload, img_path, lic_path, oid_path)


@router.post("/vendor/request-otp")
async def vendor_request_otp(
    payload: VendorRequestOtpRequest,
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.vendor_request_otp(session, payload.phone)


@router.post("/vendor/verify-otp", response_model=VendorAuthResponse)
async def vendor_verify_otp(
    payload: VendorVerifyOtpRequest,
    session: AsyncSession = Depends(get_haircut_session),
):
    account = await svc.vendor_verify_otp(session, payload.phone, payload.otp)
    token = create_access_token(str(account.account_id), {"role": "haircut_vendor"})
    return VendorAuthResponse(
        access_token=token,
        account_id=account.account_id,
        full_name=account.full_name,
    )


# ── Shop setup ────────────────────────────────────────────────────────────

@router.post("/vendor/shop", response_model=ShopResponse, status_code=201)
async def create_shop(
    payload: ShopSetupRequest,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.setup_shop(session, vendor_id, payload)
    return ShopResponse.model_validate(shop)


@router.patch("/vendor/shop", response_model=ShopResponse)
async def update_shop(
    payload: ShopSetupRequest,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.update_shop(session, vendor_id, payload)
    return ShopResponse.model_validate(shop)


@router.get("/vendor/shop", response_model=ShopResponse)
async def get_my_shop(
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    return ShopResponse.model_validate(shop)


# ── Shop hours ────────────────────────────────────────────────────────────

@router.put("/vendor/shop/hours", response_model=list[ShopHoursResponse])
async def set_shop_hours(
    payload: SetShopHoursRequest,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    rows = await svc.set_shop_hours(session, shop.shop_id, payload)
    return [ShopHoursResponse.model_validate(r) for r in rows]


@router.get("/vendor/shop/hours", response_model=list[ShopHoursResponse])
async def get_shop_hours(
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    rows = await svc.get_shop_hours(session, shop.shop_id)
    return [ShopHoursResponse.model_validate(r) for r in rows]


# ── Holiday / closures ────────────────────────────────────────────────────

@router.get("/vendor/shop/closure/warning", response_model=HolidayModeWarning)
async def get_holiday_warning(
    closure_date: date = Query(...),
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    return await svc.check_holiday_warning(session, shop.shop_id, closure_date)


@router.post("/vendor/shop/closure", response_model=ClosureResponse, status_code=201)
async def create_closure(
    payload: CreateClosureRequest,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    return await svc.confirm_create_closure(session, shop.shop_id, payload)


@router.delete("/vendor/shop/closure/{closure_date}", status_code=204)
async def delete_closure(
    closure_date: date,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    await svc.delete_closure(session, shop.shop_id, closure_date)


# ── Services ──────────────────────────────────────────────────────────────

@router.post("/vendor/services", response_model=ServiceResponse, status_code=201)
async def create_service(
    payload: CreateServiceRequest,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    row = await svc.create_service(session, shop.shop_id, payload)
    return ServiceResponse.model_validate(row)


@router.get("/vendor/services", response_model=list[ServiceResponse])
async def list_services(
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    rows = await svc.list_services(session, shop.shop_id)
    return [ServiceResponse.model_validate(r) for r in rows]


@router.patch("/vendor/services/{service_id}", response_model=ServiceResponse)
async def update_service(
    service_id: UUID,
    payload: UpdateServiceRequest,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    row = await svc.update_service(session, shop.shop_id, service_id, payload)
    return ServiceResponse.model_validate(row)


@router.post("/vendor/services/{service_id}/toggle", response_model=ServiceResponse)
async def toggle_service(
    service_id: UUID,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    row = await svc.toggle_service(session, shop.shop_id, service_id)
    return ServiceResponse.model_validate(row)


@router.delete("/vendor/services/{service_id}", status_code=204)
async def delete_service(
    service_id: UUID,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    shop = await svc.get_vendor_shop(session, vendor_id)
    await svc.delete_service(session, shop.shop_id, service_id)


# ── Public: shop availability & services ─────────────────────────────────

@router.get("/shops/{shop_id}/availability", response_model=ShopAvailabilityResponse)
async def shop_availability(
    shop_id: UUID,
    target_date: date = Query(...),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.get_shop_availability(session, shop_id, target_date)


@router.get("/shops/{shop_id}/services", response_model=list[ServiceResponse])
async def shop_services(
    shop_id: UUID,
    session: AsyncSession = Depends(get_haircut_session),
):
    rows = await svc.list_services(session, shop_id)
    return [ServiceResponse.model_validate(r) for r in rows if r.is_enabled]


@router.get("/shops/{shop_id}/hours", response_model=list[ShopHoursResponse])
async def shop_hours_public(
    shop_id: UUID,
    session: AsyncSession = Depends(get_haircut_session),
):
    rows = await svc.get_shop_hours(session, shop_id)
    return [ShopHoursResponse.model_validate(r) for r in rows]


@router.get("/shops/{shop_id}/closures", response_model=list[ClosureResponse])
async def shop_closures_public(
    shop_id: UUID,
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.list_upcoming_closures(session, shop_id)


# ── Discovery ─────────────────────────────────────────────────────────────

@router.get("/shops/nearby", response_model=list[NearbyShopResponse])
async def nearby_shops(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(default=10.0, ge=0.1, le=100.0),
    customer_id: UUID | None = Depends(_optional_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.find_nearby_shops(session, lat, lng, radius_km, customer_id)


@router.get("/shops/search", response_model=list[NearbyShopResponse])
async def search_shops(
    q: str = Query(..., min_length=1),
    customer_id: UUID | None = Depends(_optional_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.search_shops(session, q, customer_id)


@router.get("/shops/{shop_id}", response_model=ShopDetailResponse)
async def shop_detail(
    shop_id: UUID,
    customer_id: UUID | None = Depends(_optional_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.get_shop_detail(session, shop_id, customer_id)


@router.get("/shops/{shop_id}/reviews", response_model=list[ReviewResponse])
async def shop_reviews(
    shop_id: UUID,
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.list_shop_reviews(session, shop_id)


# ── Customer: favorites ───────────────────────────────────────────────────

@router.get("/favorites", response_model=list[NearbyShopResponse])
async def list_favorites(
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.list_favorite_shops(session, customer_id)


@router.post("/favorites/{shop_id}", response_model=FavoriteActionResponse)
async def add_favorite(
    shop_id: UUID,
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.add_favorite(session, customer_id, shop_id)


@router.delete("/favorites/{shop_id}", response_model=FavoriteActionResponse)
async def remove_favorite(
    shop_id: UUID,
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.remove_favorite(session, customer_id, shop_id)


# ── Customer: bookings ────────────────────────────────────────────────────

@router.post("/bookings", response_model=BookingResponse, status_code=201)
async def create_booking(
    payload: CreateBookingRequest,
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.create_booking(session, customer_id, payload)


@router.get("/bookings/active", response_model=BookingResponse | None)
async def active_booking(
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.get_active_booking(session, customer_id)


@router.get("/bookings/history", response_model=list[BookingHistoryItem])
async def booking_history(
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.list_booking_history(session, customer_id)


@router.post("/bookings/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    booking_id: UUID,
    payload: CancelBookingRequest,
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.cancel_booking(session, customer_id, booking_id, payload.reason)


@router.post("/bookings/{booking_id}/manual-checkin", response_model=BookingResponse)
async def request_manual_checkin(
    booking_id: UUID,
    payload: ManualCheckinRequest,
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.request_manual_checkin(session, customer_id, booking_id, payload)


@router.post("/bookings/{booking_id}/reschedule", response_model=BookingResponse)
async def reschedule_booking(
    booking_id: UUID,
    payload: RescheduleBookingRequest,
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.reschedule_booking(session, customer_id, booking_id, payload)


@router.post("/bookings/{booking_id}/review", response_model=ReviewResponse, status_code=201)
async def submit_review(
    booking_id: UUID,
    payload: SubmitReviewRequest,
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.submit_review(session, customer_id, booking_id, payload)


# ── Customer: tokens ──────────────────────────────────────────────────────

@router.get("/tokens/balance", response_model=TokenBalanceResponse)
async def token_balance(
    customer_id: UUID = Depends(_customer_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.get_token_balance(session, customer_id)


# ── Vendor: appointments & check-in ──────────────────────────────────────

@router.get("/vendor/appointments/today", response_model=list[BookingResponse])
async def today_appointments(
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.get_today_appointments(session, vendor_id)


@router.post("/vendor/bookings/{booking_id}/otp-checkin", response_model=BookingResponse)
async def otp_checkin(
    booking_id: UUID,
    payload: OtpCheckinRequest,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.vendor_otp_checkin(session, vendor_id, booking_id, payload.otp_code)


@router.post("/vendor/bookings/{booking_id}/approve-checkin", response_model=BookingResponse)
async def approve_manual_checkin(
    booking_id: UUID,
    vendor_id: UUID = Depends(_vendor_id_from_token),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.vendor_approve_manual_checkin(session, vendor_id, booking_id)


# ── Admin ─────────────────────────────────────────────────────────────────
# Authenticated with the same per-admin JWT + role check used everywhere else
# in the super-admin app (SUPER/SUPERVISOR), instead of the old static shared
# secret — so actions are attributable to a specific admin and get audit-logged.

@router.get("/admin/shops", response_model=list[AdminShopListItem])
async def admin_list_shops(
    status: str | None = Query(default=None),
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.admin_list_shops(session, status_filter=status)


@router.get("/admin/shops/{shop_id}", response_model=AdminShopDetail)
async def admin_get_shop(
    shop_id: UUID,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.admin_get_shop(session, shop_id)


@router.get("/admin/shops/{shop_id}/services", response_model=list[ServiceResponse])
async def admin_shop_services(
    shop_id: UUID,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
):
    rows = await svc.list_services(session, shop_id)
    return [ServiceResponse.model_validate(r) for r in rows]


@router.get("/admin/shops/{shop_id}/bookings", response_model=list[AdminBookingListItem])
async def admin_shop_bookings(
    shop_id: UUID,
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    status: str | None = Query(default=None),
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
):
    today = datetime.now().date()
    return await svc.admin_list_bookings(
        session, shop_id,
        start_date=start_date or today,
        end_date=end_date or today,
        status_filter=status,
    )


@router.post("/admin/shops/{shop_id}/status", response_model=AdminShopDetail)
async def admin_set_shop_status(
    shop_id: UUID,
    payload: AdminSetShopStatusRequest,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
    main_session: AsyncSession = Depends(get_session),
):
    result = await svc.admin_set_shop_status(session, shop_id, payload.shop_status)
    await audit(main_session, actor=admin, action_type=AuditAction.UPDATE_HAIRCUT_SHOP,
                description=f"{admin.role} {admin.full_name} set shop {shop_id} status to {payload.shop_status}.",
                target_type="haircut_shop", target_id=shop_id)
    await main_session.commit()
    return result


@router.get("/admin/shops/{shop_id}/day", response_model=AdminDayDetail)
async def admin_get_day_detail(
    shop_id: UUID,
    date: date = Query(...),
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.admin_get_day_detail(session, shop_id, date)


@router.get("/admin/shops/{shop_id}/closures", response_model=list[ClosureResponse])
async def admin_get_closures(
    shop_id: UUID,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.admin_get_shop_closures(session, shop_id)


@router.post("/admin/shops/{shop_id}/closures", response_model=list[ClosureResponse], status_code=201)
async def admin_create_closure(
    shop_id: UUID,
    payload: AdminCreateClosureRequest,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
    main_session: AsyncSession = Depends(get_session),
):
    """Take a shop offline for the rest of today or a date range — marked
    'Shop off' on the calendar, same as the vendor's own holiday mode."""
    result = await svc.admin_create_closure_range(session, shop_id, payload)
    end_label = payload.end_date or payload.start_date
    await audit(main_session, actor=admin, action_type=AuditAction.CREATE_HAIRCUT_CLOSURE,
                description=f"{admin.role} {admin.full_name} marked shop {shop_id} offline {payload.start_date}–{end_label}"
                            f"{f' ({payload.reason})' if payload.reason else ''}.",
                target_type="haircut_shop", target_id=shop_id)
    await main_session.commit()
    return result


@router.delete("/admin/shops/{shop_id}/closures/{closure_date}", status_code=204)
async def admin_delete_closure(
    shop_id: UUID,
    closure_date: date,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
    main_session: AsyncSession = Depends(get_session),
):
    await svc.delete_closure(session, shop_id, closure_date)
    await audit(main_session, actor=admin, action_type=AuditAction.UPDATE_HAIRCUT_SHOP,
                description=f"{admin.role} {admin.full_name} removed offline marking for shop {shop_id} on {closure_date}.",
                target_type="haircut_shop", target_id=shop_id)
    await main_session.commit()


@router.get("/admin/vendors", response_model=list[AdminVendorListItem])
async def admin_list_vendors(
    status: str | None = Query(default=None),
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
):
    return await svc.admin_list_vendors(session, status_filter=status)


@router.post("/admin/vendors/{vendor_id}/approve", response_model=AdminVendorListItem)
async def admin_approve_vendor(
    vendor_id: UUID,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
    main_session: AsyncSession = Depends(get_session),
):
    result = await svc.admin_approve_vendor(session, vendor_id)
    await audit(main_session, actor=admin, action_type=AuditAction.APPROVE_HAIRCUT_VENDOR,
                description=f"{admin.role} {admin.full_name} approved haircut vendor {vendor_id}.",
                target_type="haircut_vendor", target_id=vendor_id)
    await main_session.commit()
    return result


@router.post("/admin/vendors/{vendor_id}/reject", response_model=AdminVendorListItem)
async def admin_reject_vendor(
    vendor_id: UUID,
    payload: AdminVendorActionRequest,
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
    session: AsyncSession = Depends(get_haircut_session),
    main_session: AsyncSession = Depends(get_session),
):
    result = await svc.admin_reject_vendor(session, vendor_id, payload.reason)
    await audit(main_session, actor=admin, action_type=AuditAction.REJECT_HAIRCUT_VENDOR,
                description=f"{admin.role} {admin.full_name} rejected haircut vendor {vendor_id}"
                            f"{f' ({payload.reason})' if payload.reason else ''}.",
                target_type="haircut_vendor", target_id=vendor_id)
    await main_session.commit()
    return result


# ── Cron: no-show sweep ───────────────────────────────────────────────────

@router.post("/cron/no-show-sweep")
async def no_show_sweep(
    x_cron_secret: str = Header(...),
    session: AsyncSession = Depends(get_haircut_session),
):
    if x_cron_secret != settings.super_admin_token:
        raise HTTPException(status_code=403, detail="Forbidden.")
    count = await svc.mark_no_shows(session)
    return {"marked_no_show": count}
