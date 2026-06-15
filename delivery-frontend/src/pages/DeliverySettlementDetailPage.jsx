import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, IndianRupee, Package, Truck, MessageSquare } from "lucide-react";
import { getMyDeliverySettlementBatch, getMyDeliverySettlementProofs } from "../lib/api.js";

export function DeliverySettlementDetailPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      getMyDeliverySettlementBatch(batchId),
      getMyDeliverySettlementProofs(batchId),
    ])
      .then(([b, p]) => { setBatch(b); setProofs(p || []); })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [batchId]);

  if (isLoading) return <div className="dl-page dl-loading"><p>Loading…</p></div>;
  if (error) return <div className="dl-page"><div className="dl-error">{error}</div></div>;
  if (!batch) return null;

  const cards = [
    { label: "Opening Balance", value: batch.opening_balance ?? 0 },
    { label: "Credits", value: batch.total_credits ?? 0 },
    { label: "Debits", value: batch.total_debits ?? 0 },
    { label: "Net Payable", value: batch.net_payable ?? 0, highlight: true },
    { label: "Closing Balance", value: batch.closing_balance ?? 0 },
  ];

  return (
    <div className="dl-page" style={{ paddingBottom: 90 }}>
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Settlement Detail</h1>
      </header>

      {/* Balance cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: c.highlight ? "#1d4ed8" : "#fff",
              color: c.highlight ? "#fff" : "#111827",
              borderRadius: 12,
              padding: "14px 16px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              gridColumn: c.highlight ? "span 2" : undefined,
            }}
          >
            <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>{c.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0" }}>
              ₹{Number(c.value).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Status */}
      <div style={{ padding: "12px 16px 0" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", background: "#eff6ff", padding: "4px 12px", borderRadius: 10 }}>
          {batch.status?.replace(/_/g, " ")}
        </span>
        <span style={{ marginLeft: 10, fontSize: 13, color: "#6b7280" }}>
          {batch.cycle_date ? new Date(batch.cycle_date).toLocaleDateString() : ""}
        </span>
      </div>

      {/* Credit lines */}
      {batch.credits?.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>Credits</h3>
          {batch.credits.map((c, i) => (
            <div key={i} style={{ background: "#f0fdf4", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#374151" }}>{c.description || c.line_type}</span>
                <span style={{ fontWeight: 600, color: "#16a34a" }}>+₹{Number(c.amount).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Debit lines */}
      {batch.debits?.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>Debits</h3>
          {batch.debits.map((d, i) => (
            <div key={i} style={{ background: "#fef2f2", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#374151" }}>{d.description || d.line_type}</span>
                <span style={{ fontWeight: 600, color: "#dc2626" }}>-₹{Number(d.amount).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment proofs */}
      {proofs.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>Payment Proofs</h3>
          {proofs.map((p) => (
            <div key={p.proof_id} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", marginBottom: 6, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{p.payment_method} — ₹{Number(p.amount).toFixed(2)}</p>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>{p.payment_reference}</p>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: p.verified ? "#16a34a" : "#f59e0b",
                  background: p.verified ? "#f0fdf4" : "#fffbeb",
                  padding: "3px 8px",
                  borderRadius: 8,
                }}>
                  {p.verified ? "Verified" : "Pending"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raise dispute */}
      <div style={{ padding: "20px 16px 0" }}>
        <button
          type="button"
          onClick={() => navigate(`/disputes/raise?reference_type=SETTLEMENT_BATCH&reference_id=${batchId}`)}
          style={{
            width: "100%",
            padding: "14px",
            background: "#fff",
            border: "2px solid #e5e7eb",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            color: "#374151",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <MessageSquare size={18} /> Raise Dispute
        </button>
      </div>

      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/orders" className="dl-nav-item"><Package size={22} /><span>Orders</span></Link>
        <Link to="/earnings" className="dl-nav-item"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
