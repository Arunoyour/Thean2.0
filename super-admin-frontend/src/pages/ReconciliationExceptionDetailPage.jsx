import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, Send } from "lucide-react";
import {
  getReconciliationException,
  assignReconciliationException,
  escalateReconciliationException,
  resolveReconciliationException,
  listAdmins,
} from "../lib/api.js";
import { canApprove, canWriteConfig } from "../lib/role.js";

const SEVERITY_COLORS = { HIGH: "#dc2626", MEDIUM: "#d97706", LOW: "#2563eb" };

function AmountCell({ label, value, missing }) {
  return (
    <div style={{ flex: 1, minWidth: 160, padding: "1rem", background: missing ? "#fff7f7" : "#f9fafb", borderRadius: 8, border: `1px solid ${missing ? "#fca5a5" : "#e5e7eb"}` }}>
      <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: "0.35rem 0 0", fontSize: "1.2rem", fontWeight: 700, color: missing ? "#dc2626" : "#111827" }}>
        {missing ? "Not found" : `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
      </p>
    </div>
  );
}

export function ReconciliationExceptionDetailPage() {
  const { exceptionId } = useParams();
  const navigate = useNavigate();

  const [exc,       setExc]       = useState(null);
  const [admins,    setAdmins]    = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState("");

  const [showResolve,  setShowResolve]  = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolving,    setResolving]    = useState(false);
  const [escalating,   setEscalating]   = useState(false);
  const [assigning,    setAssigning]    = useState(false);
  const [assignTo,     setAssignTo]     = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [excData, adminList] = await Promise.all([
        getReconciliationException(exceptionId),
        listAdmins(),
      ]);
      setExc(excData);
      setAdmins(adminList.filter(a => a.is_active));
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [exceptionId]);

  async function handleEscalate() {
    setEscalating(true);
    try {
      await escalateReconciliationException(exceptionId);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setEscalating(false);
    }
  }

  async function handleAssign() {
    if (!assignTo) return;
    setAssigning(true);
    try {
      await assignReconciliationException(exceptionId, assignTo);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setAssigning(false);
    }
  }

  async function handleResolve(e) {
    e.preventDefault();
    if (!resolutionNote.trim()) return;
    setResolving(true);
    try {
      await resolveReconciliationException(exceptionId, resolutionNote);
      setShowResolve(false);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setResolving(false);
    }
  }

  if (isLoading) return <main className="page"><p style={{ color: "#6b7280" }}>Loading…</p></main>;
  if (error)     return <main className="page"><div className="error">{error}</div></main>;
  if (!exc)      return null;

  const sevColor = SEVERITY_COLORS[exc.severity] ?? "#6b7280";
  const match    = exc.match ?? {};
  const isResolved = exc.status === "RESOLVED";

  return (
    <main className="page">
      {/* Resolve modal */}
      {showResolve && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 460, padding: "2rem" }}>
            <h2 style={{ marginTop: 0 }}>Resolve Exception</h2>
            <form onSubmit={handleResolve} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label>
                Resolution notes <span style={{ color: "#dc2626" }}>*</span>
                <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                  rows={4} placeholder="Describe how this exception was resolved…" required />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="outline-button" onClick={() => setShowResolve(false)}>Cancel</button>
                <button type="submit" className="button" style={{ background: "#16a34a" }} disabled={resolving || !resolutionNote.trim()}>
                  {resolving ? "Resolving…" : "Mark Resolved"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button className="outline-button" style={{ marginBottom: "1rem", fontSize: "0.82rem" }}
        onClick={() => navigate("/dashboard/reconciliation")}>
        <ArrowLeft size={14} /> Back to reconciliation
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            {exc.severity === "HIGH" && <AlertTriangle size={20} style={{ color: sevColor }} />}
            <span style={{ fontWeight: 700, color: sevColor, fontSize: "0.9rem" }}>{exc.severity} SEVERITY</span>
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>·</span>
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{exc.exception_type.replace(/_/g, " ")}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>{exc.description}</h1>
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.85rem" }}>
            Raised {new Date(exc.created_at).toLocaleString("en-IN")}
            {exc.assigned_to && ` · Assigned`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="outline-button" onClick={load}><RefreshCw size={15} /></button>
          {!isResolved && canApprove() && (
            <button className="outline-button" style={{ color: "#7c3aed", borderColor: "#7c3aed" }}
              disabled={escalating || exc.status === "ESCALATED"}
              onClick={handleEscalate}>
              <Send size={15} /> {exc.status === "ESCALATED" ? "Escalated" : "Escalate to Queue"}
            </button>
          )}
          {!isResolved && canApprove() && (
            <button className="button" style={{ background: "#16a34a" }} onClick={() => setShowResolve(true)}>
              <CheckCircle2 size={15} /> Resolve
            </button>
          )}
        </div>
      </div>

      {/* Three-way amount comparison */}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Three-way Amount Comparison</h2>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <AmountCell label="Settlement Batch"  value={match.batch_amount}     missing={match.batch_amount == null} />
          <AmountCell label="Gateway Event"     value={match.gateway_amount}   missing={match.gateway_amount == null} />
          <AmountCell label="Bank Statement"    value={match.statement_amount} missing={match.statement_amount == null} />
          <div style={{ flex: 1, minWidth: 160, padding: "1rem", background: "#fef3c7", borderRadius: 8, border: "1px solid #fcd34d" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Variance</p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "1.2rem", fontWeight: 700, color: "#92400e" }}>
              ₹{Number(match.variance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", color: "#6b7280" }}>
          Match type: <strong>{(match.match_type ?? "—").replace(/_/g, " ")}</strong>
        </p>
      </div>

      {/* Assign section */}
      {!isResolved && canWriteConfig() && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Assign for Review</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ flex: 1 }}>
              <option value="">Select admin…</option>
              {admins.filter(a => ["CHECKER", "SUPERVISOR", "SUPER"].includes(a.role)).map(a => (
                <option key={a.admin_id} value={a.admin_id}>{a.full_name} ({a.role})</option>
              ))}
            </select>
            <button className="button" disabled={!assignTo || assigning} onClick={handleAssign}>
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {/* Resolution */}
      {isResolved && (
        <div className="panel" style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <CheckCircle2 size={18} style={{ color: "#16a34a" }} />
            <span style={{ fontWeight: 600, color: "#16a34a" }}>Resolved</span>
            <span style={{ color: "#6b7280", fontSize: "0.82rem" }}>
              {exc.resolved_at && new Date(exc.resolved_at).toLocaleString("en-IN")}
            </span>
          </div>
          <p style={{ margin: 0, color: "#374151" }}>{exc.resolution_notes}</p>
        </div>
      )}
    </main>
  );
}
