import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  IndianRupee,
  MapPin,
  Package,
  Truck,
  Wallet,
} from "lucide-react";
import {
  getDeliveryEarnings,
  getDeliveryOrders,
  getDeliveryRateConfig,
  requestDeliveryCashout,
} from "../lib/api.js";

const PERIODS = ["today", "week", "all"];
const PERIOD_LABEL = { today: "Today", week: "This Week", all: "All Time" };

function isSameDay(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isSameWeek(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString([], { day: "2-digit", month: "short" }) + " " + fmtTime(iso);
}

function timeTakenLabel(pickedUpAt, deliveredAt) {
  if (!pickedUpAt || !deliveredAt) return "—";
  const mins = Math.round((new Date(deliveredAt) - new Date(pickedUpAt)) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function OrderCard({ order }) {
  const cod = Number(order.cod_amount ?? 0);
  const earned = Number(order.earnings_amount ?? 0);
  const surrender = Math.max(0, cod - earned);
  const km = order.distance_km != null ? Number(order.distance_km).toFixed(1) : "—";
  const timeTaken = timeTakenLabel(order.picked_up_at, order.delivered_at);

  return (
    <div className="dl-order-earn-card">
      <div className="dl-order-earn-header">
        <span className="dl-order-earn-date">{fmtDateShort(order.accepted_at)}</span>
        <span className="dl-order-earn-km">{km} km · {timeTaken}</span>
        {order.surge_multiplier > 1 && (
          <span style={{ background: "#f59e0b", color: "#fff", fontSize: "0.65rem", padding: "1px 6px", borderRadius: 99, fontWeight: 700, marginLeft: 4 }}>
            ⚡ {Number(order.surge_multiplier).toFixed(2)}× {order.surge_label ? `(${order.surge_label})` : "surge"}
          </span>
        )}
      </div>
      <div className="dl-order-earn-locations">
        <div className="dl-order-earn-loc">
          <MapPin size={13} style={{ color: "#10b981", flexShrink: 0 }} />
          <span>{order.source_address || "—"}</span>
        </div>
        <div className="dl-order-earn-loc">
          <MapPin size={13} style={{ color: "#ef4444", flexShrink: 0 }} />
          <span>{order.customer_address || "—"}</span>
        </div>
      </div>
      <div className="dl-order-earn-money">
        <div className="dl-order-earn-money-row">
          <span>COD collected</span>
          <strong>₹{cod.toFixed(2)}</strong>
        </div>
        <div className="dl-order-earn-money-row" style={{ color: "#10b981" }}>
          <span>You earned</span>
          <strong>₹{earned.toFixed(2)}</strong>
        </div>
        {surrender > 0 && (
          <div className="dl-order-earn-money-row" style={{ color: "#f59e0b" }}>
            <span>Surrender to Thean</span>
            <strong>₹{surrender.toFixed(2)}</strong>
          </div>
        )}
      </div>
      <div className="dl-order-earn-times">
        <div><label>Assigned</label><span>{fmtTime(order.accepted_at)}</span></div>
        <div><label>Pickup</label><span>{fmtTime(order.picked_up_at)}</span></div>
        <div><label>Delivered</label><span>{fmtTime(order.delivered_at)}</span></div>
      </div>
    </div>
  );
}

export function EarningsPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [rateConfig, setRateConfig] = useState(null);
  const [orders, setOrders] = useState([]);
  const [period, setPeriod] = useState("today");
  const [isLoading, setIsLoading] = useState(true);
  const [showCashout, setShowCashout] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [isCashing, setIsCashing] = useState(false);
  const [error, setError] = useState("");
  const [cashoutMsg, setCashoutMsg] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setIsLoading(true);
    try {
      const [data, rate, allOrders] = await Promise.all([
        getDeliveryEarnings(),
        getDeliveryRateConfig(),
        getDeliveryOrders(),
      ]);
      setSummary(data);
      setRateConfig(rate);
      const delivered = (allOrders || [])
        .filter((o) => o.status === "DELIVERED" && o.picked_up_at)
        .sort((a, b) => new Date(b.picked_up_at) - new Date(a.picked_up_at));
      setOrders(delivered);
    } catch (e) { setError(e.message); } finally { setIsLoading(false); }
  }

  async function handleCashout(e) {
    e.preventDefault();
    const amt = Number(cashoutAmount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    if (!upiId.trim()) { setError("Enter your UPI ID."); return; }
    setIsCashing(true); setError("");
    try {
      await requestDeliveryCashout(amt, upiId.trim());
      setCashoutMsg(`₹${amt.toFixed(2)} cashout requested to ${upiId.trim()}. Processed within 24h.`);
      setShowCashout(false);
      setCashoutAmount(""); setUpiId("");
      await load();
    } catch (err) { setError(err.message); } finally { setIsCashing(false); }
  }

  const todayOrders = orders.filter((o) => isSameDay(o.picked_up_at));
  const todayEarned = todayOrders.reduce((s, o) => s + Number(o.earnings_amount ?? 0), 0);
  const todayCod = todayOrders.reduce((s, o) => s + Number(o.cod_amount ?? 0), 0);
  const todaySurrender = Math.max(0, todayCod - todayEarned);

  const filteredOrders = orders.filter((o) => {
    if (period === "today") return isSameDay(o.picked_up_at);
    if (period === "week") return isSameWeek(o.picked_up_at);
    return true;
  });

  if (isLoading) return <div className="dl-page dl-loading"><p>Loading…</p></div>;

  const w = summary?.wallet;

  return (
    <div className="dl-page dl-earnings-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h1>Earnings</h1>
      </header>

      {error ? <div className="dl-error">{error}</div> : null}
      {cashoutMsg ? <div className="dl-success">{cashoutMsg}</div> : null}

      {/* Today at-a-glance */}
      <div className="dl-today-summary">
        <div className="dl-today-card">
          <p>Today earned</p>
          <strong>₹{todayEarned.toFixed(2)}</strong>
        </div>
        <div className="dl-today-card">
          <p>COD collected</p>
          <strong>₹{todayCod.toFixed(2)}</strong>
        </div>
        <div className="dl-today-card">
          <p>To surrender</p>
          <strong>₹{todaySurrender.toFixed(2)}</strong>
        </div>
        <div className="dl-today-card">
          <p>Deliveries</p>
          <strong>{todayOrders.length}</strong>
        </div>
      </div>

      {/* Wallet card */}
      {w ? (
        <div className="dl-wallet-card">
          <div className="dl-wallet-header">
            <Wallet size={24} />
            <div>
              <p className="dl-wallet-label">Wallet Balance</p>
              <h2 className="dl-wallet-balance">₹{Number(w.balance).toFixed(2)}</h2>
            </div>
          </div>
          <div className="dl-wallet-stats">
            <div><span>Total Earned</span><strong>₹{Number(w.total_earned).toFixed(2)}</strong></div>
            <div><span>Withdrawn</span><strong>₹{Number(w.total_withdrawn).toFixed(2)}</strong></div>
          </div>
          {rateConfig && (
            <p className="dl-rate-inline">Rate: ₹{parseFloat(rateConfig.rate_per_km).toFixed(2)}/km</p>
          )}
          <button
            className="dl-btn dl-btn-cashout"
            type="button"
            disabled={Number(w.balance) <= 0}
            onClick={() => setShowCashout(!showCashout)}
          >
            <IndianRupee size={16} /> Cash Out
          </button>
          {showCashout ? (
            <form className="dl-cashout-form" onSubmit={handleCashout}>
              <label>
                Amount (₹)
                <input type="number" min="1" step="0.01" placeholder="100.00" value={cashoutAmount} onChange={(e) => setCashoutAmount(e.target.value)} />
              </label>
              <label>
                UPI ID
                <input type="text" placeholder="name@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
              </label>
              <button className="dl-btn" type="submit" disabled={isCashing}>{isCashing ? "Processing…" : "Request Cashout"}</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Order list with period filter */}
      <div className="dl-period-tabs">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className={`dl-period-tab${period === p ? " dl-period-tab-active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {filteredOrders.length > 0 ? (
        <div className="dl-order-earn-list">
          {filteredOrders.map((o) => (
            <OrderCard key={o.delivery_order_id} order={o} />
          ))}
        </div>
      ) : (
        <p className="dl-empty-hint">No completed deliveries {period === "all" ? "yet" : "in this period"}.</p>
      )}

      {/* Bottom nav */}
      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/orders" className="dl-nav-item"><Package size={22} /><span>Orders</span></Link>
        <Link to="/earnings" className="dl-nav-item dl-nav-active"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
