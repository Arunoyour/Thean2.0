from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PharmacyOrderItem(BaseModel):
    name: str
    metric: str
    quantity: int = Field(gt=0)
    unit_price: str | None = None
    line_total: str | None = None


class CreatePharmacyOrderRequest(BaseModel):
    doctor_name: str = Field(min_length=1, max_length=150)
    patient_name: str = Field(min_length=1, max_length=150)
    items: list[PharmacyOrderItem] = Field(default_factory=list)
    pharmacy_name: str | None = None
    pharmacy_city: str | None = None
    pharmacy_pincode: str | None = None
    billing_mode: str
    inventory_protection: bool
    has_prescription: bool
    has_voice_note: bool
    substitution_allowed: bool | None = None
    partial_fulfillment_allowed: bool | None = None
    notes: dict = Field(default_factory=dict)


class CustomerOrderActionRequest(BaseModel):
    comment: str | None = Field(default=None, max_length=500)


class SubstitutionPermissionRequest(BaseModel):
    allowed: bool


class PartialFulfillmentPermissionRequest(BaseModel):
    allowed: bool


class SubmitEstimateRequest(BaseModel):
    """Pharmacy submits only the medicine/product cost.
    Delivery charge (OSRM road distance × rate/km), platform fee, and GST
    are all auto-computed by the server from current config tables.
    """
    medicine_cost: float = Field(gt=0, description="Total cost of all medicines/products in the order")
    notes: str | None = Field(default=None, max_length=500,
                               description="Optional remark visible on the customer invoice")


class SectorFeeConfigResponse(BaseModel):
    config_id: UUID
    sector: str
    platform_fee: float
    gst_percent: float
    changed_by: str
    reason: str
    effective_at: datetime

    model_config = {"from_attributes": True}


class SetSectorFeeRequest(BaseModel):
    platform_fee: float = Field(ge=0, description="Flat platform fee in ₹")
    gst_percent: float = Field(ge=0, le=100, description="GST percentage applied on full invoice")
    changed_by: str = Field(min_length=2, max_length=100)
    reason: str = Field(min_length=5, max_length=500)


class BillLineItem(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    qty: int = Field(gt=0)
    type: str = Field(min_length=1, max_length=80)
    amount: str = Field(min_length=1)
    substitute_name: str | None = None
    available: bool = True


class SubmitBillRequest(BaseModel):
    items: list[BillLineItem] = Field(min_length=1)


class CustomerPharmacyOrderResponse(BaseModel):
    order_id: UUID
    account_id: UUID | None = None
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
    prescription_files: list[dict] = Field(default_factory=list)
    voice_note_file: dict | None = None
    customer_action_comment: str | None
    assigned_at: datetime | None = None
    pharmacy_action_deadline_at: datetime | None = None
    substitution_allowed: bool | None = None
    substitution_decided_at: datetime | None = None
    partial_fulfillment_allowed: bool | None = None
    partial_fulfillment_decided_at: datetime | None = None
    split_from_order_id: UUID | None = None
    customer_review_deadline_at: datetime | None = None
    price_breakdown: dict | None = None
    bill_items: list | None = None
    pickup_code: str | None = None
    pickup_code_generated_at: datetime | None = None
    delivery_pickup_pin: str | None = None   # delivery boy's pickup PIN — shown to pharmacy when driver is assigned
    delivery_order_id: UUID | None = None    # set on COMPLETED orders — needed by customer to submit rating
    delivery_rated: bool = False             # True if customer has already submitted a rating for this delivery
    created_at: datetime


class PharmacyAssignedOrderResponse(CustomerPharmacyOrderResponse):
    sla_seconds: int = 420
