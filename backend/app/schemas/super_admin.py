from uuid import UUID

from pydantic import BaseModel, Field


class SuperAdminOtpRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=15)


class SuperAdminOtpVerifyRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=15)
    otp: str = Field(min_length=6, max_length=6)


class SuperAdminResponse(BaseModel):
    admin_id: UUID
    full_name: str
    email: str
    phone_number: str


class SuperAdminOtpResponse(BaseModel):
    message: str
    expires_in_seconds: int
    development_otp: str | None = None


class SuperAdminAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: SuperAdminResponse

