"""
Attention Service
==================
Returns actionable items that need immediate human attention per role.
Called on home page load — acts as a fallback for background jobs that
may have missed a beat.

Items carry:
  type        — machine-readable category
  severity    — HIGH | MEDIUM
  title       — short headline
  detail      — one-line explanation
  link        — frontend deep-link (relative path)
  age_minutes — how long the condition has existed
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

# Thresholds (mirrors background job constants)
ASSIGNED_TO_PHARMACY_WARN_MIN = 5   # customer: pharmacy not acted in 5 min
READY_NO_DRIVER_MIN           = 10  # customer + admin: no driver in 10 min
PHARMACY_PICKUP_GRACE_MIN     = 2   # pharmacy: accepted but not ready in 2 min
STALE_GPS_MIN                 = 5   # admin: driver GPS stale 5 min
DISPUTE_SLA_HOURS             = 48  # admin: open dispute > 48 h
RECON_EXCEPTION_SLA_HOURS     = 24  # admin: open exception > 24 h
COD_WARN_THRESHOLD            = 1000.0  # delivery: COD balance warn
PRODUCT_REVIEW_SLA_HOURS      = 4   # admin: pharmacy product awaiting review > 4 h


def _age(dt: datetime) -> int:
    """Minutes since dt (UTC-aware or naive both handled)."""
    if dt is None:
        return 0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return max(0, int((datetime.now(UTC) - dt).total_seconds() / 60))


# ── Customer ──────────────────────────────────────────────────────────────────

async def get_customer_attention(session: AsyncSession, user_id) -> dict:
    """
    Stuck orders for a customer:
    - ASSIGNED_TO_PHARMACY > 5 min  (pharmacy not responding)
    - READY_FOR_DELIVERY  > 10 min  (no driver found)
    """
    from app.models.pharmacy_merchant import CustomerPharmacyOrder

    items = []
    result = await session.execute(
        select(CustomerPharmacyOrder).where(
            and_(
                CustomerPharmacyOrder.user_id == user_id,
                CustomerPharmacyOrder.status.in_(["ASSIGNED_TO_PHARMACY", "READY_FOR_DELIVERY"]),
            )
        )
    )
    orders = result.scalars().all()

    for o in orders:
        age = _age(o.assigned_at or o.created_at)
        ref = str(o.order_id)[:8].upper()

        if o.status == "ASSIGNED_TO_PHARMACY" and age >= ASSIGNED_TO_PHARMACY_WARN_MIN:
            items.append({
                "type": "PHARMACY_NOT_RESPONDING",
                "severity": "MEDIUM",
                "title": f"Order #{ref} — pharmacy hasn't responded",
                "detail": f"Your order was sent to the pharmacy {age} minute(s) ago but hasn't been accepted yet.",
                "link": "/home/pharmacy/orders",
                "age_minutes": age,
            })

        elif o.status == "READY_FOR_DELIVERY" and age >= READY_NO_DRIVER_MIN:
            items.append({
                "type": "NO_DRIVER_FOUND",
                "severity": "HIGH",
                "title": f"Order #{ref} — waiting for a delivery driver",
                "detail": f"Your order has been ready for pickup for {age} minute(s) but no driver has been assigned yet.",
                "link": "/home/pharmacy/orders",
                "age_minutes": age,
            })

    items.sort(key=lambda x: x["age_minutes"], reverse=True)
    return {"count": len(items), "items": items}


# ── Pharmacy ──────────────────────────────────────────────────────────────────

async def get_pharmacy_attention(session: AsyncSession, account_id) -> dict:
    """
    Orders accepted by the pharmacy but not yet marked ready for pickup > 2 min.
    """
    from app.models.pharmacy_merchant import CustomerPharmacyOrder

    cutoff = datetime.now(UTC) - timedelta(minutes=PHARMACY_PICKUP_GRACE_MIN)
    items = []

    result = await session.execute(
        select(CustomerPharmacyOrder).where(
            and_(
                CustomerPharmacyOrder.account_id == account_id,
                CustomerPharmacyOrder.status == "PHARMACY_ACCEPTED",
                CustomerPharmacyOrder.assigned_at <= cutoff,
            )
        )
    )
    orders = result.scalars().all()

    for o in orders:
        age = _age(o.assigned_at)
        ref = str(o.order_id)[:8].upper()
        items.append({
            "type": "ORDER_PENDING_READY",
            "severity": "HIGH",
            "title": f"Order #{ref} — mark ready for pickup",
            "detail": f"This order was accepted {age} minute(s) ago. Please prepare and mark it ready for the delivery driver.",
            "link": "/orders",
            "age_minutes": age,
        })

    items.sort(key=lambda x: x["age_minutes"], reverse=True)
    return {"count": len(items), "items": items}


# ── Delivery ──────────────────────────────────────────────────────────────────

async def get_delivery_attention(session: AsyncSession, account_id) -> dict:
    """
    - Unaccepted assignment (ASSIGNED_TO_DELIVERY for this driver — missed popup)
    - COD balance >= ₹1000
    """
    from app.models.delivery import DeliveryAccount, DeliveryOrder

    items = []

    # Unaccepted assignment
    result = await session.execute(
        select(DeliveryOrder).where(
            and_(
                DeliveryOrder.delivery_account_id == account_id,
                DeliveryOrder.status == "ASSIGNED_TO_DELIVERY",
            )
        )
    )
    orders = result.scalars().all()
    for o in orders:
        age = _age(o.created_at)
        has_deadline = o.accept_deadline_at is not None
        deadline_dt = o.accept_deadline_at
        if deadline_dt and deadline_dt.tzinfo is None:
            deadline_dt = deadline_dt.replace(tzinfo=UTC)
        expired = has_deadline and datetime.now(UTC) > deadline_dt if has_deadline else False

        items.append({
            "type": "UNACCEPTED_ASSIGNMENT",
            "severity": "HIGH",
            "title": "New delivery request — action needed",
            "detail": (
                "Your accept window has expired. The order may be reassigned soon."
                if expired else
                f"You have an unaccepted delivery request assigned {age} minute(s) ago."
            ),
            "link": "/home",
            "age_minutes": age,
        })

    # COD balance warning
    acc_result = await session.execute(
        select(DeliveryAccount).where(DeliveryAccount.account_id == account_id)
    )
    account = acc_result.scalar_one_or_none()
    if account and float(account.cod_balance or 0) >= COD_WARN_THRESHOLD:
        bal = float(account.cod_balance)
        items.append({
            "type": "COD_BALANCE_HIGH",
            "severity": "HIGH" if bal >= 1200 else "MEDIUM",
            "title": f"COD balance ₹{bal:.0f} — deposit required",
            "detail": (
                f"Your COD balance has exceeded ₹1200. Account is blocked. Deposit immediately."
                if bal >= 1200 else
                f"Your COD balance is ₹{bal:.0f}. Please deposit before it reaches ₹1200."
            ),
            "link": "/home",
            "age_minutes": 0,
        })

    items.sort(key=lambda x: (x["severity"] == "HIGH", x["age_minutes"]), reverse=True)
    return {"count": len(items), "items": items}


# ── Super-admin ───────────────────────────────────────────────────────────────

async def get_admin_attention(
    main_session: AsyncSession,
    delivery_session: AsyncSession,
    pharmacy_session: AsyncSession,
    haircut_session: AsyncSession | None = None,
) -> dict:
    """
    - Unassigned orders (READY_FOR_DELIVERY in pharmacy DB) > 10 min
    - Ghost drivers (is_online + GPS stale > 5 min) in delivery DB
    - Open disputes > 48 h in main DB
    - Open reconciliation exceptions > 24 h in main DB
    - Pharmacy products awaiting approval > 4 h in pharmacy DB
    - Haircut vendors awaiting approval > 4 h in haircut DB
    """
    from app.models.delivery import DeliveryAccount
    from app.models.dispute import Dispute
    from app.models.pharmacy_merchant import CustomerPharmacyOrder, PharmacyProduct, PharmacyProfile
    from app.models.reconciliation import ReconciliationException

    items = []
    now = datetime.now(UTC)
    now_naive = datetime.utcnow()  # for comparing against naive DB columns

    # ── Unassigned orders ──────────────────────────────────────────────────
    unassigned_cutoff = now_naive - timedelta(minutes=READY_NO_DRIVER_MIN)
    ph_result = await pharmacy_session.execute(
        select(CustomerPharmacyOrder).where(
            and_(
                CustomerPharmacyOrder.status == "READY_FOR_DELIVERY",
                CustomerPharmacyOrder.created_at <= unassigned_cutoff,
            )
        )
    )
    unassigned = ph_result.scalars().all()
    for o in unassigned:
        age = _age(o.created_at)
        ref = str(o.order_id)[:8].upper()
        items.append({
            "type": "UNASSIGNED_ORDER",
            "severity": "HIGH",
            "title": f"Order #{ref} — no driver for {age} min",
            "detail": f"This order has been ready for pickup for {age} minute(s) with no driver assigned.",
            "link": "/dashboard/delivery/orders",
            "age_minutes": age,
        })

    # ── Ghost drivers ──────────────────────────────────────────────────────
    stale_cutoff = now_naive - timedelta(minutes=STALE_GPS_MIN)
    dl_result = await delivery_session.execute(
        select(DeliveryAccount).where(
            and_(
                DeliveryAccount.is_online == True,
                DeliveryAccount.location_updated_at <= stale_cutoff,
            )
        )
    )
    ghosts = dl_result.scalars().all()
    for acc in ghosts:
        age = _age(acc.location_updated_at)
        items.append({
            "type": "GHOST_DRIVER",
            "severity": "MEDIUM",
            "title": f"Driver {acc.full_name} — GPS stale {age} min",
            "detail": f"Driver appears online but hasn't sent a location update in {age} minute(s). May be unreachable.",
            "link": f"/dashboard/delivery/boys/{acc.account_id}",
            "age_minutes": age,
        })

    # ── Stale disputes ─────────────────────────────────────────────────────
    dispute_cutoff = now_naive - timedelta(hours=DISPUTE_SLA_HOURS)
    d_result = await main_session.execute(
        select(Dispute).where(
            and_(
                Dispute.status == "OPEN",
                Dispute.created_at <= dispute_cutoff,
            )
        )
    )
    for d in d_result.scalars().all():
        age_h = max(0, int((now - (d.created_at.replace(tzinfo=UTC) if d.created_at.tzinfo is None else d.created_at)).total_seconds() / 3600))
        items.append({
            "type": "STALE_DISPUTE",
            "severity": "MEDIUM",
            "title": f"Dispute open for {age_h}h — SLA breached",
            "detail": f"Raised by {d.raised_by_name}. Has been OPEN for over {DISPUTE_SLA_HOURS} hours without admin response.",
            "link": f"/dashboard/disputes/{d.dispute_id}",
            "age_minutes": age_h * 60,
        })

    # ── Stale reconciliation exceptions ───────────────────────────────────
    recon_cutoff = now_naive - timedelta(hours=RECON_EXCEPTION_SLA_HOURS)
    r_result = await main_session.execute(
        select(ReconciliationException).where(
            and_(
                ReconciliationException.status == "OPEN",
                ReconciliationException.created_at <= recon_cutoff,
            )
        )
    )
    for ex in r_result.scalars().all():
        age_h = max(0, int((now - (ex.created_at.replace(tzinfo=UTC) if ex.created_at.tzinfo is None else ex.created_at)).total_seconds() / 3600))
        items.append({
            "type": "STALE_RECON_EXCEPTION",
            "severity": "MEDIUM",
            "title": f"Reconciliation exception open {age_h}h",
            "detail": f"Exception #{str(ex.exception_id)[:8].upper()} has been OPEN for over {RECON_EXCEPTION_SLA_HOURS} hours.",
            "link": "/dashboard/reconciliation",
            "age_minutes": age_h * 60,
        })

    # ── Pharmacy products awaiting approval ────────────────────────────────
    # PharmacyProduct.created_at is tz-aware, unlike the naive columns above.
    product_cutoff = now - timedelta(hours=PRODUCT_REVIEW_SLA_HOURS)
    p_result = await pharmacy_session.execute(
        select(PharmacyProduct, PharmacyProfile)
        .join(PharmacyProfile, PharmacyProfile.account_id == PharmacyProduct.account_id)
        .where(
            and_(
                PharmacyProduct.approval_status.in_(["PENDING_APPROVAL", "NEEDS_REVISION"]),
                PharmacyProduct.created_at <= product_cutoff,
            )
        )
    )
    for product, profile in p_result.all():
        age = _age(product.created_at)
        items.append({
            "type": "PENDING_PRODUCT_APPROVAL",
            "severity": "MEDIUM",
            "title": f"{product.product_name} — awaiting review {age} min",
            "detail": f"{profile.store_name} submitted this product and it's still {product.approval_status.replace('_', ' ').lower()}.",
            "link": f"/dashboard/pharmacy/products/review?product_id={product.product_id}",
            "age_minutes": age,
        })

    # ── Haircut vendors awaiting approval ──────────────────────────────────
    if haircut_session is not None:
        from app.models.haircut import HaircutVendorAccount

        vendor_cutoff = now - timedelta(hours=PRODUCT_REVIEW_SLA_HOURS)
        v_result = await haircut_session.execute(
            select(HaircutVendorAccount).where(
                and_(
                    HaircutVendorAccount.account_status == "pending",
                    HaircutVendorAccount.created_at <= vendor_cutoff,
                )
            )
        )
        for vendor in v_result.scalars().all():
            age = _age(vendor.created_at)
            items.append({
                "type": "PENDING_HAIRCUT_VENDOR_APPROVAL",
                "severity": "MEDIUM",
                "title": f"{vendor.full_name} — awaiting approval {age} min",
                "detail": "This haircut vendor registered and is still pending admin approval.",
                "link": "/haircut/shops",
                "age_minutes": age,
            })

    # Sort: HIGH first, then by age descending
    items.sort(key=lambda x: (x["severity"] != "HIGH", -x["age_minutes"]))
    return {"count": len(items), "items": items}
