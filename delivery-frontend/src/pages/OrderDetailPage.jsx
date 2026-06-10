import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  IndianRupee,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Truck,
} from "lucide-react";
import { advanceDeliveryStatus, getDeliveryOrders } from "../lib/api.js";

const STATUS_LABELS = {
  DELIVERY_ACCEPTED: "Accepted",
  ARRIVED_AT_STORE: "Arrived at Pharmacy",
  ORDER_PICKED_UP: "Order Picked Up",
  ARRIVED_AT_CUSTOMER: "Arrived at Customer",
  DELIVERED: "Delivered",
  DELIVERY_REJECTED: "Rejected",
};

const STEPS = [
  { key: "DELIVERY_ACCEPTED", label: "Accepted" },
  { key: "ARRIVED_AT_STORE", label: "At Pharmacy" },
  { key: "ORDER_PICKED_UP", label: "Picked Up" },
  { key: "ARRIVED_AT_CUSTOMER", label: "At Customer" },
  { key: "DELIVERED", label: "Delivered" },
];

const NEXT_TRANSITIONS = {
  DELIVERY_ACCEPTED: { next: "ARRIVED_AT_STORE", label: "Mark Arrived at Pharmacy", pin: false },
  ARRIVED_AT_STORE: { next: "ORDER_PICKED_UP", label: "Enter Pickup PIN to Confirm", pin: true, pinLabel: "Pickup PIN" },
  ORDER_PICKED_UP: { next: "ARRIVED_AT_CUSTOMER", label: "Mark Arrived at Customer", pin: false },
  ARRIVED_AT_CUSTOMER: { next: "DELIVERED", label: "Enter Delivery PIN to Confirm", pin: true, pinLabel: "Delivery PIN" },
};

export function OrderDetailPage() {
  const { deliveryOrderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    loadOrder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryOrderId]);

  async function loadOrder() {
    setIsLoading(true);
    setError("");
    try {
      const orders = await getDeliveryOrders();
      const found = orders.find((o) => o.delivery_order_id === deliveryOrderId);
      if (found) {
        setOrder(found);
      } else {
        // Order exists but isn't in the list (e.g. wrong ID)
        setOrder(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAdvance() {
    if (!order) return;
    const transition = NEXT_TRANSITIONS[order.status];
    if (!transition) return;
    if (transition.pin && !pin) { setShowPin(true); return; }
    setIsAdvancing(true); setError("");
    try {
      const updated = await advanceDeliveryStatus(deliveryOrderId, pin || null);
      setOrder(updated);
      setPin(""); setShowPin(false);
      if (updated.status === "DELIVERED") navigate("/home");
    } catch (e) { setError(e.message); } finally { setIsAdvancing(false); }
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === order?.status);

  if (isLoading) {
    return (
      <div className="dl-page dl-loading">
        <RefreshCw size={28} className="dl-spin" />
        <p>Loading…</p>
      </div>
    );
  }

  // Order not found — allow retry and back navigation
  if (!order) {
    return (
      <div className="dl-page dl-loading" style={{ gap: "1rem" }}>
        {error
          ? <div className="dl-error">{error}</div>
          : <p>Order not found.</p>}
        <button type="button" className="dl-btn" onClick={loadOrder}>
          <RefreshCw size={16} /> Retry
        </button>
        <button type="button" className="dl-text-btn" onClick={() => navigate(-1)}>
          ← Go back
        </button>
      </div>
    );
  }

  const transition = NEXT_TRANSITIONS[order.status];

  return (
    <div className="dl-page dl-detail-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h1>Order Details</h1>
      </header>

      {error ? <div className="dl-error">{error}</div> : null}

      {/* Progress steps */}
      <div className="dl-progress-steps">
        {STEPS.map((step, i) => (
          <div key={step.key} className={`dl-progress-step ${i < currentStepIndex ? "dl-step-done" : i === currentStepIndex ? "dl-step-current" : ""}`}>
            <div className="dl-step-dot">{i < currentStepIndex ? <CheckCircle2 size={14} /> : i + 1}</div>
            <p>{step.label}</p>
          </div>
        ))}
      </div>

      {/* Addresses */}
      <div className="dl-detail-card">
        <div className="dl-addr-row">
          <MapPin size={18} className="dl-icon-pickup" />
          <div>
            <div className="dl-addr-label">Pickup — {order.source_name || "Pharmacy"}</div>
            {order.source_address ? <div className="dl-addr-sub">{order.source_address}</div> : null}
          </div>
        </div>
        <div className="dl-addr-divider" />
        <div className="dl-addr-row">
          <MapPin size={18} className="dl-icon-dropoff" />
          <div>
            <div className="dl-addr-label">Drop-off — {order.customer_name || "Customer"}</div>
            {order.customer_address ? <div className="dl-addr-sub">{order.customer_address}</div> : null}
          </div>
        </div>
      </div>

      {/* Earnings */}
      <div className="dl-earnings-strip">
        <div><IndianRupee size={16} /> ₹{order.earnings_amount ? Number(order.earnings_amount).toFixed(2) : "0"}</div>
        <div><Navigation size={16} /> {order.distance_km ? `${Number(order.distance_km).toFixed(1)} km` : "—"}</div>
        <div><Truck size={16} /> {order.vehicle_type || ""}</div>
      </div>

      {/* Pickup PIN (shown while at pharmacy or after picking up — needed until delivery) */}
      {(order.status === "ARRIVED_AT_STORE" || order.status === "ORDER_PICKED_UP") && order.pickup_pin ? (
        <div className="dl-pin-display dl-pickup-pin">
          <Package size={16} />
          <span>Pickup PIN: </span>
          <strong>{order.pickup_pin}</strong>
          <small>(Show to pharmacy)</small>
        </div>
      ) : null}

      {/* Call customer — shown once order is picked up */}
      {order.customer_phone &&
       ["ORDER_PICKED_UP", "ARRIVED_AT_CUSTOMER", "DELIVERED"].includes(order.status) ? (
        <a
          href={`tel:${order.customer_phone}`}
          className="dl-call-customer-btn"
          aria-label={`Call ${order.customer_name || "customer"}`}
        >
          <Phone size={18} />
          Call Customer
          {order.customer_name ? ` · ${order.customer_name}` : ""}
        </a>
      ) : null}

      {/* PIN input */}
      {showPin && transition?.pin ? (
        <div className="dl-pin-input-area">
          <label>
            {transition.pinLabel}
            <input type="text" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="0000" autoFocus className="dl-pin-field" />
          </label>
        </div>
      ) : null}

      {/* Action button */}
      {transition && order.status !== "DELIVERED" ? (
        <button className="dl-btn dl-btn-advance" type="button" disabled={isAdvancing} onClick={handleAdvance}>
          {isAdvancing ? "Updating…" : (showPin ? `Confirm ${transition.pinLabel}` : transition.label)}
        </button>
      ) : order.status === "DELIVERED" ? (
        <div className="dl-delivered-badge">
          <CheckCircle2 size={24} /> Order Delivered Successfully
        </div>
      ) : null}

      <div className="dl-detail-nav-row">
        <Link className="dl-btn dl-btn-nav" to={`/navigate/${deliveryOrderId}`}>
          <Navigation size={16} /> Open Navigation
        </Link>
        <Link className="dl-btn dl-btn-secondary" to={`/chat/${deliveryOrderId}`}>
          💬 Chat with Customer
        </Link>
      </div>
    </div>
  );
}
