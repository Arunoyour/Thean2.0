import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RefreshCw, XCircle } from "lucide-react";
import { cancelApproval, listApprovals, reviewApprovalLine } from "../lib/api.js";
import { canApprove, canWriteConfig } from "../lib/role.js";

const STATUS_COLORS = {
  PENDING_APPROVAL: "#d97706",
  APPROVED:         "#2563eb",
  REJECTED:         "#dc2626",
  NEEDS_CORRECTION: "#7c3aed",
  EXECUTED:         "#16a34a",
  CANCELLED:        "#6b7280",
  PARTIAL:          "#ea580c",
};

const LINE_STATUS_COLORS = {
  PENDING:          "#d97706",
  APPROVED:         "#16a34a",
  REJECTED:         "#dc2626",
  NEEDS_CORRECTION: "#7c3aed",
  EXECUTED:         "#16a34a",
};

function StatusBadge({ status, colors = STATUS_COLORS }) {
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

function RejectModal({ line, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div className="panel" style={{ width: "100%", maxWidth: 440, padding: "2rem" }}>
        <h3 style={{ marginTop: 0 }}>Reject Line</h3>
        <p style={{ color: "#374151", marginBottom: "0.5rem" }}><strong>{line.description}</strong></p>
        {line.amount && <p style={{ color: "#6b7280" }}>Amount: ₹{Number(line.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>}
        <label style={{ display: "block", marginBottom: "1rem" }}>
          Rejection reason <span style={{ color: "#dc2626" }}>*</span>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Describe why this line is being rejected…"
            style={{ width: "100%", marginTop: "0.35rem" }}
          />
        </label>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button className="outline-button" onClick={onCancel}>Cancel</button>
          <button
            className="button"
            style={{ background: "#dc2626" }}
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason)}
          >
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestRow({ req, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [actioning, setActioning] = useState(null); // line_id being actioned

  async function approveLine(lineId) {
    setActioning(lineId);
    try {
      await reviewApprovalLine(req.request_id, lineId, "APPROVED", null);
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setActioning(null);
    }
  }

  async function rejectLine(lineId, reason) {
    setActioning(lineId);
    setRejectTarget(null);
    try {
      await reviewApprovalLine(req.request_id, lineId, "REJECTED", reason);
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setActioning(null);
    }
  }

  async function cancelReq() {
    const reason = window.prompt("Cancel reason (required):");
    if (!reason?.trim()) return;
    try {
      await cancelApproval(req.request_id, reason);
      onRefresh();
    } catch (e) {
      alert(e.message);
    }
  }

  const pendingLines = req.lines.filter(l => l.status === "PENDING");
  const userCanAct = canApprove();

  return (
    <>
      {rejectTarget && (
        <RejectModal
          line={rejectTarget}
          onConfirm={r => rejectLine(rejectTarget.line_id, r)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      <div className="panel" style={{ marginBottom: "0.75rem", padding: "1rem 1.25rem" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#374151", display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 600 }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {req.request_type.replace(/_/g, " ")}
          </button>

          <StatusBadge status={req.status} />

          {req.retry_count > 0 && (
            <span style={{ fontSize: "0.78rem", color: "#dc2626", fontWeight: 600 }}>
              Retry {req.retry_count}/2
            </span>
          )}

          <span style={{ fontSize: "0.8rem", color: "#6b7280", marginLeft: "auto" }}>
            {new Date(req.created_at).toLocaleString("en-IN")}
          </span>

          {req.status === "PENDING_APPROVAL" && canWriteConfig() && (
            <button
              className="outline-button"
              style={{ fontSize: "0.78rem", padding: "3px 10px", color: "#6b7280" }}
              onClick={cancelReq}
            >
              Cancel
            </button>
          )}
        </div>

        <div style={{ marginTop: "0.35rem", fontSize: "0.82rem", color: "#6b7280" }}>
          {req.lines.length} line(s) — {pendingLines.length} pending
          {req.requested_by ? ` · Requested by admin` : " · Requested by SYSTEM"}
        </div>

        {/* Lines */}
        {expanded && (
          <div style={{ marginTop: "0.75rem", borderTop: "1px solid #f3f4f6", paddingTop: "0.75rem" }}>
            {req.lines.map(line => (
              <div key={line.line_id} style={{
                display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
                padding: "0.6rem 0", borderBottom: "1px solid #f9fafb",
              }}>
                <StatusBadge status={line.status} colors={LINE_STATUS_COLORS} />

                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>{line.stakeholder_name ?? line.stakeholder_id}</div>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{line.description}</div>
                  {line.rejection_reason && (
                    <div style={{ fontSize: "0.78rem", color: "#dc2626", marginTop: "0.2rem" }}>
                      Reason: {line.rejection_reason}
                    </div>
                  )}
                </div>

                {line.amount != null && (
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    ₹{Number(line.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                )}

                {line.status === "PENDING" && userCanAct && (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      className="button"
                      style={{ fontSize: "0.78rem", padding: "4px 12px", background: "#16a34a" }}
                      disabled={actioning === line.line_id}
                      onClick={() => approveLine(line.line_id)}
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                    <button
                      className="outline-button"
                      style={{ fontSize: "0.78rem", padding: "4px 12px", color: "#dc2626", borderColor: "#dc2626" }}
                      disabled={actioning === line.line_id}
                      onClick={() => setRejectTarget(line)}
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}

            {req.status === "NEEDS_CORRECTION" && (
              <div className="notice" style={{ marginTop: "0.75rem", background: "#fef3c7", borderColor: "#d97706" }}>
                <AlertTriangle size={16} style={{ color: "#d97706", flexShrink: 0 }} />
                <span style={{ fontSize: "0.85rem" }}>
                  This request has been rejected twice. A SUPER or CHECKER must manually correct and resubmit it.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "PENDING_APPROVAL", label: "Pending" },
  { value: "NEEDS_CORRECTION", label: "Needs correction" },
  { value: "PARTIAL",          label: "Partial" },
  { value: "EXECUTED",         label: "Executed" },
  { value: "REJECTED",         label: "Rejected" },
  { value: "CANCELLED",        label: "Cancelled" },
];

export function ApprovalsPage() {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING_APPROVAL");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const data = await listApprovals({ status: statusFilter || undefined });
      setRequests(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <p className="eyebrow">Operations</p>
          <h1 style={{ margin: 0 }}>Approval Queue</h1>
        </div>
        <button className="outline-button" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>

      {/* Status filter chips */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            style={{
              padding: "4px 14px", borderRadius: 99, fontSize: "0.82rem", fontWeight: 500, cursor: "pointer",
              border: "1px solid",
              borderColor: statusFilter === f.value ? "#2563eb" : "#d1d5db",
              background: statusFilter === f.value ? "#eff6ff" : "white",
              color: statusFilter === f.value ? "#2563eb" : "#374151",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      {!isLoading && requests.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          <CheckCircle2 size={36} style={{ marginBottom: "0.75rem", color: "#16a34a" }} />
          <p style={{ margin: 0 }}>No requests matching this filter.</p>
        </div>
      )}

      {requests.map(req => (
        <RequestRow key={req.request_id} req={req} onRefresh={load} />
      ))}
    </main>
  );
}
