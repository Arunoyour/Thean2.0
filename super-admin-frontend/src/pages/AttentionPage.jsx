import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { getAdminAttention } from "../lib/api.js";

const SEVERITY_COLOR  = { HIGH: "#dc2626", MEDIUM: "#d97706" };
const SEVERITY_BG     = { HIGH: "#fef2f2", MEDIUM: "#fffbeb" };
const SEVERITY_BORDER = { HIGH: "#fca5a5", MEDIUM: "#fde68a" };

const TYPE_LABEL = {
  UNASSIGNED_ORDER:        "Unassigned order",
  GHOST_DRIVER:            "Ghost driver",
  STALE_DISPUTE:           "SLA breach — dispute",
  STALE_RECON_EXCEPTION:   "SLA breach — reconciliation",
};

export function AttentionPage() {
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  function load() {
    setLoading(true);
    setError("");
    getAdminAttention()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <button className="outline-button" style={{ fontSize: "0.82rem" }} onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={14} /> Dashboard
        </button>
        <div>
          <p className="eyebrow">Operations</p>
          <h1 style={{ margin: 0 }}>Immediate Attention</h1>
        </div>
        <button className="outline-button" style={{ marginLeft: "auto" }} onClick={load}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {loading && <p style={{ color: "#6b7280" }}>Checking…</p>}
      {error && <div className="error">{error}</div>}

      {!loading && data && data.count === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          <CheckCircle2 size={40} style={{ color: "#22c55e", marginBottom: "0.75rem" }} />
          <p style={{ fontWeight: 600, margin: 0 }}>All clear</p>
          <p style={{ fontSize: "0.88rem", marginTop: "0.35rem" }}>No items need immediate attention right now.</p>
        </div>
      )}

      {!loading && data?.items && data.items.length > 0 && (
        <>
          <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1rem" }}>
            {data.count} item{data.count !== 1 ? "s" : ""} need immediate attention.
            HIGH priority items are shown first.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {data.items.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "1rem 1.25rem", borderRadius: 10,
                  border: `1px solid ${SEVERITY_BORDER[item.severity] ?? "#e5e7eb"}`,
                  background: SEVERITY_BG[item.severity] ?? "white",
                  cursor: "pointer",
                }}
                onClick={() => navigate(item.link)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                  <AlertTriangle size={16} style={{ color: SEVERITY_COLOR[item.severity], flexShrink: 0 }} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: SEVERITY_COLOR[item.severity] }}>
                    {item.severity} · {TYPE_LABEL[item.type] ?? item.type.replace(/_/g, " ")}
                  </span>
                  {item.age_minutes > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#9ca3af" }}>
                      {item.age_minutes >= 60
                        ? `${Math.floor(item.age_minutes / 60)}h ${item.age_minutes % 60}m`
                        : `${item.age_minutes}m`} ago
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem", color: "#111827" }}>{item.title}</p>
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.84rem", color: "#374151" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
