import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, RefreshCw } from "lucide-react";
import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { listMySettlementBatches } from "../lib/api.js";

const FILTER_OPTIONS = ["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "EXECUTED", "REJECTED"];

function StatCard({ label, value, tone }) {
  return (
    <div className="settlement-stat-card">
      <p className="settlement-stat-label">{label}</p>
      <p className={`settlement-stat-value${tone ? ` ${tone}` : ""}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`status-pill settlement-status-${status.toLowerCase()}`}>
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

  const summary = batches.reduce(
    (acc, b) => ({
      netPayable: acc.netPayable + Number(b.net_payable || 0),
      credits: acc.credits + Number(b.total_credits || 0),
      debits: acc.debits + Number(b.total_debits || 0),
      pending: acc.pending + (b.status === "PENDING_APPROVAL" ? 1 : 0),
    }),
    { netPayable: 0, credits: 0, debits: 0, pending: 0 },
  );

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <p className="eyebrow">Finance</p>
          <h1>Settlement History</h1>
          <p>Your payout batches, grouped by settlement cycle.</p>
        </div>
        <button className="outline-button button-small" type="button" onClick={() => load(statusFilter)}>
          <RefreshCw size={15} />
        </button>
      </header>

      {!isLoading && batches.length > 0 && (
        <div className="settlement-stat-grid">
          <StatCard label="Batches" value={batches.length} />
          <StatCard label="Net Payable" value={`₹${fmt(summary.netPayable)}`} tone={summary.netPayable >= 0 ? "positive" : "negative"} />
          <StatCard label="Credits" value={`+₹${fmt(summary.credits)}`} tone="positive" />
          <StatCard label="Debits" value={`−₹${fmt(summary.debits)}`} tone="negative" />
          {summary.pending > 0 && <StatCard label="Pending Approval" value={summary.pending} tone="warning" />}
        </div>
      )}

      <div className="settlement-filter-chips">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f}
            type="button"
            className={`settlement-filter-chip${statusFilter === f ? " active" : ""}`}
            onClick={() => changeFilter(f)}>
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {isLoading && <p className="field-help" style={{ textAlign: "center", padding: "2rem 0" }}>Loading settlements…</p>}

      {!isLoading && batches.length === 0 && !error && (
        <div className="panel settlement-empty">
          <p>No settlement batches yet</p>
          <p>Your payouts will appear here once settlements are processed.</p>
        </div>
      )}

      <div className="settlement-batch-list">
        {batches.map(b => (
          <div key={b.batch_id} className="settlement-batch-card" onClick={() => navigate(`/settlement/${b.batch_id}`)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="settlement-batch-meta">
                <StatusBadge status={b.status} />
                {b.cycle_date && (
                  <span className="settlement-cycle-tag">
                    {b.cycle_type ? `${b.cycle_type} · ` : ""}{b.cycle_date}
                  </span>
                )}
                {b.retry_count > 0 && <span className="settlement-retry-tag">Retry {b.retry_count}/2</span>}
              </div>
              <div className="settlement-amount-row">
                <div>
                  <p className="settlement-amount-label">Net Payable</p>
                  <p className={`settlement-amount-value ${Number(b.net_payable) >= 0 ? "positive" : "negative"}`}>
                    ₹{fmt(b.net_payable)}
                  </p>
                </div>
                <div>
                  <p className="settlement-amount-label">Credits</p>
                  <p className="settlement-amount-value positive">+₹{fmt(b.total_credits)}</p>
                </div>
                <div>
                  <p className="settlement-amount-label">Debits</p>
                  <p className="settlement-amount-value negative">−₹{fmt(b.total_debits)}</p>
                </div>
              </div>
            </div>
            <ChevronRight size={18} color="#52625f" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </PharmacyPageShell>
  );
}
