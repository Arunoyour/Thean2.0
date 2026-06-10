"""
FastAPI dependency functions for authentication and role-based access control.

Usage:

    # Any authenticated super-admin (all roles):
    admin: SuperAdmin = Depends(get_current_super_admin)

    # Require specific roles — 403 + audit log if role not permitted:
    admin: SuperAdmin = Depends(require_role("SUPER"))
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR"))
    admin: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "CHECKER"))
"""

from __future__ import annotations

import uuid
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.super_admin import SuperAdmin
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


# ── Customer auth ─────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token.")

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, JWTError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

    result = await session.execute(
        select(User).where(User.user_id == user_id).where(User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return user


# ── Super-admin auth ──────────────────────────────────────────────────────────

async def get_current_super_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> SuperAdmin:
    """Authenticate any active super-admin regardless of role."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token.")

    try:
        payload = decode_access_token(credentials.credentials)
        admin_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, JWTError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

    result = await session.execute(
        select(SuperAdmin)
        .where(SuperAdmin.admin_id == admin_id)
        .where(SuperAdmin.is_active.is_(True))
    )
    admin = result.scalar_one_or_none()
    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found.")
    return admin


# ── Role-based access control ─────────────────────────────────────────────────

def require_role(*allowed_roles: str) -> Callable:
    """
    Dependency factory that enforces role-based access.

    - Returns the authenticated SuperAdmin if their role is in allowed_roles.
    - Raises HTTP 403 and writes an ACCESS_DENIED audit log entry if not.

    Example:
        @router.post("/admin/create")
        async def create_admin(admin = Depends(require_role("SUPER"))):
            ...
    """
    async def _check(
        request: Request,
        admin: SuperAdmin = Depends(get_current_super_admin),
        session: AsyncSession = Depends(get_session),
    ) -> SuperAdmin:
        if admin.role in allowed_roles:
            return admin

        # Import here to avoid circular imports
        from app.services.audit_service import AuditAction, audit  # noqa: PLC0415

        await audit(
            session=session,
            actor=admin,
            action_type=AuditAction.ACCESS_DENIED,
            description=(
                f"{admin.role} {admin.full_name} attempted to access "
                f"{request.method} {request.url.path} — required role(s): "
                f"{', '.join(allowed_roles)}"
            ),
            request=request,
            success=False,
            http_status=403,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Required role: {' or '.join(allowed_roles)}.",
        )

    return _check
