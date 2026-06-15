"""
Background Jobs API
====================
Two routers:

  /admin/jobs  — requires SUPER / SUPERVISOR auth (internal manual triggers)
  /cron/jobs   — no auth (called by external cron service on schedule)

Both routers share the same JOB_MAP so any job can be triggered either way.

Recommended external cron schedule (for a cron-job.org / EasyCron setup):
  sla_order_transitions               every 10 s
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
"""
from __future__ import annotations

import traceback
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import require_role
from app.models.super_admin import SuperAdmin

# ── Admin router (auth-protected) ────────────────────────────────────────────
router = APIRouter(prefix="/admin/jobs", tags=["background-jobs"])

# ── Cron router (no auth — rely on URL secrecy) ───────────────────────────────
cron_router = APIRouter(prefix="/cron/jobs", tags=["cron"])

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
    })


def _record(job_name: str, result: Any | None = None, error: str | None = None) -> None:
    _job_registry[job_name] = {
        "last_run_at": datetime.now(UTC).isoformat(),
        "last_result": result,
        "last_error": error,
    }


async def _execute_job(job_name: str) -> dict:
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
        _record(job_name, result=result)
        return {
            "job": job_name,
            "status": "success",
            "started_at": started_at.isoformat(),
            "finished_at": datetime.now(UTC).isoformat(),
            "result": result,
        }
    except Exception as exc:
        error_detail = traceback.format_exc()
        _record(job_name, error=str(exc))
        raise HTTPException(
            status_code=500,
            detail={"job": job_name, "error": str(exc), "traceback": error_detail},
        )


# ── Admin endpoints (auth-protected) ─────────────────────────────────────────

@router.get("")
async def list_jobs(
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR", "AUDITOR")),
):
    """List all background jobs with their schedule, priority, and last run info."""
    _register_jobs()
    return [
        {
            "job": name,
            "description": meta["description"],
            "recommended_interval": meta.get("recommended_interval", meta.get("schedule", "—")),
            "priority": meta["priority"],
            **_job_registry.get(name, {"last_run_at": None, "last_result": None, "last_error": None}),
        }
        for name, meta in JOB_MAP.items()
    ]


@router.post("/{job_name}/run")
async def trigger_job(
    job_name: str,
    actor: SuperAdmin = Depends(require_role("SUPER", "SUPERVISOR")),
):
    """Manually trigger a specific background job. Returns the job result."""
    return await _execute_job(job_name)


# ── Cron endpoints (no auth — called by external cron service) ────────────────

@cron_router.get("")
async def list_cron_jobs():
    """
    List all jobs with their recommended external cron interval.
    Useful for setting up cron-job.org / EasyCron entries.
    """
    _register_jobs()
    return [
        {
            "job": name,
            "post_url": f"/cron/jobs/{name}/run",
            "description": meta["description"],
            "recommended_interval": meta.get("recommended_interval", "—"),
            "priority": meta["priority"],
            **_job_registry.get(name, {"last_run_at": None, "last_result": None, "last_error": None}),
        }
        for name, meta in JOB_MAP.items()
    ]


@cron_router.post("/{job_name}/run")
async def cron_trigger_job(job_name: str):
    """
    Trigger a specific background job. No auth required — protect via URL secrecy.
    Returns 200 with job result on success, 500 with error detail on failure.
    Designed to be called by cron-job.org, EasyCron, Render crons, etc.
    """
    return await _execute_job(job_name)
