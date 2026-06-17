import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { getAuditLogs } from "../lib/api.js";
import { BackButton } from "../components/BackButton.jsx";

const ROLES = ["", "SUPER", "SUPERVISOR", "CHECKER", "AUDITOR", "TEAM_LEAD"];
const ACTION_TYPES = [
  "", "LOGIN", "LOGOUT", "ACCESS_DENIED",
  "APPROVE_REQUEST", "REJECT_REQUEST", "CORRECT_REQUEST", "CANCEL_REQUEST",
  "COD_CLEAR", "FEE_CHANGE", "RATE_CHANGE",
  "CREATE_ADMIN", "DEACTIVATE_ADMIN", "CHANGE_ROLE",
  "VIEW_LEDGER", "VIEW_CUSTOMER", "EXPORT_REPORT",
];

function exportToCSV(logs) {
  const header = ["Timestamp", "Actor", "Role", "Action", "Description", "Target", "IP", "Method", "Path", "Status", "Success"];
  const rows = logs.map(l => [
    new Date(l.created_at).toLocaleString("en-IN"),
    l.actor_name ?? "(deleted)",
    l.actor_role ?? "",
    l.action_type,
    (l.description ?? "").replace(/,/g, ";"),
    l.target_type ? `${l.target_type}:${l.target_id ?? ""}` : "",
    l.ip_address ?? "",
    l.http_method ?? "",
    l.http_path ?? "",
    l.http_status ?? "",
    l.success ? "Yes" : "No",
  ]);
  const csv = [header, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `thean_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditLogPage() {
  const [logs,      setLogs]      = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState("");

  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [role,       setRole]       = useState("");
  const [actionType, setActionType] = useState("");
  const [success,    setSuccess]    = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const data = await getAuditLogs({ dateFrom, dateTo, role, actionType, success, limit: 200 });
      setLogs(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="page">
      <BackButton />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <p className="eyebrow">Compliance</p>
          <h1 style={{ margin: 0 }}>Audit Log</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="outline-button" onClick={() => exportToCSV(logs)} disabled={logs.length === 0}>
            <Download size={15} /> Export CSV
          </button>
          <button className="outline-button" onClick={load}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="panel" style={{ padding: "1rem 1.25rem", marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          From
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: "4px 8px" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          To
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: "4px 8px" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          Role
          <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: "4px 8px" }}>
            <option value="">All roles</option>
            {ROLES.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          Action
          <select value={actionType} onChange={e => setActionType(e.target.value)} style={{ padding: "4px 8px" }}>
            <option value="">All actions</option>
            {ACTION_TYPES.filter(Boolean).map(a => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          Result
          <select value={success} onChange={e => setSuccess(e.target.value)} style={{ padding: "4px 8px" }}>
            <option value="">All</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
        </label>
        <button className="button" onClick={load} style={{ alignSelf: "flex-end" }}>
          <Search size={15} /> Search
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      {!isLoading && logs.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          No log entries found for the selected filters.
        </div>
      )}

      {logs.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Time", "Actor", "Role", "Action", "Description", "Target", "IP", "Result"].map(h => (
                  <th key={h} style={{ padding: "0.65rem 0.9rem", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.log_id} style={{
                  borderBottom: "1px solid #f3f4f6",
                  background: l.success ? "white" : "#fff7f7",
                }}>
                  <td style={{ padding: "0.55rem 0.9rem", color: "#6b7280", whiteSpace: "nowrap" }}>
                    {new Date(l.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "medium" })}
                  </td>
                  <td style={{ padding: "0.55rem 0.9rem", fontWeight: 500 }}>
                    {l.actor_name ?? <span style={{ color: "#9ca3af" }}>(deleted)</span>}
                  </td>
                  <td style={{ padding: "0.55rem 0.9rem", color: "#6b7280" }}>{l.actor_role ?? "—"}</td>
                  <td style={{ padding: "0.55rem 0.9rem", fontWeight: 500, whiteSpace: "nowrap" }}>
                    {l.action_type.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "0.55rem 0.9rem", color: "#374151", maxWidth: 300 }}>
                    <span title={l.description} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.description ?? "—"}
                    </span>
                  </td>
                  <td style={{ padding: "0.55rem 0.9rem", color: "#6b7280", fontSize: "0.78rem" }}>
                    {l.target_type ? `${l.target_type}${l.target_id ? `:${String(l.target_id).slice(0, 8)}…` : ""}` : "—"}
                  </td>
                  <td style={{ padding: "0.55rem 0.9rem", color: "#9ca3af", fontFamily: "monospace", fontSize: "0.78rem" }}>
                    {l.ip_address ?? "—"}
                  </td>
                  <td style={{ padding: "0.55rem 0.9rem" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 99,
                      fontSize: "0.73rem", fontWeight: 600,
                      background: l.success ? "#dcfce7" : "#fee2e2",
                      color: l.success ? "#16a34a" : "#dc2626",
                    }}>
                      {l.success ? "OK" : `FAIL${l.http_status ? ` ${l.http_status}` : ""}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "0.65rem 1rem", fontSize: "0.8rem", color: "#6b7280", borderTop: "1px solid #f3f4f6" }}>
            {logs.length} record(s) shown — export to CSV to view all columns
          </div>
        </div>
      )}
    </main>
  );
}
