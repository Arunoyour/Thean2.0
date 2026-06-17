import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Mic, Paperclip, RefreshCw, Send } from "lucide-react";
import {
  getDispute,
  resolveDispute,
  addDisputeReply,
  assignDisputeAdmin,
  listAdmins,
  closeDispute,
} from "../lib/api.js";
import { canApprove, canWriteConfig } from "../lib/role.js";
import { validateFileSize } from "../lib/validation.js";
import { BackButton } from "../components/BackButton.jsx";

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
  ADMIN:        "#374151",
  SYSTEM:       "#9ca3af",
};

const TYPE_LABELS = {
  WRONG_CHARGE:        "Wrong charge",
  REFUND_NOT_RECEIVED: "Refund not received",
  SETTLEMENT_DISPUTE:  "Settlement dispute",
  COD_DISPUTE:         "COD dispute",
  ORDER_DISPUTE:       "Order dispute",
  OTHER:               "Other",
};

function MessageBubble({ msg }) {
  const isAdmin    = ["ADMIN", "SYSTEM"].includes(msg.sender_type);
  const sideColor  = APP_COLORS[msg.sender_type] ?? "#6b7280";
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isAdmin ? "flex-end" : "flex-start",
      marginBottom: "0.75rem",
    }}>
      <div style={{
        maxWidth: "75%", padding: "0.75rem 1rem", borderRadius: 12,
        background: isAdmin ? "#eff6ff" : "#f9fafb",
        border: `1px solid ${isAdmin ? "#bfdbfe" : "#e5e7eb"}`,
        position: "relative",
      }}>
        {msg.is_internal && (
          <span style={{ fontSize: "0.7rem", color: "#9ca3af", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
            🔒 Internal note
          </span>
        )}
        <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: sideColor }}>
          {msg.sender_name} <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: "0.75rem" }}>· {msg.sender_type.replace(/_/g, " ")}</span>
        </p>
        {msg.text_content && (
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.88rem", color: "#374151", whiteSpace: "pre-wrap" }}>{msg.text_content}</p>
        )}
        {msg.voice_file_path && (
          <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", color: "#2563eb", fontSize: "0.82rem" }}>
            <Mic size={14} />
            <a href={`/${msg.voice_file_path}`} target="_blank" rel="noreferrer">
              Voice note {msg.voice_duration_secs ? `(${msg.voice_duration_secs}s)` : ""}
            </a>
          </div>
        )}
        {msg.image_file_path && (
          <div style={{ marginTop: "0.5rem" }}>
            <img src={`/${msg.image_file_path}`} alt="Attached" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, objectFit: "cover" }} />
          </div>
        )}
        {msg.attachment_path && (
          <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", color: "#2563eb", fontSize: "0.82rem" }}>
            <Paperclip size={14} />
            <a href={`/${msg.attachment_path}`} target="_blank" rel="noreferrer">
              {msg.attachment_name ?? "Attachment"}
            </a>
          </div>
        )}
        <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", color: "#9ca3af" }}>
          {new Date(msg.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </div>
    </div>
  );
}

export function DisputeDetailPage() {
  const { disputeId } = useParams();
  const navigate = useNavigate();

  const [dispute,   setDispute]   = useState(null);
  const [admins,    setAdmins]    = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState("");

  // Reply form
  const [replyText,      setReplyText]      = useState("");
  const [isInternal,     setIsInternal]     = useState(false);
  const [replyVoice,     setReplyVoice]     = useState(null);
  const [replyImage,     setReplyImage]     = useState(null);
  const [replyAttach,    setReplyAttach]    = useState(null);
  const [sending,        setSending]        = useState(false);

  // Resolve modal
  const [showResolve,    setShowResolve]    = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolving,      setResolving]      = useState(false);

  // Admin close (60-day)
  const [showClose,    setShowClose]    = useState(false);
  const [closeNote,    setCloseNote]    = useState("");
  const [closing,      setClosing]      = useState(false);
  const [closeError,   setCloseError]   = useState("");

  // Assign
  const [assignTo,       setAssignTo]       = useState("");
  const [assigning,      setAssigning]      = useState(false);

  const voiceRef  = useRef(null);
  const imageRef  = useRef(null);
  const attachRef = useRef(null);

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [d, adminList] = await Promise.all([
        getDispute(disputeId),
        listAdmins().catch(() => []),
      ]);
      setDispute(d);
      setAdmins(Array.isArray(adminList) ? adminList.filter(a => a.is_active) : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [disputeId]);

  async function handleSendReply(e) {
    e.preventDefault();
    if (!replyText.trim() && !replyVoice && !replyImage && !replyAttach) return;
    for (const f of [replyVoice, replyImage, replyAttach]) {
      const err = validateFileSize(f);
      if (err) { alert(err); return; }
    }
    setSending(true);
    try {
      await addDisputeReply(disputeId, {
        text_content: replyText || null,
        voice_file:   replyVoice,
        image_file:   replyImage,
        attachment_file: replyAttach,
        is_internal:  isInternal,
      });
      setReplyText(""); setReplyVoice(null); setReplyImage(null); setReplyAttach(null);
      if (voiceRef.current)  voiceRef.current.value  = "";
      if (imageRef.current)  imageRef.current.value  = "";
      if (attachRef.current) attachRef.current.value = "";
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  }

  async function handleResolve(e) {
    e.preventDefault();
    if (!resolutionNote.trim()) return;
    setResolving(true);
    try {
      await resolveDispute(disputeId, resolutionNote);
      setShowResolve(false);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setResolving(false);
    }
  }

  async function handleAssign() {
    if (!assignTo) return;
    setAssigning(true);
    try {
      await assignDisputeAdmin(disputeId, assignTo);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setAssigning(false);
    }
  }

  if (isLoading) return <main className="page">
      <BackButton /><p style={{ color: "#6b7280" }}>Loading dispute…</p></main>;
  if (error)     return <main className="page"><div className="error">{error}</div></main>;
  if (!dispute)  return null;

  async function handleAdminClose(e) {
    e.preventDefault();
    setCloseError("");
    setClosing(true);
    try {
      await closeDispute(disputeId, closeNote);
      setShowClose(false);
      load();
    } catch (err) {
      setCloseError(err.message);
    } finally {
      setClosing(false);
    }
  }

  const isResolved = ["RESOLVED", "CLOSED"].includes(dispute.status);
  const statColor  = STATUS_COLORS[dispute.status] ?? "#6b7280";
  const visibleMessages = dispute.messages ?? [];

  return (
    <main className="page">
      {/* Resolve modal */}
      {showResolve && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 460, padding: "2rem" }}>
            <h2 style={{ marginTop: 0 }}>Resolve Dispute</h2>
            <form onSubmit={handleResolve} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label>
                Resolution notes <span style={{ color: "#dc2626" }}>*</span>
                <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                  rows={4} placeholder="Explain how the issue was resolved…" required />
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

      {/* Admin close modal */}
      {showClose && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 460, padding: "2rem" }}>
            <h2 style={{ marginTop: 0 }}>Close Dispute</h2>
            {!dispute.admin_can_close ? (
              <>
                <p style={{ color: "#d97706", margin: "0 0 1rem" }}>
                  This dispute is only {dispute.age_days} day{dispute.age_days !== 1 ? "s" : ""} old. Admin can only close disputes after 60 days.<br />
                  <strong>{60 - (dispute.age_days ?? 0)} day(s) remaining.</strong>
                </p>
                <button className="outline-button" onClick={() => setShowClose(false)}>Cancel</button>
              </>
            ) : (
              <form onSubmit={handleAdminClose} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <label>
                  Closing notes <span style={{ color: "#dc2626" }}>*</span>
                  <textarea value={closeNote} onChange={e => setCloseNote(e.target.value)}
                    rows={4} placeholder="Explain why this dispute is being closed…" required />
                </label>
                {closeError && <div className="error">{closeError}</div>}
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <button type="button" className="outline-button" onClick={() => setShowClose(false)}>Cancel</button>
                  <button type="submit" className="button" style={{ background: "#6b7280" }} disabled={closing || !closeNote.trim()}>
                    {closing ? "Closing…" : "Close Dispute"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <button className="outline-button" style={{ marginBottom: "1rem", fontSize: "0.82rem" }}
        onClick={() => navigate("/dashboard/disputes")}>
        <ArrowLeft size={14} /> Back to disputes
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontWeight: 600, color: APP_COLORS[dispute.raised_by_app] ?? "#6b7280", fontSize: "0.85rem" }}>
              {dispute.raised_by_app.replace(/_/g, " ")}
            </span>
            <span style={{ color: "#9ca3af" }}>·</span>
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{TYPE_LABELS[dispute.dispute_type] ?? dispute.dispute_type}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>{dispute.raised_by_name}</h1>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", alignItems: "center" }}>
            <span style={{
              display: "inline-block", padding: "2px 9px", borderRadius: 99,
              fontSize: "0.75rem", fontWeight: 600,
              background: statColor + "18", color: statColor, border: `1px solid ${statColor}40`,
            }}>
              {dispute.status.replace(/_/g, " ")}
            </span>
            {dispute.reopened_count > 0 && (
              <span style={{ fontSize: "0.78rem", color: "#7c3aed", fontWeight: 600 }}>
                Reopened ×{dispute.reopened_count}
              </span>
            )}
            {dispute.age_days != null && (
              <span style={{ fontSize: "0.78rem", color: dispute.age_days >= 60 ? "#dc2626" : "#9ca3af" }}>
                {dispute.age_days}d old
              </span>
            )}
            {dispute.tagged_sectors?.length > 0 && dispute.tagged_sectors.map(s => (
              <span key={s} style={{ fontSize: "0.72rem", padding: "1px 8px", borderRadius: 99, background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                {s}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="outline-button" onClick={load}><RefreshCw size={15} /></button>
          {!isResolved && canApprove() && (
            <>
              <button className="button" style={{ background: "#16a34a" }} onClick={() => setShowResolve(true)}>
                <CheckCircle2 size={15} /> Resolve
              </button>
              <button className="outline-button" style={{ borderColor: "#6b7280", color: "#6b7280" }} onClick={() => setShowClose(true)}>
                Close {dispute.admin_can_close ? "" : `(${60 - (dispute.age_days ?? 0)}d left)`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reference info */}
      {dispute.reference_detail && Object.keys(dispute.reference_detail).length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem", padding: "0.85rem 1.25rem", background: "#f9fafb" }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
            {dispute.reference_type} details
          </p>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            {Object.entries(dispute.reference_detail).map(([k, v]) => (
              <div key={k}>
                <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{k.replace(/_/g, " ")}</span>
                <p style={{ margin: "0.1rem 0 0", fontWeight: 600, fontSize: "0.88rem" }}>{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign */}
      {!isResolved && canWriteConfig() && (
        <div className="panel" style={{ marginBottom: "1rem", padding: "0.85rem 1.25rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.88rem" }}>Assign to admin</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ flex: 1, fontSize: "0.85rem" }}>
              <option value="">Select admin…</option>
              {admins.filter(a => ["CHECKER", "SUPERVISOR", "SUPER"].includes(a.role)).map(a => (
                <option key={a.admin_id} value={a.admin_id}>{a.full_name} ({a.role})</option>
              ))}
            </select>
            <button className="button" disabled={!assignTo || assigning} onClick={handleAssign}>
              {assigning ? "…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {/* Resolution banner */}
      {isResolved && dispute.resolution_notes && (
        <div className="panel" style={{ marginBottom: "1rem", background: "#f0fdf4", borderColor: "#86efac" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
            <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
            <span style={{ fontWeight: 600, color: "#16a34a" }}>Resolved</span>
            {dispute.resolved_at && (
              <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                {new Date(dispute.resolved_at).toLocaleString("en-IN")}
              </span>
            )}
          </div>
          <p style={{ margin: 0, color: "#374151", fontSize: "0.88rem" }}>{dispute.resolution_notes}</p>
        </div>
      )}

      {/* Messages thread */}
      <div className="panel" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontWeight: 600, fontSize: "0.9rem", color: "#374151" }}>
          Conversation ({visibleMessages.filter(m => !m.is_internal).length})
        </p>
        {visibleMessages.length === 0 && (
          <p style={{ color: "#9ca3af", margin: 0 }}>No messages yet.</p>
        )}
        {visibleMessages.map(m => <MessageBubble key={m.message_id} msg={m} />)}
      </div>

      {/* Reply form */}
      {!isResolved && canApprove() && (
        <div className="panel" style={{ padding: "1rem 1.25rem" }}>
          <p style={{ margin: "0 0 0.75rem", fontWeight: 600, fontSize: "0.9rem" }}>Reply</p>
          <form onSubmit={handleSendReply} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              placeholder="Type a reply…"
              style={{ resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer", color: "#6b7280" }}>
                <Mic size={15} /> Voice
                <input ref={voiceRef} type="file" accept="audio/*" style={{ display: "none" }}
                  onChange={e => setReplyVoice(e.target.files?.[0] ?? null)} />
                {replyVoice && <span style={{ color: "#2563eb" }}>{replyVoice.name}</span>}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer", color: "#6b7280" }}>
                🖼 Image
                <input ref={imageRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => setReplyImage(e.target.files?.[0] ?? null)} />
                {replyImage && <span style={{ color: "#2563eb" }}>{replyImage.name}</span>}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer", color: "#6b7280" }}>
                <Paperclip size={15} /> File
                <input ref={attachRef} type="file" style={{ display: "none" }}
                  onChange={e => setReplyAttach(e.target.files?.[0] ?? null)} />
                {replyAttach && <span style={{ color: "#2563eb" }}>{replyAttach.name}</span>}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.82rem", marginLeft: "auto", color: "#6b7280", cursor: "pointer" }}>
                <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />
                Internal note
              </label>
              <button type="submit" className="button"
                disabled={sending || (!replyText.trim() && !replyVoice && !replyImage && !replyAttach)}>
                <Send size={15} /> {sending ? "Sending…" : "Send Reply"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status history */}
      {dispute.history?.length > 0 && (
        <div className="panel" style={{ marginTop: "1rem", padding: "0.85rem 1.25rem" }}>
          <p style={{ margin: "0 0 0.75rem", fontWeight: 600, fontSize: "0.88rem", color: "#6b7280" }}>Status History</p>
          {dispute.history.map(h => (
            <div key={h.history_id} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem", fontSize: "0.8rem" }}>
              <span style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>
                {new Date(h.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
              </span>
              <span style={{ color: "#6b7280" }}>
                {h.old_status ? `${h.old_status} → ` : ""}<strong>{h.new_status}</strong>
                {h.changed_by_name !== "SYSTEM" && ` · ${h.changed_by_name}`}
                {h.notes && ` — ${h.notes}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
