from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    OtpRequest,
    OtpRequestResponse,
    OtpVerifyRequest,
    RegisterRequest,
    UserResponse,
)
from app.services.auth_service import register_user, request_otp, verify_otp
from app.services.auth_service import serialize_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, session: AsyncSession = Depends(get_session)):
    return await register_user(session, payload)


@router.post("/request-otp", response_model=OtpRequestResponse)
async def request_login_otp(payload: OtpRequest, session: AsyncSession = Depends(get_session)):
    return await request_otp(session, payload.phone_number)


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_login_otp(payload: OtpVerifyRequest, session: AsyncSession = Depends(get_session)):
    return await verify_otp(session, payload.phone_number, payload.otp)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return serialize_user(current_user)
