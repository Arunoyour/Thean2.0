import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, MessageSquare, RefreshCw } from "lucide-react";
import { getDisputeOverview, getDisputeSummary, listAdminDisputes, listDisputes } from "../lib/api.js";

const STATUS_COLORS = {
  OPEN:      "#dc2626",
  IN_REVIEW: "#d97706",
  RESOLVED:  "#16a34a",
  REOPENED:  "#7c3aed",
  CLOSED:    "#6b7280",
};

const APP_COLORS = {
  CUSTOMER:     "#2563eb",
  PHARMACY:     "#059669",
  DELIVERY_BOY: "#d97706",
  TEAM_LEAD:    "#7c3aed",
};

const TYPE_LABELS = {
  WRONG_CHARGE:        "Wrong charge",
  REFUND_NOT_RECEIVED: "Refund not received",
  SETTLEMENT_DISPUTE:  "Settlement dispute",
  COD_DISPUTE:         "COD dispute",
  ORDER_DISPUTE:       "Order dispute",
  OTHER:               "Other",
};

function Badge({ label, color }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 99,
      fontSize: "0.75rem", fontWeight: 600,
      background: color + "18", color, border: `1px solid ${color}40`,
    }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="panel" style={{ padding: "1rem 1.25rem", flex: 1, minWidth: 130 }}>
      <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: "0.35rem 0 0", fontSize: "1.5rem", fontWeight: 700, color: color ?? "#111827" }}>{value}</p>
    </div>
  );
}

const STATUS_FILTERS = [
  { value: "",          label: "All" },
  { value: "OPEN",      label: "Open" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "REOPENED",  label: "Reopened" },
  { value: "RESOLVED",  label: "Resolved" },
  { value: "CLOSED",    label: "Closed" },
];
const APP_FILTERS = [
  { value: "",             label: "All apps" },
  { value: "CUSTOMER",     label: "Customer" },
  { value: "PHARMACY",     label: "Pharmacy" },
  { value: "DELIVERY_BOY", label: "Delivery Boy" },
  { value: "TEAM_LEAD",    label: "Team Lead" },
];
const SECTOR_FILTERS = [
  { value: "",         label: "All sectors" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "delivery", label: "Delivery" },
];

export function DisputeManagementPage() {
  const navigate = useNavigate();
  const [overview,      setOverview]      = useState(null);
  const [summary,       setSummary]       = useState(null);
  const [disputes,      setDisputes]      = useState([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [error,         setError]         = useState("");
  const [statusFilter,  setStatusFilter]  = useState("OPEN");
  const [appFilter,     setAppFilter]     = useState("");
  const [sectorFilter,  setSectorFilter]  = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [ov, sum, list] = await Promise.all([
        getDisputeOverview().catch(() => null),
        getDisputeSummary().catch(() => null),
        listAdminDisputes({
          status: statusFilter || undefined,
          raised_by_app: appFilter || undefined,
          sector: sectorFilter || undefined,
        }),
      ]);
      setOverview(ov);
      setSummary(sum);
      setDisputes(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, appFilter, sectorFilter]);

  const stats = summary ?? overview;

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <p className="eyebrow">Operations</p>
          <h1 style={{ margin: 0 }}>Dispute Management</h1>
        </div>
        <button className="outline-button" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>

      {/* Overview stats */}
      {stats && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <StatCard label="Total"          value={stats.total}                          />
          <StatCard label="Open"           value={stats.open}           color="#dc2626" />
          <StatCard label="In Review"      value={stats.in_review}      color="#d97706" />
          <StatCard label="Reopened"       value={stats.reopened}       color="#7c3aed" />
          <StatCard label="Resolved"       value={stats.resolved}       color="#16a34a" />
          {stats.unread_by_admin != null && (
            <StatCard label="Needs reply"  value={stats.unread_by_admin} color="#dc2626" />
          )}
        </div>
      )}

      {/* By-sector breakdown */}
      {summary?.by_sector && Object.keys(summary.by_sector).length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", color: "#9ca3af", marginRight: "0.25rem" }}>By sector:</span>
          {Object.entries(summary.by_sector).map(([s, count]) => (
            <button key={s} onClick={() => setSectorFilter(sectorFilter === s ? "" : s)}
              style={{
                display: "flex", alignItems: "center", gap: "0.4rem", padding: "4px 12px", borderRadius: 99,
                border: `1px solid ${sectorFilter === s ? "#2563eb" : "#e5e7eb"}`,
                background: sectorFilter === s ? "#eff6ff" : "white",
                color: sectorFilter === s ? "#2563eb" : "#374151",
                fontSize: "0.82rem", cursor: "pointer",
              }}>
              {s} <strong>{count}</strong>
            </button>
          ))}
        </div>
      )}

      {/* By-app breakdown */}
      {(summary?.by_app ?? overview?.by_app) && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          {Object.entries(summary?.by_app ?? overview?.by_app).map(([app, count]) => (
            <div key={app} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "4px 12px", borderRadius: 99, border: "1px solid #e5e7eb", fontSize: "0.82rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: APP_COLORS[app.toUpperCase()] ?? "#6b7280", display: "inline-block" }} />
              {app.replace(/_/g, " ")} <strong>{count}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
              padding: "3px 12px", borderRadius: 99, fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", border: "1px solid",
              borderColor: statusFilter === f.value ? "#2563eb" : "#d1d5db",
              background:  statusFilter === f.value ? "#eff6ff"  : "white",
              color:        statusFilter === f.value ? "#2563eb"  : "#374151",
            }}>{f.label}</button>
          ))}
        </div>
        <select value={appFilter} onChange={e => setAppFilter(e.target.value)}
          style={{ padding: "4px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid #d1d5db" }}>
          {APP_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}
          style={{ padding: "4px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid #d1d5db" }}>
          {SECTOR_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {error && <div className="error">{error}</div>}
      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      {!isLoading && disputes.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          <MessageSquare size={36} style={{ marginBottom: "0.75rem", opacity: 0.3 }} />
          <p style={{ margin: 0 }}>No disputes matching this filter.</p>
        </div>
      )}

      {disputes.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["From", "Name", "Type", "Sectors", "Age", "Messages", "Status", "Raised", ""].map(h => (
                  <th key={h} style={{ padding: "0.65rem 1rem", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {disputes.map(d => {
                const statColor = STATUS_COLORS[d.status] ?? "#6b7280";
                const appColor  = APP_COLORS[d.raised_by_app] ?? "#6b7280";
                const isOld = d.age_days != null && d.age_days >= 60;
                return (
                  <tr key={d.dispute_id}
                    style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer", background: d.unread_by_admin ? "#fff7ed" : d.status === "REOPENED" ? "#faf5ff" : "white" }}
                    onClick={() => navigate(`/dashboard/disputes/${d.dispute_id}`)}>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <Badge label={d.raised_by_app.replace(/_/g, " ")} color={appColor} />
                    </td>
                    <td style={{ padding: "0.65rem 1rem", fontWeight: 500 }}>
                      {d.unread_by_admin && (
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#dc2626", marginRight: 6 }} />
                      )}
                      {d.raised_by_name}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", color: "#6b7280", fontSize: "0.8rem" }}>
                      {TYPE_LABELS[d.dispute_type] ?? d.dispute_type}
                    </td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      {d.tagged_sectors?.length > 0 ? (
                        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                          {d.tagged_sectors.map(s => (
                            <span key={s} style={{ fontSize: "0.72rem", padding: "1px 7px", borderRadius: 99, background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#d1d5db", fontSize: "0.8rem" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", whiteSpace: "nowrap" }}>
                      {d.age_days != null ? (
                        <span style={{ fontSize: "0.82rem", color: isOld ? "#dc2626" : "#6b7280", fontWeight: isOld ? 700 : 400 }}>
                          {d.age_days}d {isOld && <AlertCircle size={12} style={{ display: "inline", verticalAlign: "middle" }} />}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", textAlign: "center" }}>{d.message_count}</td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <Badge label={d.status.replace(/_/g, " ")} color={statColor} />
                      {d.reopened_count > 0 && (
                        <span style={{ marginLeft: 6, fontSize: "0.72rem", color: "#7c3aed", fontWeight: 600 }}>
                          ×{d.reopened_count}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", color: "#9ca3af", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                      {new Date(d.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <button className="outline-button" style={{ fontSize: "0.78rem", padding: "3px 10px" }}
                        onClick={e => { e.stopPropagation(); navigate(`/dashboard/disputes/${d.dispute_id}`); }}>
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
