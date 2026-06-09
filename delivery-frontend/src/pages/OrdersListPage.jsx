import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IndianRupee, Navigation, Package, RefreshCw, Truck } from "lucide-react";
import { getDeliveryOrders } from "../lib/api.js";

const STATUS_COLORS = {
  ASSIGNED_TO_DELIVERY: "#fbbf24",
  DELIVERY_ACCEPTED: "#3b82f6",
  ARRIVED_AT_STORE: "#8b5cf6",
  ORDER_PICKED_UP: "#0ea5e9",
  ARRIVED_AT_CUSTOMER: "#f97316",
  DELIVERED: "#22c55e",
  DELIVERY_REJECTED: "#ef4444",
  DELIVERY_CANCELLED: "#6b7280",
};

const STATUS_LABELS = {
  ASSIGNED_TO_DELIVERY: "Assigned",
  DELIVERY_ACCEPTED: "Accepted",
  ARRIVED_AT_STORE: "At Pharmacy",
  ORDER_PICKED_UP: "Picked Up",
  ARRIVED_AT_CUSTOMER: "At Customer",
  DELIVERED: "Delivered",
  DELIVERY_REJECTED: "Rejected",
  DELIVERY_CANCELLED: "Cancelled",
};

export function OrdersListPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setIsLoading(true);
    setError("");
    getDeliveryOrders()
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="dl-page dl-orders-page">
      <header className="dl-inner-header">
        <h1>My Orders</h1>
      </header>

      {isLoading ? (
        <div className="dl-loading"><RefreshCw size={24} className="dl-spin" /><p>Loading…</p></div>
      ) : error ? (
        <div className="dl-loading" style={{ flexDirection: "column", gap: "0.75rem" }}>
          <div className="dl-error">{error}</div>
          <button type="button" className="dl-btn" onClick={load}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="dl-no-order-card">
          <Package size={36} />
          <p>No delivery orders yet.</p>
          <p style={{ fontSize: "0.85em", color: "#9ca3af", marginTop: "0.35rem" }}>
            Orders will appear here once you start accepting deliveries.
          </p>
        </div>
      ) : (
        <div className="dl-orders-list">
          {orders.map((o) => (
            <Link key={o.delivery_order_id} to={`/order/${o.delivery_order_id}`} className="dl-order-card">
              <div className="dl-order-card-top">
                <span className="dl-order-status-badge" style={{ background: `${STATUS_COLORS[o.status]}22`, color: STATUS_COLORS[o.status], borderColor: STATUS_COLORS[o.status] }}>
                  {STATUS_LABELS[o.status] || o.status}
                </span>
                <span className="dl-order-earning">₹{o.earnings_amount ? Number(o.earnings_amount).toFixed(0) : "0"}</span>
              </div>
              <div className="dl-order-card-route">
                <span>🏪 {o.source_name || "Pharmacy"}</span>
                <span className="dl-route-arrow">→</span>
                <span>🏠 {o.customer_name || "Customer"}</span>
              </div>
              <div className="dl-order-card-meta">
                <span><Navigation size={13} /> {o.distance_km ? `${Number(o.distance_km).toFixed(1)} km` : "—"}</span>
                {/* toLocaleString() shows both date and time */}
                <span>{new Date(o.created_at).toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/orders" className="dl-nav-item dl-nav-active"><Package size={22} /><span>Orders</span></Link>
        <Link to="/earnings" className="dl-nav-item"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
