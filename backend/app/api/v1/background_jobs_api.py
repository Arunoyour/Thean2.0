"""
Background Jobs API
====================
Two routers:

  /admin/jobs  — requires SUPER / SUPERVISOR auth (internal manual triggers)
  /cron/jobs   — shared-secret auth (called by the private scheduler)

Both routers share the same JOB_MAP so any job can be triggered either way.

Recommended private scheduler schedule:
  sla_order_transitions               every 5 s
  expire_delivery_accept_deadlines    every 30 s
  remind_pharmacy_pending_pickup      every 2 min
  mark_stale_drivers_offline          every 3 min
  retry_unassigned_delivery_orders    every 5 min
  process_unmatched_gateway_events    every 10 min
  check_cod_balance_reminders         every 30 min
  escalate_stale_disputes             every 4 h
  create_daily_settlement_cycle       daily  00:00
  retry_rejected_approval_requests    daily  01:00
  escalate_stale_reconciliation_exceptions  daily 02:00
  cleanup_expired_otps                daily  03:00
  prune_old_audit_logs                daily  04:00
  haircut_mark_no_shows               every 5 min
"""
from __future__ import annotations

import json
import logging
import secrets
import traceback
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.core.config import get_settings
from app.db.session import AsyncSessionLocal, get_session
from app.models.super_admin import SuperAdmin


logger = logging.getLogger(__name__)


def require_cron_secret(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
) -> None:
    configured_secret = get_settings().cron_secret
    if not configured_secret:
        raise HTTPException(status_code=503, detail="External cron triggers are disabled.")
    if not x_cron_secret or not secrets.compare_digest(x_cron_secret, configured_secret):
        raise HTTPException(status_code=403, detail="Invalid cron credentials.")

# ── Admin router (auth-protected) ────────────────────────────────────────────
router = APIRouter(prefix="/admin/jobs", tags=["background-jobs"])

# ── Cron router (private network + shared-secret authentication) ──────────────
cron_router = APIRouter(
    prefix="/cron/jobs",
    tags=["cron"],
    dependencies=[Depends(require_cron_secret)],
)

# In-memory registry: job_name → {last_run_at, last_result, last_error}
_job_registry: dict[str, dict[str, Any]] = {}

# All registered jobs — populated lazily on first use
JOB_MAP: dict[str, Any] = {}


def _register_jobs() -> None:
    """Populate JOB_MAP once on first use."""
    if JOB_MAP:
        return
    from app.services.background_jobs import (
        check_cod_balance_reminders,
        cleanup_expired_otps,
        create_daily_settlement_cycle,
        escalate_stale_disputes,
        escalate_stale_reconciliation_exceptions,
        expire_delivery_accept_deadlines,
        mark_stale_drivers_offline,
        process_unmatched_gateway_events,
        prune_old_audit_logs,
        remind_pharmacy_pending_pickup,
        retry_rejected_approval_requests,
        retry_unassigned_delivery_orders,
        run_sla_order_transitions,
    )
    from app.services.pharmacy_service import run_pharmacy_schedule_tick
    from app.services.background_jobs import mark_haircut_no_shows

    JOB_MAP.update({
        # ── CRITICAL — order state machines ───────────────────────────────────
        "sla_order_transitions": {
            "fn": run_sla_order_transitions,
            "description": (
                "Run all three pharmacy-order SLA checks: expired customer review windows, "
                "expired pharmacy assignment deadlines, expired price review windows. "
                "Mirrors the internal 5-second SLA worker."
            ),
            "recommended_interval": "every 10s",
            "priority": "CRITICAL",
        },
        # ── REQUIRED — delivery lifecycle ──────────────────────────────────────
        "expire_delivery_accept_deadlines": {
            "fn": expire_delivery_accept_deadlines,
            "description": "Mark ASSIGNED_TO_DELIVERY orders past accept_deadline_at as expired and attempt re-assign.",
            "recommended_interval": "every 30s",
            "priority": "REQUIRED",
        },
        "remind_pharmacy_pending_pickup": {
            "fn": remind_pharmacy_pending_pickup,
            "description": "Push a pickup reminder to every pharmacy with a PHARMACY_ACCEPTED order older than 2 minutes.",
            "recommended_interval": "every 2min",
            "priority": "REQUIRED",
        },
        "mark_stale_drivers_offline": {
            "fn": mark_stale_drivers_offline,
            "description": "Set is_online=False for delivery boys whose GPS hasn't updated in 5 min.",
            "recommended_interval": "every 3min",
            "priority": "REQUIRED",
        },
        "retry_unassigned_delivery_orders": {
            "fn": retry_unassigned_delivery_orders,
            "description": "Retry auto-assign for READY_FOR_DELIVERY orders >10 min without a driver; alert admins.",
            "recommended_interval": "every 5min",
            "priority": "REQUIRED",
        },
        "pharmacy_schedule_tick": {
            "fn": run_pharmacy_schedule_tick,
            "description": (
                "Apply each pharmacy's weekly operating-hours schedule and holiday calendar to "
                "is_online. Holiday always wins; pharmacies with no schedule are skipped (frozen "
                "at last value); a manual toggle holds until the next scheduled transition."
            ),
            "recommended_interval": "every 5min",
            "priority": "REQUIRED",
        },
        # ── REQUIRED — financial ───────────────────────────────────────────────
        "create_daily_settlement_cycle": {
            "fn": create_daily_settlement_cycle,
            "description": "Idempotently create today's DAILY settlement cycle.",
            "recommended_interval": "daily 00:00",
            "priority": "REQUIRED",
        },
        "retry_rejected_approval_requests": {
            "fn": retry_rejected_approval_requests,
            "description": "Resubmit REJECTED approval requests with retry_count < 2 (max 2 retries).",
            "recommended_interval": "daily 01:00",
            "priority": "REQUIRED",
        },
        # ── GOOD TO HAVE ──────────────────────────────────────────────────────
        "process_unmatched_gateway_events": {
            "fn": process_unmatched_gateway_events,
            "description": "Run three-way reconciliation match for unprocessed gateway events that have a batch_id.",
            "recommended_interval": "every 10min",
            "priority": "GOOD_TO_HAVE",
        },
        "check_cod_balance_reminders": {
            "fn": check_cod_balance_reminders,
            "description": "Push WebSocket reminders to online delivery accounts with COD balance ≥ ₹1000 (warning) or ≥ ₹1200 (blocked).",
            "recommended_interval": "every 30min",
            "priority": "GOOD_TO_HAVE",
        },
        "escalate_stale_reconciliation_exceptions": {
            "fn": escalate_stale_reconciliation_exceptions,
            "description": "Auto-escalate reconciliation exceptions in OPEN status for >24 h.",
            "recommended_interval": "daily 02:00",
            "priority": "GOOD_TO_HAVE",
        },
        "cleanup_expired_otps": {
            "fn": cleanup_expired_otps,
            "description": "Delete expired OTP rows from all OTP tables (customer, pharmacy, super_admin, delivery).",
            "recommended_interval": "daily 03:00",
            "priority": "GOOD_TO_HAVE",
        },
        "prune_old_audit_logs": {
            "fn": prune_old_audit_logs,
            "description": "Delete audit_log rows older than 1 year.",
            "recommended_interval": "daily 04:00",
            "priority": "GOOD_TO_HAVE",
        },
        "escalate_stale_disputes": {
            "fn": escalate_stale_disputes,
            "description": "Auto-escalate disputes in OPEN status for >48 h to IN_REVIEW with a system message.",
            "recommended_interval": "every 4h",
            "priority": "GOOD_TO_HAVE",
        },
        # ── HAIRCUT ───────────────────────────────────────────────────────────
        "haircut_mark_no_shows": {
            "fn": mark_haircut_no_shows,
            "description": (
                "Mark PENDING haircut bookings as NO_SHOW when the appointment end time + 5 min grace "
                "has passed with no OTP or manual check-in. Permanently forfeits the held token."
            ),
            "recommended_interval": "every 5min",
            "priority": "REQUIRED",
        },
    })


def _record(job_name: str, result: Any | None = None, error: str | None = None) -> None:
    _job_registry[job_name] = {
        "last_run_at": datetime.now(UTC).isoformat(),
        "last_result": result,
        "last_error": error,
    }


async def _persist_execution(
    *,
    job_name: str,
    status: str,
    trigger_source: str,
    triggered_by: Any | None,
    started_at: datetime,
    finished_at: datetime,
    result: Any | None,
    error: str | None,
) -> None:
    """Persist monitoring state without allowing telemetry failures to fail the job."""
    duration_ms = max(0, int((finished_at - started_at).total_seconds() * 1000))
    result_json = json.dumps(jsonable_encoder(result)) if result is not None else None
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO background_job_status (
                        job_name, last_status, last_run_at, last_success_at,
                        last_failure_at, last_result, last_error, last_trigger_source,
                        last_duration_ms, total_runs, total_failures, consecutive_failures
                    ) VALUES (
                        :job_name, CAST(:status AS varchar), CAST(:finished_at AS timestamptz),
                        CASE WHEN CAST(:status AS varchar) = 'SUCCESS'
                            THEN CAST(:finished_at AS timestamptz) END,
                        CASE WHEN CAST(:status AS varchar) = 'FAILED'
                            THEN CAST(:finished_at AS timestamptz) END,
                        CAST(:result AS jsonb), :error, CAST(:trigger_source AS varchar),
                        :duration_ms, 1,
                        CASE WHEN CAST(:status AS varchar) = 'FAILED' THEN 1 ELSE 0 END,
                        CASE WHEN CAST(:status AS varchar) = 'FAILED' THEN 1 ELSE 0 END
                    )
                    ON CONFLICT (job_name) DO UPDATE SET
                        last_status = EXCLUDED.last_status,
                        last_run_at = EXCLUDED.last_run_at,
                        last_success_at = CASE
                            WHEN EXCLUDED.last_status = 'SUCCESS' THEN EXCLUDED.last_run_at
                            ELSE background_job_status.last_success_at
                        END,
                        last_failure_at = CASE
                            WHEN EXCLUDED.last_status = 'FAILED' THEN EXCLUDED.last_run_at
                            ELSE background_job_status.last_failure_at
                        END,
                        last_result = EXCLUDED.last_result,
                        last_error = EXCLUDED.last_error,
                        last_trigger_source = EXCLUDED.last_trigger_source,
                        last_duration_ms = EXCLUDED.last_duration_ms,
                        total_runs = background_job_status.total_runs + 1,
                        total_failures = background_job_status.total_failures
                            + CASE WHEN EXCLUDED.last_status = 'FAILED' THEN 1 ELSE 0 END,
                        consecutive_failures = CASE
                            WHEN EXCLUDED.last_status = 'FAILED'
                                THEN background_job_status.consecutive_failures + 1
                            ELSE 0
                        END,
                        updated_at = NOW()
                    """
                ),
                {
                    "job_name": job_name,
                    "status": status,
                    "finished_at": finished_at,
                    "result": result_json,
                    "error": error,
                    "trigger_source": trigger_source,
                    "duration_ms": duration_ms,
                },
            )
            if status == "FAILED" or trigger_source == "MANUAL":
                await session.execute(
                    text(
                        """
                        INSERT INTO background_job_execution_events (
                            job_name, status, trigger_source, triggered_by, started_at,
                            finished_at, duration_ms, result, error
                        ) VALUES (
                            :job_name, :status, :trigger_source, :triggered_by, :started_at,
                            :finished_at, :duration_ms, CAST(:result AS jsonb), :error
                        )
                        """
                    ),
                    {
                        "job_name": job_name,
                        "status": status,
                        "trigger_source": trigger_source,
                        "triggered_by": triggered_by,
                        "started_at": started_at,
                        "finished_at": finished_at,
                        "duration_ms": duration_ms,
                        "result": result_json,
                        "error": error,
                    },
                )
            await session.commit()
    except Exception:
        logger.exception("Could not persist monitoring state for background job %s", job_name)


async def _persistent_status(session: AsyncSession) -> dict[str, dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                """
                SELECT job_name, last_status, last_run_at, last_success_at,
                       last_failure_at, last_result, last_error, last_trigger_source,
                       last_duration_ms, total_runs, total_failures, consecutive_failures
                FROM background_job_status
                """
            )
        )
    ).mappings()
    return {row["job_name"]: dict(row) for row in rows}


async def _job_list(session: AsyncSession, *, cron_contract: bool = False) -> list[dict]:
    _register_jobs()
    persisted = await _persistent_status(session)
    jobs = []
    for name, meta in JOB_MAP.items():
        state = persisted.get(name)
        if state is None:
            memory = _job_registry.get(name, {})
            state = {
                "last_status": "FAILED" if memory.get("last_error") else (
                    "SUCCESS" if memory.get("last_run_at") else "NEVER_RUN"
                ),
                **memory,
                "last_success_at": None,
                "last_failure_at": None,
                "last_trigger_source": None,
                "last_duration_ms": None,
                "total_runs": 0,
                "total_failures": 0,
                "consecutive_failures": 0,
            }
        item = {
            "job": name,
            "description": meta["description"],
            "recommended_interval": meta.get("recommended_interval", meta.get("schedule", "—")),
            "priority": meta["priority"],
            **state,
        }
        if cron_contract:
            item["post_url"] = f"/cron/jobs/{name}/run"
        jobs.append(item)
    return jobs


async def _execute_job(
    job_name: str,
    *,
    trigger_source: str,
    triggered_by: Any | None = None,
) -> dict:
    """Shared execution logic for both admin and cron routers."""
    _register_jobs()
    if job_name not in JOB_MAP:
        raise HTTPException(
            status_code=404,
            detail=f"Job '{job_name}' not found. Available: {list(JOB_MAP.keys())}",
        )
    fn = JOB_MAP[job_name]["fn"]
    started_at = datetime.now(UTC)
    try:
        result = await fn()
        finished_at = datetime.now(UTC)
        _record(job_name, result=result)
        await _persist_execution(
            job_name=job_name,
            status="SUCCESS",
            trigger_source=trigger_source,
            triggered_by=triggered_by,
            started_at=started_at,
            finished_at=finished_at,
            result=result,
            error=None,
        )
        return {
            "job": job_name,
            "status": "success",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "result": result,
        }
    except Exception as exc:
        error_detail = traceback.format_exc()
        finished_at = datetime.now(UTC)
        _record(job_name, error=str(exc))
        await _persist_execution(
            job_name=job_name,
            status="FAILED",
            trigger_source=trigger_source,
            triggered_by=triggered_by,
            started_at=started_at,
            finished_at=finished_at,
            result=None,
            error=str(exc),
        )
        raise HTTPException(
            status_code=500,
            detail={"job": job_name, "error": str(exc), "traceback": error_detail},
        )


# ── Admin endpoints (auth-protected) ─────────────────────────────────────────

@router.get("")
async def list_jobs(
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    """List all background jobs with their schedule, priority, and last run info."""
    return await _job_list(session)


@router.get("/history")
async def list_job_history(
    job_name: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "AUDITOR")),
    session: AsyncSession = Depends(get_session),
):
    """Return retained failures and manual executions, newest first."""
    query = """
        SELECT execution_id, job_name, status, trigger_source, triggered_by,
               started_at, finished_at, duration_ms, result, error
        FROM background_job_execution_events
    """
    params: dict[str, Any] = {"limit": limit}
    if job_name:
        query += " WHERE job_name = :job_name"
        params["job_name"] = job_name
    query += " ORDER BY finished_at DESC LIMIT :limit"
    rows = (await session.execute(text(query), params)).mappings()
    return [dict(row) for row in rows]


@router.post("/{job_name}/run")
async def trigger_job(
    job_name: str,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
):
    """Manually trigger a specific background job. Returns the job result."""
    return await _execute_job(
        job_name,
        trigger_source="MANUAL",
        triggered_by=actor.admin_id,
    )


# ── Cron endpoints (called by the private external scheduler) ────────────────

@cron_router.get("")
async def list_cron_jobs(session: AsyncSession = Depends(get_session)):
    """
    List all jobs with their recommended external cron interval.
    Used to inspect the private scheduler contract.
    """
    return await _job_list(session, cron_contract=True)


@cron_router.post("/{job_name}/run")
async def cron_trigger_job(job_name: str):
    """
    Trigger a specific background job from the private scheduler.
    Returns 200 with job result on success, 500 with error detail on failure.
    """
    return await _execute_job(job_name, trigger_source="SCHEDULER")
