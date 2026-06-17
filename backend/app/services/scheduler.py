"""
Background Job Scheduler
=========================
Runs all background jobs on their configured intervals using asyncio loops.
Each job runs in its own independent loop so one slow/failing job never
blocks another.

Usage — called once from main.py on_event("startup"):
    from app.services.scheduler import start_all_jobs, stop_all_jobs
    tasks = start_all_jobs()
    # on shutdown:
    await stop_all_jobs(tasks)
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import suppress
from typing import Callable, Awaitable

log = logging.getLogger(__name__)


async def _run_loop(
    name: str,
    fn: Callable[[], Awaitable[dict]],
    interval_seconds: int,
    *,
    run_immediately: bool = False,
) -> None:
    """
    Runs `fn` every `interval_seconds` seconds.
    If run_immediately=True, fires once before the first sleep (catch-up on restart).
    Errors are logged but never stop the loop.
    """
    if run_immediately:
        try:
            result = await fn()
            log.info("[JOB:%s] startup run → %s", name, result)
        except Exception:
            log.exception("[JOB:%s] startup run failed", name)

    while True:
        await asyncio.sleep(interval_seconds)
        try:
            result = await fn()
            # Only log if job did something (result dict has non-zero values)
            if result and any(v for v in result.values() if isinstance(v, int) and v > 0):
                log.info("[JOB:%s] %s", name, result)
        except Exception:
            log.exception("[JOB:%s] failed", name)


def _seconds(*, hours: int = 0, minutes: int = 0, seconds: int = 0) -> int:
    return hours * 3600 + minutes * 60 + seconds


def start_all_jobs() -> list[asyncio.Task]:
    """Create all job loop tasks. Returns list of tasks (for cancellation on shutdown)."""
    from app.services.background_jobs import (
        cleanup_expired_otps,
        create_daily_settlement_cycle,
        escalate_stale_disputes,
        escalate_stale_reconciliation_exceptions,
        expire_delivery_accept_deadlines,
        mark_haircut_no_shows,
        mark_stale_drivers_offline,
        process_unmatched_gateway_events,
        prune_old_audit_logs,
        remind_pharmacy_pending_pickup,
        retry_rejected_approval_requests,
        retry_unassigned_delivery_orders,
    )

    # (name, function, interval_seconds, run_immediately)
    JOB_SCHEDULE = [
        # ── REQUIRED ──────────────────────────────────────────────────────────
        (
            "expire_delivery_accept_deadlines",
            expire_delivery_accept_deadlines,
            30,           # every 30 seconds
            False,
        ),
        (
            "mark_stale_drivers_offline",
            mark_stale_drivers_offline,
            _seconds(minutes=3),
            True,         # run on startup to clear stale state from last restart
        ),
        (
            "retry_unassigned_delivery_orders",
            retry_unassigned_delivery_orders,
            _seconds(minutes=5),
            False,
        ),
        (
            "create_daily_settlement_cycle",
            create_daily_settlement_cycle,
            _seconds(hours=24),
            True,         # run on startup — ensures today's cycle always exists
        ),
        (
            "retry_rejected_approval_requests",
            retry_rejected_approval_requests,
            _seconds(hours=24),
            False,        # runs at next 24h mark; fine to miss at startup
        ),
        (
            "remind_pharmacy_pending_pickup",
            remind_pharmacy_pending_pickup,
            _seconds(minutes=2),
            False,
        ),
        (
            "mark_haircut_no_shows",
            mark_haircut_no_shows,
            _seconds(minutes=5),
            False,
        ),
        # ── GOOD TO HAVE ──────────────────────────────────────────────────────
        (
            "process_unmatched_gateway_events",
            process_unmatched_gateway_events,
            _seconds(minutes=10),
            False,
        ),
        (
            "cleanup_expired_otps",
            cleanup_expired_otps,
            _seconds(hours=24),
            False,
        ),
        (
            "prune_old_audit_logs",
            prune_old_audit_logs,
            _seconds(hours=24),
            False,
        ),
        (
            "escalate_stale_disputes",
            escalate_stale_disputes,
            _seconds(hours=4),
            False,
        ),
        (
            "escalate_stale_reconciliation_exceptions",
            escalate_stale_reconciliation_exceptions,
            _seconds(hours=24),
            False,
        ),
    ]

    tasks: list[asyncio.Task] = []
    for name, fn, interval, run_now in JOB_SCHEDULE:
        task = asyncio.create_task(
            _run_loop(name, fn, interval, run_immediately=run_now),
            name=f"job:{name}",
        )
        tasks.append(task)
        log.info("[SCHEDULER] registered job '%s' every %ds%s", name, interval, " (runs on startup)" if run_now else "")

    return tasks


async def stop_all_jobs(tasks: list[asyncio.Task]) -> None:
    """Cancel all job loop tasks gracefully on shutdown."""
    for task in tasks:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    log.info("[SCHEDULER] all %d job tasks stopped.", len(tasks))
