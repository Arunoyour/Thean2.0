import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { getCustomerAttention } from "../lib/api.js";

const SEVERITY_COLOR = { HIGH: "#dc2626", MEDIUM: "#d97706" };
const SEVERITY_BG    = { HIGH: "#fef2f2", MEDIUM: "#fffbeb" };
const SEVERITY_BORDER = { HIGH: "#fca5a5", MEDIUM: "#fde68a" };

export function CustomerAttentionPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  function load() {
    setLoading(true);
    setError("");
    getCustomerAttention()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <section className="home-layout">
      <div style={{ padding: "1rem", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <Link to="/home" style={{ color: "#6b7280", display: "flex", alignItems: "center" }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Attention Needed</h1>
          <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <RefreshCw size={18} />
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
            <RefreshCw size={24} style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ marginTop: "0.5rem" }}>Checking…</p>
          </div>
        )}

        {error && <div className="dispute-error">{error}</div>}

        {!loading && data && data.count === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
            <CheckCircle2 size={40} style={{ color: "#22c55e", marginBottom: "0.75rem" }} />
            <p style={{ fontWeight: 600 }}>All clear</p>
            <p style={{ fontSize: "0.88rem", marginTop: "0.35rem" }}>No items need your attention right now.</p>
          </div>
        )}

        {!loading && data?.items?.map((item, i) => (
          <a key={i} href={item.link} style={{
            display: "block", marginBottom: "0.75rem", padding: "1rem",
            borderRadius: 10, border: `1px solid ${SEVERITY_BORDER[item.severity] ?? "#e5e7eb"}`,
            background: SEVERITY_BG[item.severity] ?? "white", textDecoration: "none", color: "inherit",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <AlertTriangle size={16} style={{ color: SEVERITY_COLOR[item.severity] ?? "#6b7280", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: SEVERITY_COLOR[item.severity] ?? "#374151" }}>
                {item.title}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "#374151" }}>{item.detail}</p>
            {item.age_minutes > 0 && (
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>
                {item.age_minutes} minute{item.age_minutes !== 1 ? "s" : ""} ago
              </p>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
