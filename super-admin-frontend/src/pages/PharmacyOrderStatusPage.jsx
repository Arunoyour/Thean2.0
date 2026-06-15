import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { getPharmacyOrderStatusBuckets } from "../lib/api.js";

const REFRESH_INTERVAL_MS = 30_000;

function elapsed(iso) {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function OrderCard({ order, urgencyMinutes }) {
  const navigate = useNavigate();
  const ageMs = Date.now() - new Date(order.assigned_at || order.created_at).getTime();
  const ageMins = Math.floor(ageMs / 60000);
  const isUrgent = urgencyMinutes != null && ageMins >= urgencyMinutes;

  return (
    <div
      className={`order-status-card ${isUrgent ? "order-status-card--urgent" : ""}`}
      onClick={() => navigate(`/dashboard/pharmacy/orders`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/dashboard/pharmacy/orders`)}
    >
      <div className="order-status-card-header">
        <span className="order-status-card-id">#{String(order.order_id).slice(0, 8).toUpperCase()}</span>
        {isUrgent && <span className="badge badge-red">Urgent</span>}
      </div>
      <div className="order-status-card-pharmacy">{order.pharmacy_name || "Unknown pharmacy"}</div>
      <div className="order-status-card-meta">
        <span>Waiting {elapsed(order.assigned_at || order.created_at)}</span>
        {order.pharmacy_city && <span>{order.pharmacy_city}</span>}
      </div>
    </div>
  );
}

function Bucket({ icon: Icon, title, subtitle, orders, color, urgencyMinutes }) {
  return (
    <section className="order-status-bucket">
      <header className="order-status-bucket-header" style={{ borderColor: color }}>
        <Icon size={20} color={color} aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="order-status-bucket-count" style={{ background: color }}>{orders.length}</span>
      </header>
      <div className="order-status-bucket-body">
        {orders.length === 0 ? (
          <p className="order-status-empty">No orders in this state</p>
        ) : (
          orders.map((o) => (
            <OrderCard key={o.order_id} order={o} urgencyMinutes={urgencyMinutes} />
          ))
        )}
      </div>
    </section>
  );
}

export function PharmacyOrderStatusPage() {
  const navigate = useNavigate();
  const [buckets, setBuckets] = useState({ unaccepted: [], pending_from_pharmacy: [], pending_pickup: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  async function load() {
    try {
      const data = await getPharmacyOrderStatusBuckets();
      setBuckets(data);
      setLastRefresh(new Date());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  const total = buckets.unaccepted.length + buckets.pending_from_pharmacy.length + buckets.pending_pickup.length;

  return (
    <div className="page-root">
      <header className="portal-header">
        <button className="icon-button" type="button" onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="eyebrow">Pharmacy Operations</p>
          <h1>Live Order Status Board</h1>
          <p>{total} orders need attention · refreshes every 30s</p>
        </div>
        <button className="outline-button" type="button" onClick={load} disabled={isLoading}>
          <RefreshCw size={16} className={isLoading ? "spin" : ""} aria-hidden="true" />
          {lastRefresh ? `Updated ${elapsed(lastRefresh.toISOString())}` : "Refresh"}
        </button>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {isLoading && !lastRefresh ? (
        <p className="loading-text">Loading order status…</p>
      ) : (
        <div className="order-status-grid">
          <Bucket
            icon={Clock}
            title="Unaccepted"
            subtitle="Assigned to a pharmacy but not yet accepted"
            orders={buckets.unaccepted}
            color="#f59e0b"
            urgencyMinutes={10}
          />
          <Bucket
            icon={PackageCheck}
            title="Pending from Pharmacy"
            subtitle="Accepted but not marked ready for pickup"
            orders={buckets.pending_from_pharmacy}
            color="#3b82f6"
            urgencyMinutes={15}
          />
          <Bucket
            icon={Truck}
            title="Pending Pickup"
            subtitle="Ready but no delivery boy assigned yet"
            orders={buckets.pending_pickup}
            color="#8b5cf6"
            urgencyMinutes={null}
          />
        </div>
      )}
    </div>
  );
}
