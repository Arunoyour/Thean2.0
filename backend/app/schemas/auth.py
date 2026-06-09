from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=15)
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr | None = None


class OtpRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=15)


class OtpVerifyRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=15)
    otp: str = Field(min_length=6, max_length=6)


class UserResponse(BaseModel):
    id: UUID
    phone_number: str
    email: str | None
    full_name: str | None
    wallet_balance: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class OtpRequestResponse(BaseModel):
    message: str
    expires_in_seconds: int
    development_otp: str | None = None

