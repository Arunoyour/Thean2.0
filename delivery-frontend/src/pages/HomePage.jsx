import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  Bike,
  CheckCircle2,
  Clock3,
  IndianRupee,
  LogOut,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Truck,
  XCircle,
} from "lucide-react";
import {
  acceptDeliveryOrder,
  getActiveDeliveryOrder,
  getDeliveryMe,
  getDeliveryToken,
  logoutDelivery,
  rejectDeliveryOrder,
  setDeliveryAvailability,
  updateDeliveryLocation,
} from "../lib/api.js";

const STATUS_LABELS = {
  ASSIGNED_TO_DELIVERY: "New Order",
  DELIVERY_ACCEPTED: "Accepted — Head to Store",
  ARRIVED_AT_STORE: "At Store — Awaiting Pickup PIN",
  ORDER_PICKED_UP: "Order Collected — En Route to Customer",
  ARRIVED_AT_CUSTOMER: "At Customer — Awaiting Delivery PIN",
  DELIVERED: "Delivered ✓",
};

const COD_WARN = 1000;
const COD_BLOCK = 1200;

function formatCountdown(secs) {
  const s = Math.max(0, secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── COD Blocked Screen ────────────────────────────────────────────────────
function CodBlockedScreen({ balance, onLogout }) {
  return (
    <div className="dl-page dl-blocked-page">
      <div className="dl-blocked-card">
        <AlertOctagon size={56} className="dl-blocked-icon" />
        <h1>Account Blocked</h1>
        <p className="dl-blocked-amount">₹{Number(balance).toFixed(0)}</p>
        <p className="dl-blocked-label">Cash collected — pending deposit</p>
        <div className="dl-blocked-msg">
          <p>
            You are holding <strong>₹{Number(balance).toFixed(0)}</strong> in COD cash
            which exceeds the allowed limit of <strong>₹{COD_BLOCK}</strong>.
          </p>
          <p>
            Please hand over this amount to the organisation <strong>immediately</strong> to
            unblock your account and resume deliveries.
          </p>
          <p>Contact your supervisor or visit the nearest hub to clear the payment.</p>
        </div>
        <button className="dl-btn dl-btn-reject" type="button" onClick={onLogout}>
          <LogOut size={16} /> Logout
        </button>
      </div>
    </div>
  );
}

// ── COD Warning Banner ────────────────────────────────────────────────────
function CodWarningBanner({ balance }) {
  return (
    <div className="dl-cod-warning">
      <AlertTriangle size={18} />
      <div>
        <strong>COD Alert — ₹{Number(balance).toFixed(0)} collected</strong>
        <p>You are approaching the ₹{COD_BLOCK} limit. Please deposit cash soon.</p>
      </div>
    </div>
  );
}

// ── New order popup ───────────────────────────────────────────────────────
function NewOrderPopup({ order, onAccept, onReject }) {
  const [now, setNow] = useState(Date.now());
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const secsLeft = order.accept_deadline_at
    ? Math.max(0, Math.ceil((new Date(order.accept_deadline_at).getTime() - now) / 1000))
    : 90;
  const progress = Math.min(100, (secsLeft / 90) * 100);
  const urgent = secsLeft < 30;

  return (
    <div className="dl-popup-overlay">
      <div className={`dl-new-order-popup ${urgent ? "dl-popup-urgent" : ""}`}>
        <div className="dl-popup-header">
          <Package size={28} />
          <h2>New Delivery Request</h2>
        </div>
        <div className="dl-countdown-ring" style={{ "--progress": `${progress}%` }}>
          <span className={urgent ? "dl-countdown-urgent" : ""}>{formatCountdown(secsLeft)}</span>
        </div>
        <div className="dl-popup-details">
          <div className="dl-popup-row">
            <MapPin size={18} className="dl-icon-pickup" />
            <div>
              <div className="dl-popup-label">Pickup</div>
              <div className="dl-popup-value">{order.source_name || "Store"}</div>
              {order.source_address ? <div className="dl-popup-sub">{order.source_address}</div> : null}
            </div>
          </div>
          <div className="dl-popup-row">
            <MapPin size={18} className="dl-icon-dropoff" />
            <div>
              <div className="dl-popup-label">Drop-off</div>
              <div className="dl-popup-value">{order.customer_name || "Customer"}</div>
              {order.customer_address ? <div className="dl-popup-sub">{order.customer_address}</div> : null}
            </div>
          </div>
          <div className="dl-popup-metrics">
            <div className="dl-popup-metric">
              <Navigation size={16} />
              <span>{order.distance_km ? `${Number(order.distance_km).toFixed(1)} km` : "—"}</span>
            </div>
            <div className="dl-popup-metric dl-metric-earn">
              <IndianRupee size={16} />
              <span>₹{order.earnings_amount ? Number(order.earnings_amount).toFixed(0) : "—"}</span>
              <small>earn</small>
            </div>
            {order.cod_amount > 0 && (
              <div className="dl-popup-metric dl-metric-cod">
                <span>💵</span>
                <span>₹{Number(order.cod_amount).toFixed(0)}</span>
                <small>COD</small>
              </div>
            )}
          </div>
        </div>
        <div className="dl-popup-actions">
          <button
            className="dl-btn dl-btn-accept"
            type="button"
            disabled={accepting || secsLeft === 0}
            onClick={async () => { setAccepting(true); await onAccept(); }}
          >
            <CheckCircle2 size={20} /> Accept
          </button>
          <button className="dl-btn dl-btn-reject" type="button" onClick={onReject}>
            <XCircle size={20} /> Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export function HomePage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [newOrderData, setNewOrderData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState("");
  const [codWarning, setCodWarning] = useState(null); // WS-pushed warning message
  const watchIdRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  // Geolocation watch
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { updateDeliveryLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // WebSocket
  useEffect(() => {
    const token = getDeliveryToken();
    if (!token) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host.replace("5176", "8000")}/api/v1/ws/delivery?token=${encodeURIComponent(token)}`,
    );
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "new_delivery_assignment") {
        setNewOrderData({
          delivery_order_id: msg.delivery_order_id,
          source_name: msg.source_name,
          distance_km: msg.distance_km,
          earnings_amount: msg.estimated_earnings,
          cod_amount: msg.cod_amount || 0,
          accept_deadline_at: msg.accept_deadline_at,
          pickup_lat: msg.pickup_lat,
          pickup_lng: msg.pickup_lng,
          dropoff_lat: msg.dropoff_lat,
          dropoff_lng: msg.dropoff_lng,
          status: "ASSIGNED_TO_DELIVERY",
        });
      } else if (msg.type === "account_disabled") {
        logoutDelivery();
        navigate("/login");
      } else if (msg.type === "cod_blocked") {
        // Reload account so cod_blocked flag is reflected
        setAccount((prev) => prev ? { ...prev, cod_balance: msg.cod_balance, cod_blocked: true, is_online: false } : prev);
      } else if (msg.type === "cod_unblocked") {
        setAccount((prev) => prev ? { ...prev, cod_balance: msg.cod_balance, cod_blocked: false } : prev);
        setCodWarning(null);
      } else if (msg.type === "cod_warning" || msg.type === "cod_blocked_reminder") {
        setAccount((prev) => prev ? { ...prev, cod_balance: msg.cod_balance } : prev);
        setCodWarning(msg.message);
      }
    };
    socket.onerror = () => {};
    return () => socket.close();
  }, [navigate]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [acc, active] = await Promise.all([getDeliveryMe(), getActiveDeliveryOrder()]);
      setAccount(acc);
      setActiveOrder(active);
    } catch (e) {
      if (e.message.includes("login")) navigate("/login");
      else setError(e.message);
    } finally { setIsLoading(false); }
  }

  async function toggleAvailability() {
    if (!account) return;
    setIsToggling(true);
    try {
      const updated = await setDeliveryAvailability(!account.is_online);
      setAccount(updated);
    } catch (e) { setError(e.message); } finally { setIsToggling(false); }
  }

  async function handleAcceptPopup() {
    if (!newOrderData) return;
    try {
      const updated = await acceptDeliveryOrder(newOrderData.delivery_order_id);
      setActiveOrder(updated);
      setNewOrderData(null);
    } catch (e) { setError(e.message); }
  }

  async function handleRejectPopup() {
    if (!newOrderData) return;
    try {
      await rejectDeliveryOrder(newOrderData.delivery_order_id);
      setNewOrderData(null);
    } catch (e) { setError(e.message); }
  }

  function handleLogout() {
    logoutDelivery();
    navigate("/login");
  }

  if (isLoading) {
    return (
      <div className="dl-page dl-loading">
        <RefreshCw size={28} className="dl-spin" />
        <p>Loading…</p>
      </div>
    );
  }

  // COD blocked — show full-screen blocker
  if (account?.cod_blocked) {
    return <CodBlockedScreen balance={account.cod_balance} onLogout={handleLogout} />;
  }

  const isOnline = account?.is_online ?? false;
  const codBal = account?.cod_balance ?? 0;
  const showCodWarn = codBal >= COD_WARN;

  return (
    <div className="dl-page">
      {/* Header */}
      <header className="dl-header">
        <div className="dl-header-left">
          <Bike size={24} />
          <div>
            <p className="dl-header-name">{account?.full_name || "Driver"}</p>
            <p className="dl-header-vehicle">{account?.vehicle_type} · {account?.vehicle_number || "—"}</p>
          </div>
        </div>
        <div className="dl-header-right">
          {codBal > 0 && (
            <div className={`dl-cod-chip ${showCodWarn ? "dl-cod-chip-warn" : ""}`}>
              <IndianRupee size={12} />
              <span>{Number(codBal).toFixed(0)} COD</span>
            </div>
          )}
          <button className="dl-icon-btn" type="button" onClick={handleLogout} title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* COD warning banner */}
      {showCodWarn && <CodWarningBanner balance={codBal} />}

      {/* WS pushed warning (periodic reminders) */}
      {codWarning && !showCodWarn && (
        <div className="dl-cod-warning">
          <AlertTriangle size={18} />
          <p>{codWarning}</p>
          <button className="dl-cod-warn-close" onClick={() => setCodWarning(null)}>✕</button>
        </div>
      )}

      {error ? <div className="dl-error">{error}</div> : null}

      {/* Availability toggle */}
      <div className={`dl-availability-card ${isOnline ? "dl-available" : "dl-offline"}`}>
        <div>
          <h2>{isOnline ? "You are Online" : "You are Offline"}</h2>
          <p>{isOnline ? "Ready to receive delivery requests" : "Go online to start accepting orders"}</p>
        </div>
        <button
          className={`dl-toggle ${isOnline ? "dl-toggle-on" : ""}`}
          type="button"
          disabled={isToggling}
          onClick={toggleAvailability}
          aria-label={isOnline ? "Go Offline" : "Go Online"}
        >
          {isOnline ? <ToggleRight size={44} /> : <ToggleLeft size={44} />}
        </button>
      </div>

      {/* Active order */}
      {activeOrder && activeOrder.status !== "DELIVERED" ? (
        <div className="dl-active-order-card">
          <div className="dl-active-order-header">
            <Truck size={20} />
            <h3>Active Delivery</h3>
            <span className="dl-status-chip">{STATUS_LABELS[activeOrder.status] || activeOrder.status}</span>
          </div>
          <div className="dl-active-order-info">
            <div className="dl-aoi-row">
              <MapPin size={15} className="dl-icon-pickup" />
              <span>{activeOrder.source_name || "Store"}</span>
            </div>
            <div className="dl-aoi-row">
              <MapPin size={15} className="dl-icon-dropoff" />
              <span>{activeOrder.customer_name || "Customer"}</span>
            </div>
            <div className="dl-aoi-earnings">
              <IndianRupee size={14} />
              ₹{activeOrder.earnings_amount ? Number(activeOrder.earnings_amount).toFixed(0) : "—"}&nbsp;earn
              {activeOrder.cod_amount > 0 && (
                <span className="dl-cod-badge"> · 💵 ₹{Number(activeOrder.cod_amount).toFixed(0)} COD</span>
              )}
              &nbsp;· {activeOrder.distance_km ? `${Number(activeOrder.distance_km).toFixed(1)} km` : "—"}
            </div>
          </div>
          <div className="dl-active-order-actions">
            <Link className="dl-btn dl-btn-nav" to={`/navigate/${activeOrder.delivery_order_id}`}>
              <Navigation size={16} /> Navigate
            </Link>
            <Link className="dl-btn dl-btn-secondary" to={`/order/${activeOrder.delivery_order_id}`}>
              <Package size={16} /> Details
            </Link>
            <Link className="dl-btn dl-btn-secondary" to={`/chat/${activeOrder.delivery_order_id}`}>
              💬 Chat
            </Link>
          </div>
        </div>
      ) : !activeOrder ? (
        <div className="dl-no-order-card">
          <Package size={36} />
          <p>{isOnline ? "Waiting for delivery requests…" : "Go online to receive orders"}</p>
        </div>
      ) : null}

      {/* Bottom nav */}
      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item dl-nav-active">
          <Truck size={22} /><span>Home</span>
        </Link>
        <Link to="/orders" className="dl-nav-item">
          <Package size={22} /><span>Orders</span>
        </Link>
        <Link to="/earnings" className="dl-nav-item">
          <IndianRupee size={22} /><span>Earnings</span>
        </Link>
      </nav>

      {newOrderData ? (
        <NewOrderPopup order={newOrderData} onAccept={handleAcceptPopup} onReject={handleRejectPopup} />
      ) : null}
    </div>
  );
}
