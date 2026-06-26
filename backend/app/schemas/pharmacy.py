from uuid import UUID
from datetime import date, datetime, time

from pydantic import BaseModel, EmailStr, Field


class PharmacyRegisterRequest(BaseModel):
    """Constructed from multipart form fields in the API layer."""
    owner_name: str = Field(min_length=2, max_length=120)
    phone_number: str = Field(min_length=8, max_length=15)
    email: EmailStr | None = None
    store_name: str = Field(min_length=2, max_length=150)
    license_number: str = Field(min_length=3, max_length=80)
    gstin: str | None = Field(default=None, max_length=15, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    address_line_1: str = Field(min_length=5)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=12)
    latitude: float
    longitude: float


class PharmacyOtpRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=15)


class PharmacyOtpVerifyRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=15)
    otp: str = Field(min_length=6, max_length=6)


class PharmacyProfileResponse(BaseModel):
    profile_id: UUID
    store_name: str
    license_number: str
    gstin: str | None = None
    address_line_1: str
    city: str | None
    state: str | None
    pincode: str | None
    latitude: float | None
    longitude: float | None
    product_commission_percent: str
    prescription_commission_percent: str
    platform_fee: str
    is_listed: bool
    is_online: bool
    store_image_url: str | None = None
    owner_photo_url: str | None = None
    drug_licence_url: str | None = None
    owner_id_url: str | None = None
    photo_taken_at: datetime | None = None
    photo_lat: float | None = None
    photo_lng: float | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PharmacyAccountResponse(BaseModel):
    account_id: UUID
    owner_name: str
    phone_number: str
    email: str | None
    is_active: bool
    activation_status: str
    created_at: datetime | None = None
    activated_at: datetime | None = None
    profile: PharmacyProfileResponse


class PharmacyVendorRejectRequest(BaseModel):
    reason: str | None = None


class PharmacyOtpResponse(BaseModel):
    message: str
    expires_in_seconds: int
    development_otp: str | None = None


class PharmacyAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    pharmacy: PharmacyAccountResponse


class PharmacyStatusUpdateRequest(BaseModel):
    is_active: bool
    comment: str = Field(min_length=3, max_length=1000)


class PharmacyStatusEventResponse(BaseModel):
    event_id: UUID
    account_id: UUID
    changed_by_admin_id: UUID
    status: str
    comment: str
    created_at: datetime


class PharmacyAvailabilityEventResponse(BaseModel):
    event_id: UUID
    account_id: UUID
    actor_type: str
    actor_id: UUID | None
    is_online: bool
    comment: str | None
    created_at: datetime


class PharmacyAdminUpdateRequest(BaseModel):
    owner_name: str = Field(min_length=2, max_length=120)
    phone_number: str = Field(min_length=8, max_length=15)
    email: EmailStr | None = None
    store_name: str = Field(min_length=2, max_length=150)
    license_number: str = Field(min_length=3, max_length=80)
    address_line_1: str = Field(min_length=5)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=12)
    latitude: float | None = None
    longitude: float | None = None
    product_commission_percent: float = Field(ge=0, le=100)
    prescription_commission_percent: float = Field(ge=0, le=100)
    platform_fee: float = Field(ge=0)


class PharmacyAvailabilityUpdateRequest(BaseModel):
    is_online: bool


_DEFAULT_DISCLAIMER = (
    "All images are for representational purposes only. It is advised that you read the batch "
    "and manufacturing details, directions for use, allergen information, health and nutritional "
    "claims (wherever applicable), and other details mentioned on the label before consuming the "
    "product. For combo items, individual prices can be viewed on the page."
)


class PharmacyProductCreateRequest(BaseModel):
    product_name: str = Field(min_length=2, max_length=150)
    brand: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=80)
    unit_label: str | None = Field(default=None, max_length=60)
    about: str | None = None
    ingredients: str | None = None
    health_benefits: str | None = None
    other_info: str | None = None
    disclaimer: str | None = Field(default=_DEFAULT_DISCLAIMER)
    pack_of: int | None = Field(default=None, ge=1)
    net_weight: str | None = Field(default=None, max_length=60)
    calorie_count: str | None = Field(default=None, max_length=60)
    dietary_preference: str | None = Field(default=None, max_length=20)
    country_of_origin: str | None = Field(default="India", max_length=100)
    shelf_life: str | None = Field(default=None, max_length=100)
    price: float = Field(gt=0)
    offer_price: float | None = Field(default=None, gt=0)
    image_data_urls: list[str] = Field(min_length=2, max_length=6)
    stock_quantity: int = Field(ge=0)
    is_available: bool = True


class PharmacyProductUpdateRequest(BaseModel):
    product_name: str = Field(min_length=2, max_length=150)
    brand: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=80)
    unit_label: str | None = Field(default=None, max_length=60)
    about: str | None = None
    ingredients: str | None = None
    health_benefits: str | None = None
    other_info: str | None = None
    disclaimer: str | None = Field(default=_DEFAULT_DISCLAIMER)
    pack_of: int | None = Field(default=None, ge=1)
    net_weight: str | None = Field(default=None, max_length=60)
    calorie_count: str | None = Field(default=None, max_length=60)
    dietary_preference: str | None = Field(default=None, max_length=20)
    country_of_origin: str | None = Field(default="India", max_length=100)
    shelf_life: str | None = Field(default=None, max_length=100)
    price: float = Field(gt=0)
    offer_price: float | None = Field(default=None, gt=0)
    stock_quantity: int = Field(ge=0)
    is_available: bool = True


class PharmacyProductResponse(BaseModel):
    product_id: UUID
    account_id: UUID
    pharmacy_name: str | None = None
    product_name: str
    brand: str | None
    category: str | None
    unit_label: str | None
    about: str | None = None
    ingredients: str | None = None
    health_benefits: str | None = None
    other_info: str | None = None
    disclaimer: str | None = None
    pack_of: int | None = None
    net_weight: str | None = None
    calorie_count: str | None = None
    dietary_preference: str | None = None
    country_of_origin: str | None = None
    shelf_life: str | None = None
    price: str
    offer_price: str | None
    customer_price: str
    discount_amount: str | None
    discount_percent: str | None
    image_urls: list[str]
    stock_quantity: int
    is_available: bool
    approval_status: str
    created_at: datetime


class PharmacyProductCommentRequest(BaseModel):
    comment: str = Field(min_length=1, max_length=1000)


class PharmacyProductCommentResponse(BaseModel):
    comment_id: UUID
    product_id: UUID
    account_id: UUID
    actor_type: str
    actor_id: UUID
    action: str
    comment: str
    created_at: datetime


class PharmacyProductReviewResponse(PharmacyProductResponse):
    product_commission_percent: str
    platform_fee: str
    platform_commission_amount: str
    platform_fee_amount: str
    platform_earning_amount: str
    pharmacy_payable_amount: str
    comments: list[PharmacyProductCommentResponse]


class NearbyPharmacyResponse(BaseModel):
    account_id: UUID
    store_name: str
    address_line_1: str
    city: str | None
    pincode: str | None
    latitude: float
    longitude: float
    is_online: bool
    distance_km: float
    response_time_minutes: float
    fill_rate_percent: float
    rating: float
    recommendation_score: float


class PharmacyStatusResponse(BaseModel):
    account_id: UUID
    store_name: str
    is_online: bool


class OperatingHoursItem(BaseModel):
    day_of_week: int = Field(ge=0, le=6, description="0=Monday .. 6=Sunday")
    open_time: time
    close_time: time
    is_closed: bool = False


class OperatingHoursResponse(OperatingHoursItem):
    hours_id: UUID
    account_id: UUID


class SetOperatingHoursRequest(BaseModel):
    days: list[OperatingHoursItem]


class HolidayCreateRequest(BaseModel):
    holiday_date: date
    reason: str | None = None


class HolidayResponse(BaseModel):
    holiday_id: UUID
    account_id: UUID
    holiday_date: date
    reason: str | None


class PharmacyScheduleStatusResponse(BaseModel):
    account_id: UUID
    has_schedule: bool
    is_online: bool
    mode: str  # "AUTO" | "MANUAL_OVERRIDE" | "NO_SCHEDULE" | "HOLIDAY"
    message: str | None = None
