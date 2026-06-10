"""
Audit log service.

Every action across the portal — successful or blocked — is recorded here.
Rows older than 1 year are deleted by the nightly maintenance cron.

Usage (inside a FastAPI endpoint or service):
    from app.services.audit_service import audit

    await audit(
        session=session,
        actor=admin,                      # SuperAdmin ORM object or None for SYSTEM
        action_type="APPROVE_REQUEST",
        description="Checker Aruna approved COD clear of ₹2,400 for delivery boy Ravi",
        target_type="approval_request",
        target_id=request_id,
        request=request,                  # FastAPI Request — extracts IP + user-agent
        success=True,
    )
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approvals import AuditLog

if TYPE_CHECKING:
    from starlette.requests import Request
    from app.models.super_admin import SuperAdmin


# Valid action_type constants — import these in endpoints to avoid typos.
class AuditAction:
    LOGIN                = "LOGIN"
    LOGOUT               = "LOGOUT"
    ACCESS_DENIED        = "ACCESS_DENIED"

    # Approval workflow
    APPROVE_REQUEST      = "APPROVE_REQUEST"
    REJECT_REQUEST       = "REJECT_REQUEST"
    CORRECT_REQUEST      = "CORRECT_REQUEST"
    CANCEL_REQUEST       = "CANCEL_REQUEST"

    # Financial
    COD_CLEAR            = "COD_CLEAR"
    FEE_CHANGE           = "FEE_CHANGE"
    RATE_CHANGE          = "RATE_CHANGE"
    PAYOUT_OVERRIDE      = "PAYOUT_OVERRIDE"
    MANUAL_ADJUSTMENT    = "MANUAL_ADJUSTMENT"

    # Admin management (SUPER only)
    CREATE_ADMIN         = "CREATE_ADMIN"
    DEACTIVATE_ADMIN     = "DEACTIVATE_ADMIN"
    CHANGE_ROLE          = "CHANGE_ROLE"

    # Read / export
    VIEW_LEDGER          = "VIEW_LEDGER"
    VIEW_CUSTOMER        = "VIEW_CUSTOMER"
    VIEW_DELIVERY_BOY    = "VIEW_DELIVERY_BOY"
    EXPORT_REPORT        = "EXPORT_REPORT"

    # Pharmacy
    ACTIVATE_PHARMACY    = "ACTIVATE_PHARMACY"
    UPDATE_PHARMACY      = "UPDATE_PHARMACY"
    APPROVE_PRODUCT      = "APPROVE_PRODUCT"
    REVISE_PRODUCT       = "REVISE_PRODUCT"

    # Settlement
    SETTLEMENT_CYCLE_CREATE  = "SETTLEMENT_CYCLE_CREATE"
    SETTLEMENT_CYCLE_STATUS  = "SETTLEMENT_CYCLE_STATUS"
    SETTLEMENT_BATCH_CREATE  = "SETTLEMENT_BATCH_CREATE"
    SETTLEMENT_BATCH_SUBMIT  = "SETTLEMENT_BATCH_SUBMIT"
    SETTLEMENT_BATCH_EXECUTE = "SETTLEMENT_BATCH_EXECUTE"
    SETTLEMENT_PROOF_UPLOAD  = "SETTLEMENT_PROOF_UPLOAD"
    SETTLEMENT_PROOF_VERIFY  = "SETTLEMENT_PROOF_VERIFY"

    # Reconciliation
    RECON_STATEMENT_IMPORT   = "RECON_STATEMENT_IMPORT"
    RECON_MATCH_RUN          = "RECON_MATCH_RUN"
    RECON_EXCEPTION_ASSIGN   = "RECON_EXCEPTION_ASSIGN"
    RECON_EXCEPTION_ESCALATE = "RECON_EXCEPTION_ESCALATE"
    RECON_EXCEPTION_RESOLVE  = "RECON_EXCEPTION_RESOLVE"


async def audit(
    session: AsyncSession,
    actor: "SuperAdmin | None",
    action_type: str,
    description: str,
    *,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    request: "Request | None" = None,
    success: bool = True,
    http_status: int | None = None,
) -> None:
    """
    Write one audit log row.  Never raises — failures are silently swallowed so
    that a logging error never breaks the primary operation.

    Args:
        session:      DB session bound to the T schema.
        actor:        The SuperAdmin performing the action; None = SYSTEM.
        action_type:  One of the AuditAction constants (or any descriptive string).
        description:  Human-readable sentence describing what happened.
        target_type:  Optional entity type that was acted on.
        target_id:    Optional UUID of the target entity.
        request:      FastAPI/Starlette Request object — used to extract IP and user-agent.
        success:      False when the action was blocked or failed.
        http_status:  HTTP response status code if available.
    """
    try:
        ip_address = None
        user_agent = None
        http_method = None
        http_path = None

        if request is not None:
            # Respect X-Forwarded-For for deployments behind a proxy / load balancer
            forwarded_for = request.headers.get("x-forwarded-for")
            ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else str(request.client.host) if request.client else None
            user_agent = request.headers.get("user-agent")
            http_method = request.method
            http_path = str(request.url.path)

        log = AuditLog(
            actor_id=actor.admin_id if actor else None,
            actor_name=actor.full_name if actor else "SYSTEM",
            actor_role=actor.role if actor else "SYSTEM",
            action_type=action_type,
            description=description,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
            http_method=http_method,
            http_path=http_path,
            http_status=http_status,
        )
        session.add(log)
        await session.commit()
    except Exception:  # noqa: BLE001
        # Audit failure must never crash the primary request
        pass
