"""
Background Job Implementations
================================
All scheduled/recurring jobs live here. Each job is an independent async function
that opens its own DB session and can be called:
  - From the asyncio worker loops registered in main.py
  - From the admin API at POST /admin/jobs/{job_name}/run  (manual trigger)

Session conventions:
  AsyncSessionLocal      → main DB  (settlement, disputes, reconciliation, audit, OTPs)
  PharmacySessionLocal   → pharmacy DB (pharmacy_otp_challenges)
  DeliverySessionLocal   → delivery DB (delivery_accounts, delivery_orders)
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select, update

from app.db.session import AsyncSessionLocal, DeliverySessionLocal, HaircutSessionLocal, PharmacySessionLocal

log = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# JOB 1 — Delivery accept-deadline expiry + auto-reassign
# ──────────────────────────────────────────────────────────────────────────────

async def expire_delivery_accept_deadlines() -> dict:
    """
    Find delivery orders in ASSIGNED_TO_DELIVERY past their accept_deadline_at
    and attempt to re-assign to the next best driver.
    If no driver is available, the source pharmacy order is reset to READY_FOR_DELIVERY.

    Runs every 30 seconds.
    """
    from app.models.delivery import DeliveryAccount, DeliveryOrder
    from app.schemas.delivery import AutoAssignRequest
    from app.services.delivery_service import auto_assign_best_driver

    expired_count = reassigned_count = failed_count = 0

    async with DeliverySessionLocal() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(DeliveryOrder).where(
                and_(
                    DeliveryOrder.status == "ASSIGNED_TO_DELIVERY",
                    DeliveryOrder.accept_deadline_at <= now,
                )
            )
        )
        expired_orders = result.scalars().all()
        expired_count = len(expired_orders)

        for order in expired_orders:
            try:
                # Mark as deadline-expired (use DELIVERY_REJECTED to trigger re-assign flow)
                order.status = "DELIVERY_REJECTED"
                order.rejected_at = now
                order.updated_at = now
                await session.flush()

                # Attempt to auto-assign the next best driver
                if order.pickup_lat and order.pickup_lng and order.dropoff_lat and order.dropoff_lng:
                    payload = AutoAssignRequest(
                        sector=order.sector or "pharmacy",
                        source_order_id=order.source_order_id,
                        pickup_lat=float(order.pickup_lat),
                        pickup_lng=float(order.pickup_lng),
                        dropoff_lat=float(order.dropoff_lat),
                        dropoff_lng=float(order.dropoff_lng),
                        cod_amount=float(order.cod_amount) if order.cod_amount else 0.0,
                    )
                    result_assign = await auto_assign_best_driver(session, payload)
                    if result_assign.assigned:
                        reassigned_count += 1
                        log.info("Delivery order %s deadline expired → reassigned to new driver.", order.delivery_order_id)
                    else:
                        failed_count += 1
                        log.warning("Delivery order %s deadline expired → no driver available, order reset.", order.delivery_order_id)
                else:
                    failed_count += 1

            except Exception:
                log.exception("Error processing expired delivery order %s", order.delivery_order_id)

        await session.commit()

    return {"expired": expired_count, "reassigned": reassigned_count, "no_driver": failed_count}


# ──────────────────────────────────────────────────────────────────────────────
# JOB 2 — Stale delivery-boy auto-offline
# ──────────────────────────────────────────────────────────────────────────────

STALE_GPS_MINUTES = 5   # mark offline if GPS not updated for this long

async def mark_stale_drivers_offline() -> dict:
    """
    Find online delivery boys whose GPS hasn't been updated in STALE_GPS_MINUTES.
    Set is_online = False so they are excluded from auto-assign scoring.

    Runs every 3 minutes.
    """
    from app.models.delivery import DeliveryAccount

    cutoff = datetime.now(UTC) - timedelta(minutes=STALE_GPS_MINUTES)

    async with DeliverySessionLocal() as session:
        result = await session.execute(
            select(DeliveryAccount).where(
                and_(
                    DeliveryAccount.is_online == True,
                    DeliveryAccount.location_updated_at <= cutoff,
                )
            )
        )
        stale = result.scalars().all()
        count = len(stale)

        for account in stale:
            account.is_online = False
            account.updated_at = datetime.now(UTC)
            log.info(
                "Driver %s auto-offlined — GPS stale since %s",
                account.account_id,
                account.location_updated_at,
            )

        await session.commit()

    return {"marked_offline": count}


# ──────────────────────────────────────────────────────────────────────────────
# JOB 3 — READY_FOR_DELIVERY aging alert + retry auto-assign
# ──────────────────────────────────────────────────────────────────────────────

READY_WITHOUT_DRIVER_MINUTES = 10   # alert after this long without a driver

async def retry_unassigned_delivery_orders() -> dict:
    """
    Find pharmacy orders in READY_FOR_DELIVERY with no active delivery order
    for more than READY_WITHOUT_DRIVER_MINUTES.
    Retry auto-assign; if still no driver, send admin WebSocket alert.

    Runs every 5 minutes.
    """
    from app.models.delivery import DeliveryOrder
    from app.schemas.delivery import AutoAssignRequest
    from app.services.delivery_service import auto_assign_best_driver, list_unassigned_orders
    from app.services.realtime import manager

    cutoff = datetime.now(UTC) - timedelta(minutes=READY_WITHOUT_DRIVER_MINUTES)
    retried = reassigned = still_unassigned = 0

    async with DeliverySessionLocal() as session:
        unassigned = await list_unassigned_orders(session)
        aged = [o for o in unassigned if o.ready_since and o.ready_since <= cutoff]
        retried = len(aged)

        for order in aged:
            try:
                payload = AutoAssignRequest(
                    sector=order.sector,
                    source_order_id=order.source_order_id,
                    pickup_lat=order.pickup_lat or 0.0,
                    pickup_lng=order.pickup_lng or 0.0,
                    dropoff_lat=order.dropoff_lat or 0.0,
                    dropoff_lng=order.dropoff_lng or 0.0,
                    cod_amount=order.cod_amount or 0.0,
                )
                result = await auto_assign_best_driver(session, payload)
                if result.assigned:
                    reassigned += 1
                    log.info("Unassigned order %s retried → reassigned.", order.source_order_id)
                else:
                    still_unassigned += 1
                    log.warning("Unassigned order %s still has no driver after retry.", order.source_order_id)
                    # Notify all connected admins via WebSocket
                    await manager.send_super_admin({
                        "type": "unassigned_order_alert",
                        "source_order_id": str(order.source_order_id),
                        "sector": order.sector,
                        "ready_since": order.ready_since.isoformat() if order.ready_since else None,
                        "message": f"Order {order.source_order_id} has been waiting for a driver for over {READY_WITHOUT_DRIVER_MINUTES} minutes.",
                    })
            except Exception:
                log.exception("Error retrying auto-assign for order %s", order.source_order_id)

    return {"aged_orders": retried, "reassigned": reassigned, "still_unassigned": still_unassigned}


# ──────────────────────────────────────────────────────────────────────────────
# JOB 4 — Daily settlement cycle auto-creation
# ──────────────────────────────────────────────────────────────────────────────

async def create_daily_settlement_cycle() -> dict:
    """
    Idempotently create a DAILY settlement cycle for today.
    Safe to call multiple times — the UNIQUE(cycle_date, cycle_type) constraint
    and the select-before-insert in create_cycle() prevent duplicates.

    Runs once per day at midnight (and on startup as a catch-up).
    """
    from app.services.settlement_service import create_cycle

    today = datetime.now(UTC).date()
    async with AsyncSessionLocal() as session:
        try:
            result = await create_cycle(
                session,
                cycle_date=today,
                cycle_type="DAILY",
                notes="Auto-created by daily settlement job",
                created_by=None,
            )
            await session.commit()
            log.info("Daily settlement cycle created for %s: %s", today, result["cycle_id"])
            return {"created": True, "cycle_id": result["cycle_id"], "date": str(today)}
        except Exception as exc:
            if "already exists" in str(exc).lower():
                log.info("Daily settlement cycle for %s already exists — skipped.", today)
                return {"created": False, "reason": "already_exists", "date": str(today)}
            log.exception("Failed to create daily settlement cycle for %s", today)
            raise


# ──────────────────────────────────────────────────────────────────────────────
# JOB 5 — Approval request auto-retry (nightly)
# ──────────────────────────────────────────────────────────────────────────────

async def retry_rejected_approval_requests() -> dict:
    """
    Find REJECTED approval requests with retry_count < 2 and resubmit them.
    The resubmit_rejected_requests() function was written but never called.

    Runs nightly at 01:00.
    """
    from app.services.approval_service import resubmit_rejected_requests

    async with AsyncSessionLocal() as session:
        count = await resubmit_rejected_requests(session)
        await session.commit()
        log.info("Approval auto-retry: %d requests resubmitted.", count)
        return {"resubmitted": count}


# ──────────────────────────────────────────────────────────────────────────────
# JOB 6 — Gateway events auto-processing (reconciliation)
# ──────────────────────────────────────────────────────────────────────────────

async def process_unmatched_gateway_events() -> dict:
    """
    Find gateway_events with processed=False that have a matching batch_id already
    set (linked during ingestion) and run three-way reconciliation for those batches.

    Runs every 10 minutes.
    """
    from app.models.reconciliation import GatewayEvent
    from app.services.reconciliation_service import run_three_way_match

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GatewayEvent.batch_id).where(
                and_(
                    GatewayEvent.processed == False,
                    GatewayEvent.batch_id.isnot(None),
                )
            ).distinct()
        )
        batch_ids = [row[0] for row in result.fetchall()]
        matched = errors = 0

        for batch_id in batch_ids:
            try:
                await run_three_way_match(session, batch_id)
                await session.commit()
                matched += 1
            except Exception:
                log.exception("Three-way match failed for batch %s", batch_id)
                await session.rollback()
                errors += 1

        log.info("Gateway event processing: %d batches matched, %d errors.", matched, errors)
        return {"batches_processed": matched, "errors": errors}


# ──────────────────────────────────────────────────────────────────────────────
# JOB 7 — OTP cleanup (customer + pharmacy + super_admin)
# ──────────────────────────────────────────────────────────────────────────────

async def cleanup_expired_otps() -> dict:
    """
    Delete expired OTP rows from all three OTP tables.
    Also clears stale otp_code/otp_expires_at fields on delivery_accounts.

    Runs daily at 03:00.
    """
    from app.models.auth import OtpChallenge
    from app.models.pharmacy_merchant import PharmacyOtpChallenge
    from app.models.super_admin import SuperAdminOtpChallenge
    from app.models.delivery import DeliveryAccount

    now = datetime.now(UTC)
    deleted_customer = deleted_pharmacy = deleted_admin = cleared_delivery = 0

    # Customer OTPs (main DB)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(OtpChallenge).where(OtpChallenge.expires_at < now)
        )
        rows = result.scalars().all()
        deleted_customer = len(rows)
        for row in rows:
            await session.delete(row)

        result2 = await session.execute(
            select(SuperAdminOtpChallenge).where(SuperAdminOtpChallenge.expires_at < now)
        )
        rows2 = result2.scalars().all()
        deleted_admin = len(rows2)
        for row in rows2:
            await session.delete(row)

        await session.commit()

    # Pharmacy OTPs (pharmacy DB)
    async with PharmacySessionLocal() as session:
        result = await session.execute(
            select(PharmacyOtpChallenge).where(PharmacyOtpChallenge.expires_at < now)
        )
        rows = result.scalars().all()
        deleted_pharmacy = len(rows)
        for row in rows:
            await session.delete(row)
        await session.commit()

    # Delivery OTP fields (delivery DB)
    async with DeliverySessionLocal() as session:
        result = await session.execute(
            select(DeliveryAccount).where(
                and_(
                    DeliveryAccount.otp_expires_at.isnot(None),
                    DeliveryAccount.otp_expires_at < now,
                )
            )
        )
        accounts = result.scalars().all()
        cleared_delivery = len(accounts)
        for acc in accounts:
            acc.otp_code = None
            acc.otp_expires_at = None
        await session.commit()

    log.info(
        "OTP cleanup: %d customer, %d pharmacy, %d admin, %d delivery cleared.",
        deleted_customer, deleted_pharmacy, deleted_admin, cleared_delivery,
    )
    return {
        "customer_otps_deleted": deleted_customer,
        "pharmacy_otps_deleted": deleted_pharmacy,
        "admin_otps_deleted": deleted_admin,
        "delivery_otp_fields_cleared": cleared_delivery,
    }


# ──────────────────────────────────────────────────────────────────────────────
# JOB 8 — Audit log pruning (> 1 year)
# ──────────────────────────────────────────────────────────────────────────────

async def prune_old_audit_logs() -> dict:
    """
    Delete audit_logs rows older than 1 year.
    Explicitly called out in the AuditLog model docstring.

    Runs daily at 04:00.
    """
    from app.models.approvals import AuditLog

    cutoff = datetime.now(UTC) - timedelta(days=365)

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AuditLog).where(AuditLog.created_at < cutoff)
        )
        rows = result.scalars().all()
        count = len(rows)
        for row in rows:
            await session.delete(row)
        await session.commit()

    log.info("Audit log pruning: %d rows deleted (older than 1 year).", count)
    return {"deleted": count}


# ──────────────────────────────────────────────────────────────────────────────
# JOB 9 — Dispute SLA auto-escalation
# ──────────────────────────────────────────────────────────────────────────────

DISPUTE_SLA_HOURS = 48   # escalate if OPEN/IN_REVIEW for longer than this

async def escalate_stale_disputes() -> dict:
    """
    Find disputes in OPEN or IN_REVIEW status older than DISPUTE_SLA_HOURS.
    Add a system message and transition to IN_REVIEW (if OPEN) or flag via
    a status history note so admins can see the breach.

    Runs every 4 hours.
    """
    from app.models.dispute import Dispute, DisputeMessage, DisputeStatusHistory

    cutoff = datetime.utcnow() - timedelta(hours=DISPUTE_SLA_HOURS)
    escalated = 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Dispute).where(
                and_(
                    Dispute.status.in_(["OPEN"]),
                    Dispute.created_at <= cutoff,
                )
            )
        )
        stale = result.scalars().all()

        for dispute in stale:
            # Transition OPEN → IN_REVIEW
            old_status = dispute.status
            dispute.status = "IN_REVIEW"
            dispute.updated_at = datetime.now(UTC)

            # System message
            msg = DisputeMessage(
                dispute_id=dispute.dispute_id,
                sender_type="SYSTEM",
                text_content=f"SLA breach: this dispute has been open for over {DISPUTE_SLA_HOURS} hours. Automatically escalated for review.",
                is_internal=False,
            )
            session.add(msg)

            # Status history
            history = DisputeStatusHistory(
                dispute_id=dispute.dispute_id,
                old_status=old_status,
                new_status="IN_REVIEW",
                changed_by=None,
                changed_by_name="SYSTEM",
                notes=f"Auto-escalated: SLA breach ({DISPUTE_SLA_HOURS}h exceeded)",
            )
            session.add(history)
            escalated += 1
            log.warning("Dispute %s auto-escalated (SLA breach).", dispute.dispute_id)

        await session.commit()

    return {"escalated": escalated, "sla_hours": DISPUTE_SLA_HOURS}


# ──────────────────────────────────────────────────────────────────────────────
# JOB 10 — Reconciliation exception SLA escalation
# ──────────────────────────────────────────────────────────────────────────────

RECON_EXCEPTION_SLA_HOURS = 24

async def escalate_stale_reconciliation_exceptions() -> dict:
    """
    Find reconciliation exceptions in OPEN status older than RECON_EXCEPTION_SLA_HOURS.
    Auto-escalate to ESCALATED status.

    Runs daily at 02:00.
    """
    from app.models.reconciliation import ReconciliationException

    cutoff = datetime.utcnow() - timedelta(hours=RECON_EXCEPTION_SLA_HOURS)
    escalated = 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ReconciliationException).where(
                and_(
                    ReconciliationException.status == "OPEN",
                    ReconciliationException.created_at <= cutoff,
                )
            )
        )
        exceptions = result.scalars().all()

        for exc in exceptions:
            exc.status = "ESCALATED"
            exc.updated_at = datetime.now(UTC)
            escalated += 1
            log.warning(
                "Reconciliation exception %s auto-escalated (>%dh OPEN, severity=%s).",
                exc.exception_id, RECON_EXCEPTION_SLA_HOURS, exc.severity,
            )

        await session.commit()

    return {"escalated": escalated, "sla_hours": RECON_EXCEPTION_SLA_HOURS}


# ──────────────────────────────────────────────────────────────────────────────
# JOB — Pharmacy ready-for-pickup voice reminder
# Send a Web Push to the pharmacy every 2 minutes while an accepted order
# has not yet been marked as ready for delivery.
# ──────────────────────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────────────────────
# JOB — SLA order transitions (wraps the 5-second pharmacy SLA worker)
# Exposed as an API so an external cron caller can hit it every 10 seconds.
# The internal asyncio loop (main.py) also keeps running as a fallback.
# ──────────────────────────────────────────────────────────────────────────────

async def run_sla_order_transitions() -> dict:
    """
    Run all three pharmacy order SLA checks in a single session:
      1. Expired customer review windows → auto-assign or cancel
      2. Expired pharmacy assignment deadlines → reroute or cancel
      3. Expired price review windows → auto-reject

    Mirrors the internal 5-second SLA worker (main.py:pharmacy_order_sla_worker).
    External callers should hit this every 10 seconds.
    """
    from app.services.customer_order_service import (
        handle_expired_customer_review_windows,
        handle_expired_pharmacy_assignments,
        handle_expired_price_reviews,
    )

    async with PharmacySessionLocal() as session:
        await handle_expired_customer_review_windows(session)
        await handle_expired_pharmacy_assignments(session)
        await handle_expired_price_reviews(session)
        await session.commit()

    return {"checked": ["customer_review_windows", "pharmacy_assignments", "price_reviews"]}


# ──────────────────────────────────────────────────────────────────────────────
# JOB — COD balance reminders (wraps delivery_service._cod_reminder_loop body)
# External callers should hit this every 30 minutes.
# The internal asyncio loop also keeps running as a fallback.
# ──────────────────────────────────────────────────────────────────────────────

async def check_cod_balance_reminders() -> dict:
    """
    Push WebSocket reminders to every online delivery account whose COD balance
    is in the warning (≥ ₹1000) or blocked (≥ ₹1200) band.

    Mirrors the internal COD reminder loop started via ensure_cod_reminder_running().
    External callers should hit this every 30 minutes.
    """
    from app.models.delivery import DeliveryAccount
    from app.services.delivery_service import COD_BLOCK_THRESHOLD, COD_WARN_THRESHOLD
    from app.services.realtime import manager
    from sqlalchemy import and_

    warned = blocked = 0

    async with DeliverySessionLocal() as session:
        result = await session.execute(
            select(DeliveryAccount).where(
                and_(
                    DeliveryAccount.is_online == True,
                    DeliveryAccount.cod_balance >= COD_WARN_THRESHOLD,
                )
            )
        )
        accounts = result.scalars().all()

        for acc in accounts:
            bal = float(acc.cod_balance)
            if bal >= COD_BLOCK_THRESHOLD:
                await manager.send_delivery_boy(str(acc.account_id), {
                    "type": "cod_blocked_reminder",
                    "cod_balance": bal,
                    "message": f"Your COD balance is ₹{bal:.0f}. Account is blocked — clear cash immediately.",
                })
                blocked += 1
            else:
                await manager.send_delivery_boy(str(acc.account_id), {
                    "type": "cod_warning_reminder",
                    "cod_balance": bal,
                    "message": f"Your COD balance is ₹{bal:.0f}. Please clear cash before it reaches ₹{int(COD_BLOCK_THRESHOLD)}.",
                })
                warned += 1

    log.info("COD balance reminders: %d warning, %d blocked.", warned, blocked)
    return {"warned": warned, "blocked": blocked}


PICKUP_REMINDER_GRACE_SECONDS = 120   # first reminder fires 2 min after acceptance

async def remind_pharmacy_pending_pickup() -> dict:
    """
    Find PHARMACY_ACCEPTED orders older than 2 minutes and push a voice reminder
    to every registered device of the assigned pharmacy account.
    Runs every 2 minutes.
    """
    from app.models.pharmacy_merchant import CustomerPharmacyOrder
    from app.services.push_service import push_to_account

    cutoff = datetime.now(UTC) - timedelta(seconds=PICKUP_REMINDER_GRACE_SECONDS)
    reminded = 0

    async with PharmacySessionLocal() as session:
        result = await session.execute(
            select(CustomerPharmacyOrder).where(
                and_(
                    CustomerPharmacyOrder.status == "PHARMACY_ACCEPTED",
                    CustomerPharmacyOrder.assigned_at <= cutoff,
                    CustomerPharmacyOrder.account_id.is_not(None),
                )
            )
        )
        orders = result.scalars().all()

        for order in orders:
            await push_to_account(
                session,
                order.account_id,
                {
                    "type": "pending_pickup_reminder",
                    "order_id": str(order.order_id),
                    "speak": "Pending order, update status.",
                    "title": "Pending Order",
                    "body": f"Order #{str(order.order_id)[:8].upper()} is waiting — please mark it ready for pickup.",
                },
            )
            reminded += 1

    return {"reminded": reminded}


# ──────────────────────────────────────────────────────────────────────────────
# JOB — Haircut no-show sweep
# ──────────────────────────────────────────────────────────────────────────────

async def mark_haircut_no_shows() -> dict:
    """
    Marks PENDING/CONFIRMED haircut bookings as NO_SHOW once the grace period
    after the appointment time has passed without an OTP or manual check-in.
    Permanently forfeits the held token. Runs every 5 minutes.
    """
    from app.services.haircut_service import mark_no_shows

    async with HaircutSessionLocal() as session:
        count = await mark_no_shows(session)
    return {"marked_no_show": count}
