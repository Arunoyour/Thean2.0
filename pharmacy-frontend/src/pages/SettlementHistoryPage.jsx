import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, RefreshCw } from "lucide-react";
import { listMySettlementBatches } from "../lib/api.js";

const STATUS_COLORS = {
  DRAFT:            "#6b7280",
  PENDING_APPROVAL: "#d97706",
  APPROVED:         "#2563eb",
  EXECUTED:         "#16a34a",
  REJECTED:         "#dc2626",
  NEEDS_CORRECTION: "#7c3aed",
  CANCELLED:        "#9ca3af",
};

const FILTER_OPTIONS = ["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "EXECUTED", "REJECTED"];

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 99,
      fontSize: "0.72rem", fontWeight: 700,
      background: color + "18", color, border: `1px solid ${color}40`,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function SettlementHistoryPage() {
  const navigate = useNavigate();
  const [batches, setBatches]     = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  async function load(filter) {
    setIsLoading(true);
    setError("");
    try {
      const data = await listMySettlementBatches({
        statusFilter: filter === "ALL" ? undefined : filter,
        limit: 50,
      });
      setBatches(Array.isArray(data) ? data : data.batches ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(statusFilter); }, []);

  function changeFilter(f) {
    setStatusFilter(f);
    load(f);
  }

  const fmt = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: "1.25rem 1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Finance</p>
          <h1 style={{ margin: "0.2rem 0 0", fontSize: "1.4rem", fontWeight: 700 }}>Settlement History</h1>
        </div>
        <button
          onClick={() => load(statusFilter)}
          style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#374151" }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {FILTER_OPTIONS.map(f => (
          <button
            key={f}
            onClick={() => changeFilter(f)}
            style={{
              padding: "4px 12px", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
              background: statusFilter === f ? "#111827" : "#fff",
              color: statusFilter === f ? "#fff" : "#374151",
              border: `1px solid ${statusFilter === f ? "#111827" : "#e5e7eb"}`,
            }}>
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.75rem 1rem", color: "#dc2626", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {isLoading && (
        <p style={{ color: "#6b7280", textAlign: "center", padding: "2rem" }}>Loading settlements…</p>
      )}

      {!isLoading && batches.length === 0 && !error && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "3rem", textAlign: "center", color: "#6b7280" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>No settlement batches yet</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>Your payouts will appear here once settlements are processed.</p>
        </div>
      )}

      {/* Batch list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {batches.map(b => (
          <div
            key={b.batch_id}
            onClick={() => navigate(`/settlement/${b.batch_id}`)}
            style={{
              background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
              padding: "1rem 1.25rem", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "space-between", gap: "1rem",
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <StatusBadge status={b.status} />
                {b.cycle_date && (
                  <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{b.cycle_date}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                <div>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af" }}>Net Payable</p>
                  <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: Number(b.net_payable) >= 0 ? "#16a34a" : "#dc2626" }}>
                    ₹{fmt(b.net_payable)}
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af" }}>Credits</p>
                  <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 600, color: "#16a34a" }}>+₹{fmt(b.total_credits)}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af" }}>Debits</p>
                  <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 600, color: "#dc2626" }}>−₹{fmt(b.total_debits)}</p>
                </div>
              </div>
            </div>
            <ChevronRight size={18} color="#9ca3af" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
