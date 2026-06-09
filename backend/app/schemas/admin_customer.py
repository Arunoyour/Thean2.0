from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.customer import CustomerAddressResponse
from app.schemas.customer_order import PharmacyOrderItem


class AdminCustomerSummaryResponse(BaseModel):
    user_id: UUID
    phone_number: str
    email: str | None
    full_name: str | None
    wallet_balance: str
    is_active: bool
    created_at: datetime
    default_address_label: str | None
    address_count: int
    pharmacy_order_count: int
    latest_pharmacy_order_at: datetime | None


class AdminCustomerProfileResponse(BaseModel):
    user_id: UUID
    phone_number: str
    email: str | None
    full_name: str | None
    wallet_balance: str
    is_active: bool
    created_at: datetime


class AdminPharmacyOrderResponse(BaseModel):
    order_id: UUID
    account_id: UUID | None
    status: str
    doctor_name: str | None
    patient_name: str | None
    pharmacy_name: str | None
    pharmacy_city: str | None
    pharmacy_pincode: str | None
    estimated_amount: str | None
    final_amount: str | None
    items: list[PharmacyOrderItem]
    notes: dict
    requires_manual_review: bool
    customer_action_comment: str | None
    created_at: datetime


class AdminCustomerSectorOrdersResponse(BaseModel):
    pharmacy: list[AdminPharmacyOrderResponse]
    vegetables: list[dict]
    print_shop: list[dict]


class AdminCustomerDetailResponse(BaseModel):
    customer: AdminCustomerProfileResponse
    addresses: list[CustomerAddressResponse]
    sector_orders: AdminCustomerSectorOrdersResponse
