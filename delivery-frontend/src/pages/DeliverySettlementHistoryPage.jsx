import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, IndianRupee, Package, Truck } from "lucide-react";
import { listMyDeliverySettlementBatches } from "../lib/api.js";

const STATUS_COLORS = {
  DRAFT: "#9ca3af",
  PENDING_APPROVAL: "#f59e0b",
  APPROVED: "#3b82f6",
  EXECUTED: "#10b981",
  REJECTED: "#ef4444",
  CANCELLED: "#6b7280",
};

const ALL_STATUSES = ["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "EXECUTED", "REJECTED", "CANCELLED"];

export function DeliverySettlementHistoryPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listMyDeliverySettlementBatches()
      .then(setBatches)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = filter === "ALL" ? batches : batches.filter((b) => b.status === filter);

  return (
    <div className="dl-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Settlement History</h1>
      </header>

      {/* Status filter chips */}
      <div className="dl-chip-row" style={{ overflowX: "auto", whiteSpace: "nowrap", padding: "12px 16px" }}>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            style={{
              display: "inline-block",
              marginRight: 8,
              padding: "6px 14px",
              borderRadius: 20,
              border: "none",
              background: filter === s ? "#1d4ed8" : "#e5e7eb",
              color: filter === s ? "#fff" : "#374151",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && <div className="dl-error">{error}</div>}
      {isLoading && <div className="dl-loading"><p>Loading…</p></div>}

      {!isLoading && !error && filtered.length === 0 && (
        <p className="dl-empty-hint">No settlement batches found.</p>
      )}

      <div style={{ padding: "0 16px 100px" }}>
        {filtered.map((b) => (
          <div
            key={b.batch_id}
            onClick={() => navigate(`/settlement/${b.batch_id}`)}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 12,
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                  {b.cycle_date ? new Date(b.cycle_date).toLocaleDateString() : "—"}
                </p>
                <p style={{ fontWeight: 600, fontSize: 15, margin: "4px 0 0" }}>
                  {b.stakeholder_name || "My Settlement"}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: STATUS_COLORS[b.status] || "#6b7280",
                    background: `${STATUS_COLORS[b.status]}20`,
                    padding: "3px 10px",
                    borderRadius: 10,
                  }}
                >
                  {b.status?.replace("_", " ")}
                </span>
                <p style={{ fontWeight: 700, fontSize: 16, margin: "6px 0 0", color: "#111827" }}>
                  ₹{Number(b.net_payable ?? 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/orders" className="dl-nav-item"><Package size={22} /><span>Orders</span></Link>
        <Link to="/earnings" className="dl-nav-item"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
