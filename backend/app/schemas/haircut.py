import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field, model_validator


# ── Vendor auth ───────────────────────────────────────────────────────────

class VendorRegisterRequest(BaseModel):
    """Used internally — constructed from multipart form fields in the API layer."""
    full_name: str = Field(min_length=2, max_length=200)
    email: str | None = Field(default=None, max_length=200)
    phone: str = Field(min_length=7, max_length=20)
    owner_address: str | None = None
    # Shop fields (created together with vendor account)
    shop_name: str = Field(min_length=2, max_length=200)
    shop_address: str | None = None
    pin_code: str | None = None
    lat: float | None = None
    lng: float | None = None


class VendorRequestOtpRequest(BaseModel):
    phone: str


class VendorVerifyOtpRequest(BaseModel):
    phone: str
    otp: str = Field(min_length=6, max_length=6)


class VendorAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    account_id: uuid.UUID
    full_name: str


# ── Shop setup ────────────────────────────────────────────────────────────

class ShopSetupRequest(BaseModel):
    shop_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    total_chairs: int = Field(ge=1, le=15)
    address_line: str | None = None
    pin_code: str | None = None
    lat: float | None = None
    lng: float | None = None


class ShopResponse(BaseModel):
    shop_id: uuid.UUID
    shop_name: str
    phone: str | None
    total_chairs: int
    address_line: str | None
    pin_code: str | None = None
    lat: float | None
    lng: float | None
    shop_image_url: str | None = None
    is_active: bool
    shop_status: str = "pending"

    model_config = {"from_attributes": True}


# ── Admin ─────────────────────────────────────────────────────────────────

class AdminShopListItem(BaseModel):
    shop_id: uuid.UUID
    vendor_id: uuid.UUID
    shop_name: str
    phone: str | None
    address_line: str | None
    pin_code: str | None
    total_chairs: int
    shop_status: str
    is_active: bool
    created_at: datetime
    # joined from vendor account
    owner_name: str | None = None
    owner_phone: str | None = None
    account_status: str | None = None

    model_config = {"from_attributes": True}


class AdminShopDetail(BaseModel):
    shop_id: uuid.UUID
    vendor_id: uuid.UUID
    shop_name: str
    phone: str | None
    address_line: str | None
    pin_code: str | None
    lat: float | None
    lng: float | None
    total_chairs: int
    shop_status: str
    is_active: bool
    shop_image_url: str | None
    created_at: datetime
    updated_at: datetime
    # joined from vendor account
    owner_name: str | None = None
    owner_phone: str | None = None
    owner_address: str | None = None
    licence_url: str | None = None
    owner_id_url: str | None = None
    account_status: str | None = None

    model_config = {"from_attributes": True}


class AdminVendorListItem(BaseModel):
    account_id: uuid.UUID
    full_name: str
    phone: str
    email: str | None
    owner_address: str | None
    licence_url: str | None
    owner_id_url: str | None
    account_status: str
    created_at: datetime
    shop_name: str | None = None
    shop_id: uuid.UUID | None = None
    shop_image_url: str | None = None

    model_config = {"from_attributes": True}


class AdminSetShopStatusRequest(BaseModel):
    shop_status: str  # pending | active | suspended


class AdminVendorActionRequest(BaseModel):
    reason: str | None = None


class AdminDayBooking(BaseModel):
    booking_id: uuid.UUID
    customer_id: uuid.UUID
    start_time: time
    total_duration_minutes: int
    total_fee: float
    status: str
    services: list[str]  # service names


class AdminDayDetail(BaseModel):
    date: date
    is_closed: bool
    closure_reason: str | None
    total_bookings: int
    completed: int
    cancelled: int
    no_shows: int
    pending_confirmed: int
    bookings: list[AdminDayBooking]


class AdminBookingListItem(BaseModel):
    booking_id: uuid.UUID
    customer_id: uuid.UUID
    appointment_date: date
    start_time: time
    total_duration_minutes: int
    total_fee: float
    status: str
    services: list[str]  # service names


class AdminCreateClosureRequest(BaseModel):
    start_date: date
    end_date: date | None = None  # omit for a single day ("offline for the rest of today")
    reason: str | None = None


# ── Shop hours ────────────────────────────────────────────────────────────

class ShopHoursEntry(BaseModel):
    day_of_week: int = Field(ge=0, le=6)   # 0=Sun … 6=Sat
    is_open: bool
    opening_time: time
    closing_time: time

    @model_validator(mode="after")
    def closing_after_opening(self) -> "ShopHoursEntry":
        if self.is_open and self.closing_time <= self.opening_time:
            raise ValueError("Closing time must be after opening time")
        return self


class SetShopHoursRequest(BaseModel):
    hours: list[ShopHoursEntry]


class ShopHoursResponse(BaseModel):
    id: uuid.UUID
    day_of_week: int
    is_open: bool
    opening_time: time
    closing_time: time

    model_config = {"from_attributes": True}


# ── Closures (holiday mode) ───────────────────────────────────────────────

class CreateClosureRequest(BaseModel):
    closure_date: date
    reason: str | None = None


class ClosureResponse(BaseModel):
    closure_id: uuid.UUID
    closure_date: date
    reason: str | None

    model_config = {"from_attributes": True}


class HolidayModeWarning(BaseModel):
    closure_date: date
    existing_booking_count: int
    booking_ids: list[uuid.UUID]


# ── Services ──────────────────────────────────────────────────────────────

class CreateServiceRequest(BaseModel):
    service_name: str = Field(min_length=1, max_length=200)
    fee: float = Field(ge=0)
    duration_minutes: int = Field(ge=5, le=480)
    display_order: int = 0


class UpdateServiceRequest(BaseModel):
    service_name: str | None = Field(default=None, max_length=200)
    fee: float | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, ge=5, le=480)
    display_order: int | None = None


class ServiceResponse(BaseModel):
    service_id: uuid.UUID
    service_name: str
    fee: float
    duration_minutes: int
    is_enabled: bool
    display_order: int

    model_config = {"from_attributes": True}


# ── Booking ───────────────────────────────────────────────────────────────

class BookingServiceItem(BaseModel):
    service_id: uuid.UUID


class CreateBookingRequest(BaseModel):
    shop_id: uuid.UUID
    appointment_date: date
    start_time: time
    # Booking reserves a chair/slot — services are informational only, selecting
    # them is optional and does not change the booking fee (paid at the shop).
    service_ids: list[uuid.UUID] = Field(default_factory=list)


class BookingServiceSnapshot(BaseModel):
    service_id: uuid.UUID
    service_name: str
    fee: float
    duration_minutes: int

    model_config = {"from_attributes": True}


class BookingResponse(BaseModel):
    booking_id: uuid.UUID
    shop_id: uuid.UUID
    shop_name: str | None = None
    shop_lat: float | None = None
    shop_lng: float | None = None
    customer_id: uuid.UUID
    appointment_date: date
    start_time: time
    total_duration_minutes: int
    total_fee: float
    status: str
    otp_code: str
    services: list[BookingServiceSnapshot] = []
    manual_checkin_requested_at: datetime | None = None
    reschedule_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class BookingHistoryItem(BookingResponse):
    has_review: bool = False


class CancelBookingRequest(BaseModel):
    reason: str | None = None


class OtpCheckinRequest(BaseModel):
    otp_code: str = Field(min_length=6, max_length=6)


# ── Manual check-in ───────────────────────────────────────────────────────

class ManualCheckinRequest(BaseModel):
    customer_lat: float
    customer_lng: float


# ── Availability ──────────────────────────────────────────────────────────

class TimeSlot(BaseModel):
    start_time: time
    is_available: bool


class ShopAvailabilityResponse(BaseModel):
    shop_id: uuid.UUID
    date: date
    is_open: bool
    is_closed_for_holiday: bool
    slots: list[TimeSlot]


# ── Customer token ────────────────────────────────────────────────────────

class TokenBalanceResponse(BaseModel):
    customer_id: uuid.UUID
    balance: int


# ── Shop discovery ────────────────────────────────────────────────────────

class NearbyShopResponse(BaseModel):
    shop_id: uuid.UUID
    shop_name: str
    address_line: str | None
    lat: float | None
    lng: float | None
    distance_km: float | None = None
    total_chairs: int
    is_active: bool
    shop_image_url: str | None = None
    rating_avg: float | None = None
    rating_count: int = 0
    is_favorite: bool = False

    model_config = {"from_attributes": True}


class ShopDetailResponse(BaseModel):
    shop_id: uuid.UUID
    shop_name: str
    phone: str | None
    address_line: str | None
    pin_code: str | None
    lat: float | None
    lng: float | None
    total_chairs: int
    is_active: bool
    shop_image_url: str | None = None
    rating_avg: float | None = None
    rating_count: int = 0
    is_favorite: bool = False

    model_config = {"from_attributes": True}


# ── Reviews ───────────────────────────────────────────────────────────────

class SubmitReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class ReviewResponse(BaseModel):
    review_id: uuid.UUID
    booking_id: uuid.UUID
    shop_id: uuid.UUID
    customer_id: uuid.UUID
    rating: int
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Reschedule ────────────────────────────────────────────────────────────

class RescheduleBookingRequest(BaseModel):
    appointment_date: date
    start_time: time


# ── Favorites ─────────────────────────────────────────────────────────────

class FavoriteActionResponse(BaseModel):
    shop_id: uuid.UUID
    is_favorite: bool
