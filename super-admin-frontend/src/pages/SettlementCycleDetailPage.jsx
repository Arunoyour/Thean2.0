import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getSettlementCycle } from "../lib/api.js";

const STATUS_COLORS = {
  DRAFT:            "#6b7280",
  PENDING_APPROVAL: "#d97706",
  APPROVED:         "#2563eb",
  EXECUTED:         "#16a34a",
  REJECTED:         "#dc2626",
  NEEDS_CORRECTION: "#7c3aed",
  CANCELLED:        "#6b7280",
  OPEN:             "#d97706",
  GENERATING:       "#7c3aed",
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
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

export function SettlementCycleDetailPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const data = await getSettlementCycle(cycleId);
      setCycle(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [cycleId]);

  if (isLoading) return <main className="page"><p style={{ color: "#6b7280" }}>Loading cycle…</p></main>;
  if (error)     return <main className="page"><div className="error">{error}</div></main>;
  if (!cycle)    return null;

  const pharmacyBatches  = cycle.batches?.filter(b => b.stakeholder_type === "PHARMACY") ?? [];
  const deliveryBatches  = cycle.batches?.filter(b => b.stakeholder_type === "DELIVERY_BOY") ?? [];
  const totalPayable     = cycle.batches?.reduce((s, b) => s + b.net_payable, 0) ?? 0;

  return (
    <main className="page">
      <button className="outline-button" style={{ marginBottom: "1rem", fontSize: "0.82rem" }}
        onClick={() => navigate("/dashboard/settlement")}>
        <ArrowLeft size={14} /> Back to cycles
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow">{cycle.cycle_type} cycle</p>
          <h1 style={{ margin: 0 }}>{cycle.cycle_date}</h1>
          <div style={{ marginTop: "0.5rem" }}><StatusBadge status={cycle.status} /></div>
        </div>
        <button className="outline-button" onClick={load}><RefreshCw size={15} /></button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[
          { label: "Total batches",   value: cycle.batches?.length ?? 0, isAmount: false },
          { label: "Pharmacy batches", value: pharmacyBatches.length,     isAmount: false },
          { label: "Delivery batches", value: deliveryBatches.length,     isAmount: false },
          { label: "Total payable",   value: totalPayable,                isAmount: true },
        ].map(card => (
          <div key={card.label} className="panel" style={{ padding: "1rem 1.25rem", flex: 1, minWidth: 160 }}>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "1.3rem", fontWeight: 700 }}>
              {card.isAmount
                ? `₹${Number(card.value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Batches table */}
      {(cycle.batches?.length ?? 0) === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "2.5rem", color: "#6b7280" }}>
          No batches generated for this cycle yet.
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Stakeholder", "Type", "Opening Bal.", "Credits", "Debits", "Net Payable", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "0.7rem 1rem", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycle.batches.map(b => (
                <tr key={b.batch_id} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                  onClick={() => navigate(`/dashboard/settlement/${cycleId}/batch/${b.batch_id}`)}>
                  <td style={{ padding: "0.7rem 1rem", fontWeight: 500 }}>{b.stakeholder_name}</td>
                  <td style={{ padding: "0.7rem 1rem", color: "#6b7280", fontSize: "0.82rem" }}>{b.stakeholder_type}</td>
                  <td style={{ padding: "0.7rem 1rem" }}>₹{Number(b.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.7rem 1rem", color: "#16a34a", fontWeight: 500 }}>₹{Number(b.total_credits).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.7rem 1rem", color: "#dc2626", fontWeight: 500 }}>₹{Number(b.total_debits).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.7rem 1rem", fontWeight: 700 }}>₹{Number(b.net_payable).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.7rem 1rem" }}><StatusBadge status={b.status} /></td>
                  <td style={{ padding: "0.7rem 1rem" }}>
                    <button className="outline-button" style={{ fontSize: "0.78rem", padding: "3px 10px" }}
                      onClick={e => { e.stopPropagation(); navigate(`/dashboard/settlement/${cycleId}/batch/${b.batch_id}`); }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
