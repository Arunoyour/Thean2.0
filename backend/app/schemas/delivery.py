import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Rate Config ───────────────────────────────────────────────────────────

class RateConfigResponse(BaseModel):
    config_id: uuid.UUID
    rate_per_km: float
    changed_by: str
    reason: str
    effective_at: datetime

    model_config = {"from_attributes": True}


class SetRateRequest(BaseModel):
    rate_per_km: float = Field(gt=0, description="New rate in ₹ per km")
    changed_by: str = Field(min_length=2, max_length=100, description="Admin / person making the change")
    reason: str = Field(min_length=5, max_length=500, description="Reason for the change")


# ── Auth ──────────────────────────────────────────────────────────────────

class DeliveryRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone_number: str = Field(min_length=7, max_length=20)
    email: str | None = None
    vehicle_type: str  # bike | car | cycle
    vehicle_number: str | None = None
    # Fraud-prevention unique identifiers
    license_number: str | None = Field(default=None, max_length=50)
    id_number: str | None = Field(default=None, max_length=50)


class DeliveryOtpRequest(BaseModel):
    phone_number: str


class DeliveryOtpVerifyRequest(BaseModel):
    phone_number: str
    otp: str


class DeliveryAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    account: "DeliveryAccountResponse"


# ── Account ───────────────────────────────────────────────────────────────

class DeliveryAccountResponse(BaseModel):
    account_id: uuid.UUID
    full_name: str
    phone_number: str
    email: str | None
    vehicle_type: str
    vehicle_number: str | None
    license_number: str | None
    id_number: str | None
    account_status: str
    is_online: bool
    current_lat: float | None
    current_lng: float | None
    # COD
    cod_balance: float
    cod_blocked: bool
    # Performance
    total_assigned: int = 0
    total_accepted: int = 0
    total_cancelled: int = 0
    avg_rating: float = 5.0
    rating_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class DeliveryAvailabilityRequest(BaseModel):
    is_online: bool

class DeliveryLocationRequest(BaseModel):
    lat: float
    lng: float


# ── Documents ─────────────────────────────────────────────────────────────

class DeliveryDocumentResponse(BaseModel):
    document_id: uuid.UUID
    doc_type: str
    filename: str
    original_name: str | None
    content_type: str | None
    uploaded_at: datetime

    model_config = {"from_attributes": True}


# ── Delivery Orders ───────────────────────────────────────────────────────

class DeliveryOrderResponse(BaseModel):
    delivery_order_id: uuid.UUID
    source_order_id: uuid.UUID
    sector: str
    account_id: uuid.UUID
    status: str
    distance_km: float | None
    earnings_amount: float | None
    rate_per_km: float
    cod_amount: float | None
    pickup_pin: str | None
    delivery_pin: str | None
    accept_deadline_at: datetime | None
    accepted_at: datetime | None
    arrived_at_store_at: datetime | None
    picked_up_at: datetime | None
    arrived_at_customer_at: datetime | None
    delivered_at: datetime | None
    rejected_at: datetime | None
    pickup_lat: float | None
    pickup_lng: float | None
    dropoff_lat: float | None
    dropoff_lng: float | None
    created_at: datetime

    # Enriched from source sector order (generic names)
    source_name: str | None = None
    source_address: str | None = None
    customer_name: str | None = None
    customer_address: str | None = None
    customer_id: uuid.UUID | None = None
    customer_phone: str | None = None   # shown to delivery boy after ORDER_PICKED_UP

    model_config = {"from_attributes": True}


# ── Delivery Tracking (customer polls this) ───────────────────────────────

class DeliveryTrackingResponse(BaseModel):
    """
    Lightweight snapshot the customer app polls to show live driver location,
    trigger the call button once the driver is within 150 m, and show the
    Delivery PIN once the order is OUT_FOR_DELIVERY.
    """
    delivery_order_id: uuid.UUID
    status: str                  # current delivery status
    driver_lat: float | None     # current driver latitude
    driver_lng: float | None     # current driver longitude
    driver_phone: str | None     # shown on customer app once pickup is done
    driver_name: str | None      # shown on customer app
    distance_km: float | None    # total delivery route distance
    delivery_pin: str | None     # shown to customer once status is OUT_FOR_DELIVERY — share with driver
    road_km_to_customer: float | None = None   # live OSRM road km from driver to customer
    eta_minutes: int | None = None             # live ETA in minutes (road_km / avg 30 km/h)


class DeliveryStatusUpdateRequest(BaseModel):
    pin: str | None = None  # required for ORDER_PICKED_UP and DELIVERED


class DeliveryAssignRequest(BaseModel):
    """Admin assigns a source sector order to a delivery boy."""
    source_order_id: uuid.UUID
    sector: str = "pharmacy"  # pharmacy | food | fish | grocery | other
    account_id: uuid.UUID
    distance_km: float
    cod_amount: float = 0.0   # 0 = prepaid, >0 = cash to collect
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    dropoff_lat: float | None = None
    dropoff_lng: float | None = None


# ── COD ───────────────────────────────────────────────────────────────────

class CodCollectionResponse(BaseModel):
    collection_id: uuid.UUID
    delivery_order_id: uuid.UUID
    amount: float
    collected_at: datetime

    model_config = {"from_attributes": True}


class CodPayoutResponse(BaseModel):
    payout_id: uuid.UUID
    account_id: uuid.UUID
    amount: float
    cleared_by: str | None
    note: str | None
    payout_at: datetime

    model_config = {"from_attributes": True}


class AdminCodClearRequest(BaseModel):
    amount: float = Field(gt=0)
    cleared_by: str = Field(min_length=1, max_length=100)
    note: str | None = None


class CodSummaryResponse(BaseModel):
    cod_balance: float
    cod_blocked: bool
    warn_threshold: float = 1000.0
    block_threshold: float = 1200.0
    recent_collections: list[CodCollectionResponse]
    recent_payouts: list[CodPayoutResponse]


# ── Chat ─────────────────────────────────────────────────────────────────

class ChatMessageResponse(BaseModel):
    message_id: uuid.UUID
    delivery_order_id: uuid.UUID
    sender_type: str
    sender_id: uuid.UUID
    message_text: str
    sent_at: datetime
    read_at: datetime | None

    model_config = {"from_attributes": True}


class SendChatMessageRequest(BaseModel):
    message_text: str = Field(min_length=1, max_length=1000)


# ── Earnings ─────────────────────────────────────────────────────────────

class EarningResponse(BaseModel):
    earning_id: uuid.UUID
    delivery_order_id: uuid.UUID
    amount: float
    status: str
    earned_at: datetime

    model_config = {"from_attributes": True}


class WalletResponse(BaseModel):
    wallet_id: uuid.UUID
    account_id: uuid.UUID
    balance: float
    total_earned: float
    total_withdrawn: float
    updated_at: datetime

    model_config = {"from_attributes": True}


class CashoutRequest(BaseModel):
    amount: float = Field(gt=0)
    upi_id: str = Field(min_length=3, max_length=200)


class CashoutResponse(BaseModel):
    cashout_id: uuid.UUID
    amount: float
    status: str
    upi_id: str | None
    requested_at: datetime
    processed_at: datetime | None

    model_config = {"from_attributes": True}


class EarningsSummaryResponse(BaseModel):
    today: float
    this_week: float
    this_month: float
    total: float
    wallet: WalletResponse
    recent: list[EarningResponse]


# ── Rating ────────────────────────────────────────────────────────────────

class DeliveryRatingRequest(BaseModel):
    rating: int = Field(ge=1, le=5, description="1 = worst, 5 = best")
    comment: str | None = Field(default=None, max_length=500)


class DeliveryRatingResponse(BaseModel):
    rating_id: uuid.UUID
    delivery_order_id: uuid.UUID
    account_id: uuid.UUID
    rated_by: uuid.UUID
    rating: int
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Auto-assign scoring ───────────────────────────────────────────────────

class DriverCandidateScore(BaseModel):
    account_id: uuid.UUID
    full_name: str
    phone_number: str
    vehicle_type: str
    current_lat: float | None
    current_lng: float | None
    distance_km: float          # OSRM road distance from driver to pickup
    avg_rating: float
    vehicle_score: float        # bike=1.0, car=0.6, cycle=0.4, other=0.3
    proximity_score: float      # normalised 0–1 (weight 0.50)
    rating_score: float         # normalised 0–1 (weight 0.30)
    final_score: float          # weighted total (proximity×0.50 + rating×0.30 + vehicle×0.20)
    exclusion_reason: str | None = None   # non-None means this driver was filtered out


class AutoAssignRequest(BaseModel):
    sector: str = "pharmacy"
    source_order_id: uuid.UUID
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    cod_amount: float = 0.0
    order_value: float = 0.0    # used for future premium-order vehicle matching
    distance_km: float | None = None   # override if already known; otherwise measured to dropoff


class AutoAssignResult(BaseModel):
    assigned: bool
    delivery_order: DeliveryOrderResponse | None = None
    assigned_driver: DriverCandidateScore | None = None
    all_candidates: list[DriverCandidateScore] = []
    reason: str = ""


class UnassignedSourceOrder(BaseModel):
    """A sector order that is READY_FOR_DELIVERY with no delivery boy assigned yet."""
    sector: str
    source_order_id: uuid.UUID
    pharmacy_name: str | None = None
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    dropoff_lat: float | None = None
    dropoff_lng: float | None = None
    cod_amount: float = 0.0
    order_value: float = 0.0
    ready_since: datetime | None = None
