import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Paperclip, RefreshCw, Upload } from "lucide-react";
import {
  listPaymentProofs,
  uploadPaymentProof,
  verifyPaymentProof,
} from "../lib/api.js";
import { canWriteConfig } from "../lib/role.js";
import { validateFileSize } from "../lib/validation.js";
import { BackButton } from "../components/BackButton.jsx";

const PROOF_TYPE_COLORS = { INWARD: "#2563eb", OUTWARD: "#16a34a" };
const METHOD_LABELS = {
  BANK_TRANSFER: "Bank Transfer",
  UPI:    "UPI",
  CASH:   "Cash",
  CHEQUE: "Cheque",
};

export function PaymentProofsPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [proofs,    setProofs]    = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({
    proof_type: "OUTWARD",
    amount: "",
    payment_method: "BANK_TRANSFER",
    notes: "",
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const data = await listPaymentProofs(batchId);
      setProofs(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [batchId]);

  async function handleUpload(e) {
    e.preventDefault();
    setFormError("");
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }
    const sizeErr = validateFileSize(selectedFile);
    if (sizeErr) { setFormError(sizeErr); return; }
    setUploading(true);
    try {
      await uploadPaymentProof(batchId, {
        proof_type:     form.proof_type,
        amount:         Number(form.amount),
        payment_method: form.payment_method,
        notes:          form.notes || null,
        file:           selectedFile,
      });
      setShowUpload(false);
      setForm({ proof_type: "OUTWARD", amount: "", payment_method: "BANK_TRANSFER", notes: "" });
      setSelectedFile(null);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleVerify(proofId) {
    try {
      await verifyPaymentProof(proofId);
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <main className="page">
      <BackButton />
      {/* Upload modal */}
      {showUpload && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 460, padding: "2rem" }}>
            <h2 style={{ marginTop: 0 }}>Upload Payment Proof</h2>
            <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label>
                Proof type
                <select value={form.proof_type} onChange={e => setForm(f => ({ ...f, proof_type: e.target.value }))}>
                  <option value="OUTWARD">Outward (paid to stakeholder)</option>
                  <option value="INWARD">Inward (received from stakeholder)</option>
                </select>
              </label>
              <label>
                Amount (₹) <span style={{ color: "#dc2626" }}>*</span>
                <input type="number" min="0.01" step="0.01" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </label>
              <label>
                Payment method
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>
                Notes
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </label>
              <label>
                Attach file (optional)
                <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ marginTop: "0.35rem" }}
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
              </label>
              {formError && <div className="error" style={{ margin: 0 }}>{formError}</div>}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="outline-button" onClick={() => setShowUpload(false)}>Cancel</button>
                <button type="submit" className="button" disabled={uploading}>
                  {uploading ? "Uploading…" : "Upload Proof"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <button className="outline-button" style={{ marginBottom: "1rem", fontSize: "0.82rem" }}
        onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Back to batch
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <p className="eyebrow">Settlement</p>
          <h1 style={{ margin: 0 }}>Payment Proofs</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="outline-button" onClick={load}><RefreshCw size={15} /></button>
          {canWriteConfig() && (
            <button className="button" onClick={() => setShowUpload(true)}>
              <Upload size={15} /> Upload Proof
            </button>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      {!isLoading && proofs.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          No payment proofs uploaded yet for this batch.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {proofs.map(p => {
          const typeColor = PROOF_TYPE_COLORS[p.proof_type] ?? "#6b7280";
          return (
            <div key={p.proof_id} className="panel" style={{ padding: "1rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                {/* Type badge */}
                <span style={{
                  display: "inline-block", padding: "2px 10px", borderRadius: 99,
                  fontSize: "0.75rem", fontWeight: 600,
                  background: typeColor + "18", color: typeColor, border: `1px solid ${typeColor}40`,
                }}>
                  {p.proof_type}
                </span>

                {/* Amount */}
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>
                  ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>

                {/* Method */}
                <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{METHOD_LABELS[p.payment_method] ?? p.payment_method}</span>

                {/* Verified badge */}
                {p.verified ? (
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.3rem", color: "#16a34a", fontSize: "0.82rem", fontWeight: 600 }}>
                    <CheckCircle2 size={14} /> Verified
                  </span>
                ) : canWriteConfig() ? (
                  <button className="outline-button" style={{ marginLeft: "auto", fontSize: "0.78rem", padding: "3px 10px", color: "#2563eb", borderColor: "#2563eb" }}
                    onClick={() => handleVerify(p.proof_id)}>
                    Mark Verified
                  </button>
                ) : (
                  <span style={{ marginLeft: "auto", color: "#d97706", fontSize: "0.82rem", fontWeight: 600 }}>Unverified</span>
                )}
              </div>

              {p.notes && (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#374151" }}>{p.notes}</p>
              )}

              {p.file_path && (
                <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "#2563eb" }}>
                  <Paperclip size={13} />
                  <a href={`/${p.file_path}`} target="_blank" rel="noreferrer">View attachment</a>
                </div>
              )}

              <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: "#9ca3af" }}>
                Uploaded {new Date(p.created_at).toLocaleString("en-IN")}
                {p.verified_at && ` · Verified ${new Date(p.verified_at).toLocaleString("en-IN")}`}
              </p>
            </div>
          );
        })}
      </div>
    </main>
  );
}
