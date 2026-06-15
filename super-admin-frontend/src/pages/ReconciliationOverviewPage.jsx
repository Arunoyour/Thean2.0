import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { getReconciliationOverview, listReconciliationExceptions } from "../lib/api.js";

const SEVERITY_COLORS = { HIGH: "#dc2626", MEDIUM: "#d97706", LOW: "#2563eb" };
const STATUS_COLORS = {
  OPEN:       "#dc2626",
  IN_REVIEW:  "#d97706",
  ESCALATED:  "#7c3aed",
  RESOLVED:   "#16a34a",
};
const MATCH_TYPE_COLORS = {
  FULL_MATCH:       "#16a34a",
  PARTIAL_MATCH:    "#d97706",
  GATEWAY_ONLY:     "#ea580c",
  STATEMENT_ONLY:   "#ea580c",
  BATCH_ONLY:       "#dc2626",
};

function StatCard({ label, value, sub, color }) {
  return (
    <div className="panel" style={{ padding: "1rem 1.25rem", flex: 1, minWidth: 160 }}>
      <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: "0.35rem 0 0", fontSize: "1.5rem", fontWeight: 700, color: color ?? "#111827" }}>{value}</p>
      {sub && <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "#6b7280" }}>{sub}</p>}
    </div>
  );
}

const STATUS_FILTERS = [
  { value: "",          label: "All" },
  { value: "OPEN",      label: "Open" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "RESOLVED",  label: "Resolved" },
];
const SEVERITY_FILTERS = [
  { value: "",       label: "All severity" },
  { value: "HIGH",   label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW",    label: "Low" },
];

export function ReconciliationOverviewPage() {
  const navigate = useNavigate();
  const [overview,    setOverview]    = useState(null);
  const [exceptions,  setExceptions]  = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState("");
  const [statusFilter,   setStatusFilter]   = useState("OPEN");
  const [severityFilter, setSeverityFilter] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [ov, excs] = await Promise.all([
        getReconciliationOverview(),
        listReconciliationExceptions({ status: statusFilter || undefined, severity: severityFilter || undefined }),
      ]);
      setOverview(ov);
      setExceptions(excs);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, severityFilter]);

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <p className="eyebrow">Finance</p>
          <h1 style={{ margin: 0 }}>Reconciliation</h1>
        </div>
        <button className="outline-button" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Summary cards */}
      {overview && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <StatCard label="Match rate"          value={`${overview.match_rate}%`}       color={overview.match_rate >= 95 ? "#16a34a" : "#d97706"} />
          <StatCard label="Total matches"       value={overview.total_matches}          />
          <StatCard label="Fully matched"       value={overview.matched_count}          color="#16a34a" />
          <StatCard label="Open exceptions"     value={overview.open_exceptions}        color={overview.open_exceptions > 0 ? "#dc2626" : "#16a34a"} />
          <StatCard label="High severity"       value={overview.high_severity}          color={overview.high_severity > 0 ? "#dc2626" : "#16a34a"} />
          <StatCard label="Unprocessed gateway" value={overview.unprocessed_gateway}    color={overview.unprocessed_gateway > 0 ? "#d97706" : "#16a34a"} />
          <StatCard label="Unmatched statements" value={overview.unmatched_statements}  color={overview.unmatched_statements > 0 ? "#d97706" : "#16a34a"} />
        </div>
      )}

      {/* Exception filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Exceptions</span>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
              padding: "3px 12px", borderRadius: 99, fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
              border: "1px solid",
              borderColor: statusFilter === f.value ? "#2563eb" : "#d1d5db",
              background:  statusFilter === f.value ? "#eff6ff"  : "white",
              color:        statusFilter === f.value ? "#2563eb"  : "#374151",
            }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.4rem", marginLeft: "auto" }}>
          {SEVERITY_FILTERS.map(f => (
            <button key={f.value} onClick={() => setSeverityFilter(f.value)} style={{
              padding: "3px 12px", borderRadius: 99, fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
              border: "1px solid",
              borderColor: severityFilter === f.value ? "#dc2626" : "#d1d5db",
              background:  severityFilter === f.value ? "#fff0f0"  : "white",
              color:        severityFilter === f.value ? "#dc2626"  : "#374151",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      {!isLoading && exceptions.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          <CheckCircle2 size={36} style={{ marginBottom: "0.75rem", color: "#16a34a" }} />
          <p style={{ margin: 0 }}>No exceptions matching this filter.</p>
        </div>
      )}

      {exceptions.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Severity", "Type", "Description", "Status", "Raised", ""].map(h => (
                  <th key={h} style={{ padding: "0.65rem 1rem", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exceptions.map(exc => {
                const sevColor  = SEVERITY_COLORS[exc.severity]  ?? "#6b7280";
                const statColor = STATUS_COLORS[exc.status] ?? "#6b7280";
                return (
                  <tr key={exc.exception_id}
                    style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer", background: exc.severity === "HIGH" ? "#fff8f8" : "white" }}
                    onClick={() => navigate(`/dashboard/reconciliation/exceptions/${exc.exception_id}`)}>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 600, color: sevColor, fontSize: "0.8rem" }}>
                        {exc.severity === "HIGH" && <AlertTriangle size={13} />}
                        {exc.severity}
                      </span>
                    </td>
                    <td style={{ padding: "0.65rem 1rem", color: "#6b7280", fontSize: "0.8rem" }}>
                      {exc.exception_type.replace(/_/g, " ")}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", maxWidth: 320 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={exc.description}>
                        {exc.description}
                      </span>
                    </td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 9px", borderRadius: 99,
                        fontSize: "0.75rem", fontWeight: 600,
                        background: statColor + "18", color: statColor, border: `1px solid ${statColor}40`,
                      }}>
                        {exc.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "0.65rem 1rem", color: "#9ca3af", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                      {new Date(exc.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <button className="outline-button" style={{ fontSize: "0.78rem", padding: "3px 10px" }}
                        onClick={e => { e.stopPropagation(); navigate(`/dashboard/reconciliation/exceptions/${exc.exception_id}`); }}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
