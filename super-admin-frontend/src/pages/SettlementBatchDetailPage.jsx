import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, RefreshCw, Send, Upload } from "lucide-react";
import {
  getSettlementCycle,
  getSettlementBatch,
  submitSettlementBatch,
  executeSettlementBatch,
} from "../lib/api.js";
import { canWriteConfig } from "../lib/role.js";
import { BackButton } from "../components/BackButton.jsx";

const BATCH_STATUS_COLORS = {
  DRAFT:            "#6b7280",
  PENDING_APPROVAL: "#d97706",
  APPROVED:         "#2563eb",
  EXECUTED:         "#16a34a",
  REJECTED:         "#dc2626",
  NEEDS_CORRECTION: "#7c3aed",
  CANCELLED:        "#6b7280",
};

function StatusBadge({ status, colors = BATCH_STATUS_COLORS }) {
  const color = colors[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 99,
      fontSize: "0.75rem", fontWeight: 600,
      background: color + "18", color, border: `1px solid ${color}40`,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function BalanceCard({ label, value, highlight }) {
  return (
    <div className="panel" style={{ padding: "1rem 1.25rem", flex: 1, minWidth: 160 }}>
      <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: "0.35rem 0 0", fontSize: "1.25rem", fontWeight: 700, color: highlight ?? "#111827" }}>
        ₹{Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

export function SettlementBatchDetailPage() {
  const { cycleId, batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch]     = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]     = useState("");
  const [actioning, setActioning] = useState(false);

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const data = await getSettlementBatch(batchId);
      setBatch(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [batchId]);

  async function handleSubmit() {
    setActioning(true);
    try {
      await submitSettlementBatch(batchId);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setActioning(false);
    }
  }

  async function handleExecute() {
    setActioning(true);
    try {
      await executeSettlementBatch(batchId);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setActioning(false);
    }
  }

  if (isLoading) return <main className="page">
      <BackButton /><p style={{ color: "#6b7280" }}>Loading batch…</p></main>;
  if (error)     return <main className="page"><div className="error">{error}</div></main>;
  if (!batch)    return null;

  const credits = batch.lines.filter(l => l.line_type === "CREDIT");
  const debits  = batch.lines.filter(l => l.line_type === "DEBIT");

  return (
    <main className="page">
      {/* Back */}
      <button className="outline-button" style={{ marginBottom: "1rem", fontSize: "0.82rem" }}
        onClick={() => navigate(`/dashboard/settlement/${cycleId ?? batch.cycle_id}`)}>
        <ArrowLeft size={14} /> Back to cycle
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow">{batch.stakeholder_type}</p>
          <h1 style={{ margin: 0 }}>{batch.stakeholder_name}</h1>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}>
            <StatusBadge status={batch.status} />
            {batch.retry_count > 0 && (
              <span style={{ fontSize: "0.78rem", color: "#dc2626", fontWeight: 600 }}>Retry {batch.retry_count}/2</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="outline-button" onClick={load}><RefreshCw size={15} /></button>
          {batch.status === "DRAFT" && canWriteConfig() && (
            <button className="button" disabled={actioning} onClick={handleSubmit}>
              <Send size={15} /> Submit for Approval
            </button>
          )}
          {batch.status === "APPROVED" && canWriteConfig() && (
            <button className="button" style={{ background: "#16a34a" }} disabled={actioning} onClick={handleExecute}>
              <CheckCircle2 size={15} /> Execute Payout
            </button>
          )}
          {canWriteConfig() && (
            <button className="outline-button"
              onClick={() => navigate(`/dashboard/settlement/batch/${batchId}/proofs`)}>
              <Upload size={15} /> Payment Proofs
            </button>
          )}
          <button className="outline-button"
            onClick={() => navigate(
              `/dashboard/ledger?type=${batch.stakeholder_type}&id=${batch.stakeholder_id}`
            )}>
            <BookOpen size={15} /> View Ledger
          </button>
        </div>
      </div>

      {/* Balance cards */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <BalanceCard label="Opening Balance" value={batch.opening_balance} />
        <BalanceCard label="Total Credits"   value={batch.total_credits}   highlight="#16a34a" />
        <BalanceCard label="Total Debits"    value={batch.total_debits}    highlight="#dc2626" />
        <BalanceCard label="Net Payable"     value={batch.net_payable}     highlight={batch.net_payable >= 0 ? "#16a34a" : "#dc2626"} />
        <BalanceCard label="Closing Balance" value={batch.closing_balance} />
      </div>

      {/* Lines */}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Credits ({credits.length})</h2>
        {credits.length === 0 ? <p style={{ color: "#6b7280", margin: 0 }}>No credit lines.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                {["Type", "Description", "Amount"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {credits.map(l => (
                <tr key={l.line_id} style={{ borderBottom: "1px solid #f9fafb" }}>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#6b7280" }}>{l.reference_type.replace(/_/g, " ")}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{l.description}</td>
                  <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "#16a34a" }}>
                    + ₹{Number(l.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Debits ({debits.length})</h2>
        {debits.length === 0 ? <p style={{ color: "#6b7280", margin: 0 }}>No debit lines.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                {["Type", "Description", "Amount"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debits.map(l => (
                <tr key={l.line_id} style={{ borderBottom: "1px solid #f9fafb" }}>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#6b7280" }}>{l.reference_type.replace(/_/g, " ")}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{l.description}</td>
                  <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "#dc2626" }}>
                    − ₹{Number(l.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
