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
    role: str        # SUPER | SUPERVISOR | CHECKER | AUDITOR | TEAM_LEAD
    is_active: bool


class SuperAdminOtpResponse(BaseModel):
    message: str
    expires_in_seconds: int
    development_otp: str | None = None


class SuperAdminAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: SuperAdminResponse


# ── Admin management ──────────────────────────────────────────────────────────

class CreateAdminRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=120)
    phone_number: str = Field(min_length=8, max_length=15)
    role: str = Field(pattern="^(SUPERVISOR|CHECKER|AUDITOR|TEAM_LEAD)$")


class UpdateAdminRoleRequest(BaseModel):
    role: str = Field(pattern="^(SUPERVISOR|CHECKER|AUDITOR|TEAM_LEAD)$")


class DeactivateAdminRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=500)
