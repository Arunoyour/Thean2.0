from uuid import UUID

from pydantic import BaseModel, Field


class CustomerAddressCreateRequest(BaseModel):
    label: str = Field(min_length=2, max_length=50)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address_line_1: str = Field(min_length=5, max_length=500)
    apartment_floor_gate: str | None = Field(default=None, max_length=100)
    landmark: str = Field(min_length=2, max_length=300)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str = Field(min_length=6, max_length=12)
    secondary_phone_number: str | None = Field(default=None, min_length=8, max_length=15)
    location_capture_method: str = Field(pattern="^(CURRENT_LOCATION|MAP_PIN)$")
    is_default: bool = False


class CustomerAddressResponse(BaseModel):
    address_id: UUID
    label: str
    latitude: float
    longitude: float
    address_line_1: str
    apartment_floor_gate: str | None
    landmark: str
    city: str | None
    state: str | None
    pincode: str
    secondary_phone_number: str | None
    location_capture_method: str
    is_default: bool
