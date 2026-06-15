import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, MessageSquare, RefreshCw } from "lucide-react";
import { getMySettlementBatch, getMySettlementProofs } from "../lib/api.js";

const STATUS_COLORS = {
  DRAFT:            "#6b7280",
  PENDING_APPROVAL: "#d97706",
  APPROVED:         "#2563eb",
  EXECUTED:         "#16a34a",
  REJECTED:         "#dc2626",
  NEEDS_CORRECTION: "#7c3aed",
  CANCELLED:        "#9ca3af",
};

const PROOF_TYPE_COLORS = { INWARD: "#16a34a", OUTWARD: "#2563eb" };

function StatusBadge({ status, colors = STATUS_COLORS }) {
  const color = colors[status] ?? "#6b7280";
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

function BalanceCard({ label, value, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", padding: "0.85rem 1rem", flex: 1, minWidth: 130 }}>
      <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: "0.3rem 0 0", fontSize: "1.15rem", fontWeight: 700, color: color ?? "#111827" }}>
        ₹{Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

export function SettlementDetailPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch]   = useState(null);
  const [proofs, setProofs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]   = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [batchData, proofsData] = await Promise.all([
        getMySettlementBatch(batchId),
        getMySettlementProofs(batchId).catch(() => []),
      ]);
      setBatch(batchData);
      setProofs(Array.isArray(proofsData) ? proofsData : proofsData.proofs ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [batchId]);

  if (isLoading) return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: "1.25rem 1rem" }}>
      <p style={{ color: "#6b7280", textAlign: "center", paddingTop: "4rem" }}>Loading settlement…</p>
    </main>
  );

  if (error) return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: "1.25rem 1rem" }}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "1rem", color: "#dc2626" }}>{error}</div>
    </main>
  );

  if (!batch) return null;

  const credits = (batch.lines ?? []).filter(l => l.line_type === "CREDIT");
  const debits  = (batch.lines ?? []).filter(l => l.line_type === "DEBIT");

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: "1.25rem 1rem", paddingBottom: "5rem" }}>
      {/* Back */}
      <button onClick={() => navigate("/settlement")}
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "none", color: "#374151", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", marginBottom: "1rem", padding: 0 }}>
        <ArrowLeft size={16} /> Back to settlements
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <StatusBadge status={batch.status} />
            {batch.cycle_date && <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{batch.cycle_date}</span>}
          </div>
          <h1 style={{ margin: "0.25rem 0 0", fontSize: "1.3rem", fontWeight: 700 }}>Settlement Batch</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={load}
            style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#374151" }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => navigate(`/disputes/raise?reference_type=SETTLEMENT_BATCH&reference_id=${batchId}`)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "#111827", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
            <MessageSquare size={14} /> Raise Dispute
          </button>
        </div>
      </div>

      {/* Balance cards */}
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <BalanceCard label="Opening Balance" value={batch.opening_balance} />
        <BalanceCard label="Total Credits"   value={batch.total_credits}   color="#16a34a" />
        <BalanceCard label="Total Debits"    value={batch.total_debits}    color="#dc2626" />
        <BalanceCard label="Net Payable"     value={batch.net_payable}     color={Number(batch.net_payable) >= 0 ? "#16a34a" : "#dc2626"} />
        <BalanceCard label="Closing Balance" value={batch.closing_balance} />
      </div>

      {/* Credit lines */}
      {credits.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "1rem", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>Credits ({credits.length})</h2>
          {credits.map(l => (
            <div key={l.line_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.85rem" }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{l.reference_type.replace(/_/g, " ")}</p>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.78rem" }}>{l.description}</p>
              </div>
              <p style={{ margin: 0, fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap" }}>
                +₹{Number(l.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Debit lines */}
      {debits.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "1rem", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>Deductions ({debits.length})</h2>
          {debits.map(l => (
            <div key={l.line_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.85rem" }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{l.reference_type.replace(/_/g, " ")}</p>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.78rem" }}>{l.description}</p>
              </div>
              <p style={{ margin: 0, fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>
                −₹{Number(l.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Payment Proofs */}
      {proofs.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <FileText size={16} /> Payment Proofs ({proofs.length})
          </h2>
          {proofs.map(p => {
            const pColor = PROOF_TYPE_COLORS[p.proof_type] ?? "#6b7280";
            return (
              <div key={p.proof_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.85rem" }}>
                <div>
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: "0.72rem", fontWeight: 700, background: pColor + "18", color: pColor, border: `1px solid ${pColor}40`, marginBottom: "0.25rem" }}>
                    {p.proof_type}
                  </span>
                  <p style={{ margin: 0, color: "#374151" }}>{p.payment_method?.replace(/_/g, " ")} · ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  {p.notes && <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.78rem" }}>{p.notes}</p>}
                </div>
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: p.is_verified ? "#16a34a" : "#d97706" }}>
                  {p.is_verified ? "✓ Verified" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
