import uuid

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_pharmacy_session
from app.models.pharmacy_merchant import PharmacyAccount, PharmacyProfile
from app.services.pharmacy_service import get_account_with_profile

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_pharmacy(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_pharmacy_session),
) -> tuple[PharmacyAccount, PharmacyProfile]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token.")

    try:
        payload = decode_access_token(credentials.credentials)
        account_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, JWTError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

    account_profile = await get_account_with_profile(session, account_id)
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Pharmacy not found.")

    return account_profile


def require_super_admin(x_super_admin_token: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if x_super_admin_token != settings.super_admin_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required.")

