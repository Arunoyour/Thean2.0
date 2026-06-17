import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, MessageSquare, RefreshCw } from "lucide-react";
import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { getMySettlementBatch, getMySettlementProofs } from "../lib/api.js";

function StatusBadge({ status }) {
  return (
    <span className={`status-pill settlement-status-${status.toLowerCase()}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function BalanceCard({ label, value, tone }) {
  return (
    <div className="settlement-stat-card">
      <p className="settlement-stat-label">{label}</p>
      <p className={`settlement-stat-value${tone ? ` ${tone}` : ""}`}>
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
    <PharmacyPageShell>
      <p className="field-help" style={{ textAlign: "center", padding: "3rem 0" }}>Loading settlement…</p>
    </PharmacyPageShell>
  );

  if (error) return (
    <PharmacyPageShell>
      <div className="error">{error}</div>
    </PharmacyPageShell>
  );

  if (!batch) return null;

  const credits = (batch.lines ?? []).filter(l => l.line_type === "CREDIT");
  const debits  = (batch.lines ?? []).filter(l => l.line_type === "DEBIT");

  function downloadStatement() {
    const lines = [
      `Settlement Batch,${batch.batch_id}`,
      `Cycle,${batch.cycle_type ?? ""} ${batch.cycle_date ?? ""}`,
      `Status,${batch.status}`,
      `Opening Balance,${batch.opening_balance}`,
      `Total Credits,${batch.total_credits}`,
      `Total Debits,${batch.total_debits}`,
      `Net Payable,${batch.net_payable}`,
      `Closing Balance,${batch.closing_balance}`,
      `Created,${batch.created_at ?? ""}`,
      `Last Updated,${batch.updated_at ?? ""}`,
      "",
      "Type,Reference,Description,Amount",
      ...(batch.lines ?? []).map(l =>
        `${l.line_type},${l.reference_type},"${(l.description ?? "").replace(/"/g, "'")}",${l.amount}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlement-${batch.batch_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PharmacyPageShell>
      <button className="outline-button button-small" type="button" onClick={() => navigate("/settlement")} style={{ marginBottom: "1rem" }}>
        <ArrowLeft size={15} /> Back to settlements
      </button>

      <div className="settlement-detail-header">
        <div>
          <div className="settlement-batch-meta">
            <StatusBadge status={batch.status} />
            {batch.cycle_date && (
              <span className="settlement-cycle-tag">
                {batch.cycle_type ? `${batch.cycle_type} · ` : ""}{batch.cycle_date}
              </span>
            )}
            {batch.retry_count > 0 && <span className="settlement-retry-tag">Retry {batch.retry_count}/2</span>}
          </div>
          <h1 style={{ margin: "0.25rem 0 0" }}>Settlement Batch</h1>
          {(batch.created_at || batch.updated_at) && (
            <p className="settlement-audit-note">
              {batch.created_at && `Created ${new Date(batch.created_at).toLocaleString("en-IN")}`}
              {batch.created_at && batch.updated_at && batch.updated_at !== batch.created_at ? " · " : ""}
              {batch.updated_at && batch.updated_at !== batch.created_at && `Updated ${new Date(batch.updated_at).toLocaleString("en-IN")}`}
            </p>
          )}
        </div>
        <div className="settlement-detail-actions">
          <button className="outline-button button-small" type="button" onClick={load}>
            <RefreshCw size={15} />
          </button>
          <button className="outline-button button-small" type="button" onClick={downloadStatement}>
            <Download size={15} /> Download
          </button>
          <button className="button button-small" type="button" onClick={() => navigate(`/disputes/raise?reference_type=SETTLEMENT_BATCH&reference_id=${batchId}`)}>
            <MessageSquare size={15} /> Raise Dispute
          </button>
        </div>
      </div>

      <div className="settlement-stat-grid">
        <BalanceCard label="Opening Balance" value={batch.opening_balance} />
        <BalanceCard label="Total Credits"   value={batch.total_credits}   tone="positive" />
        <BalanceCard label="Total Debits"    value={batch.total_debits}    tone="negative" />
        <BalanceCard label="Net Payable"     value={batch.net_payable}     tone={Number(batch.net_payable) >= 0 ? "positive" : "negative"} />
        <BalanceCard label="Closing Balance" value={batch.closing_balance} />
      </div>

      {credits.length > 0 && (
        <div className="panel" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ marginTop: 0 }}>Credits ({credits.length})</h2>
          {credits.map(l => (
            <div key={l.line_id} className="settlement-line-row">
              <div>
                <p className="settlement-line-title">{l.reference_type.replace(/_/g, " ")}</p>
                <p className="settlement-line-desc">{l.description}</p>
              </div>
              <p className="settlement-line-amount positive">
                +₹{Number(l.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      )}

      {debits.length > 0 && (
        <div className="panel" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ marginTop: 0 }}>Deductions ({debits.length})</h2>
          {debits.map(l => (
            <div key={l.line_id} className="settlement-line-row">
              <div>
                <p className="settlement-line-title">{l.reference_type.replace(/_/g, " ")}</p>
                <p className="settlement-line-desc">{l.description}</p>
              </div>
              <p className="settlement-line-amount negative">
                −₹{Number(l.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      )}

      {proofs.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <FileText size={17} /> Payment Proofs ({proofs.length})
          </h2>
          {proofs.map(p => (
            <div key={p.proof_id} className="settlement-proof-row">
              <div>
                <span className={`status-pill settlement-status-${p.proof_type === "INWARD" ? "approved" : "draft"}`}>
                  {p.proof_type}
                </span>
                <p className="settlement-proof-meta">
                  {p.payment_method?.replace(/_/g, " ")} · ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
                {p.notes && <p className="settlement-proof-note">{p.notes}</p>}
                {p.created_at && (
                  <p className="settlement-proof-timestamp">Uploaded {new Date(p.created_at).toLocaleString("en-IN")}</p>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={p.verified ? "settlement-proof-verified" : "settlement-proof-pending"}>
                  {p.verified ? "✓ Verified" : "Pending"}
                </span>
                {p.verified && p.verified_at && (
                  <p className="settlement-proof-timestamp">{new Date(p.verified_at).toLocaleString("en-IN")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PharmacyPageShell>
  );
}
