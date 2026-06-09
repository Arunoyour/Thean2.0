import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileAudio,
  FileImage,
  PackageCheck,
  PlusCircle,
  QrCode,
  Send,
  Trash2,
} from "lucide-react";

import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { fetchPharmacyMedia, getPharmacyOrderById, isAbortError, submitPharmacyBill } from "../lib/api.js";

// Draft persistence — row edits survive navigation away from the page
function draftKey(orderId) { return `thean_bill_draft_${orderId}`; }
function loadRowDraft(orderId) {
  try { const s = window.localStorage.getItem(draftKey(orderId)); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function saveRowDraft(orderId, rows) {
  try { window.localStorage.setItem(draftKey(orderId), JSON.stringify(rows)); } catch { /* ignore */ }
}
function clearRowDraft(orderId) {
  try { window.localStorage.removeItem(draftKey(orderId)); } catch { /* ignore */ }
}

const DEFAULT_ROW = () => ({
  _id: Math.random().toString(36).slice(2),
  name: "",
  qty: "",
  type: "",
  amount: "",
  unavailable: false,
  substitute_name: "",
});

function prefillRows(items) {
  return items.map((item) => ({
    _id: Math.random().toString(36).slice(2),
    name: item.name || "",
    qty: item.quantity || item.qty || "",
    type: item.metric || item.type || "",
    amount: "",
    unavailable: false,
    substitute_name: "",
  }));
}

export function BillGenerationPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [rows, setRows] = useState([DEFAULT_ROW()]);
  // Track whether rows have been initialised from the order/draft yet
  const rowsReadyRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pickupCode, setPickupCode] = useState("");
  const [mediaUrls, setMediaUrls] = useState({ prescriptions: [], voice: null });
  const [mediaError, setMediaError] = useState("");
  const [pendingDeleteRowId, setPendingDeleteRowId] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const objectUrlsRef = useRef([]);

  useEffect(() => {
    const ctrl = new AbortController();
    rowsReadyRef.current = false;

    async function loadOrder() {
      setIsLoading(true);
      try {
        const data = await getPharmacyOrderById(orderId);
        if (ctrl.signal.aborted) return;
        setOrder(data);

        // Prefer saved draft rows; fall back to order pre-fill
        const draft = loadRowDraft(orderId);
        if (draft?.length) {
          setRows(draft);
        } else if (data.items?.length) {
          setRows(prefillRows(data.items));
        } else {
          setRows([DEFAULT_ROW()]);
        }
        rowsReadyRef.current = true;

        // Load media (individual fetch errors are non-fatal)
        const prescriptions = await Promise.all(
          (data.prescription_files || []).map(async (fileInfo) => {
            if (ctrl.signal.aborted) return null;
            const blob = await fetchPharmacyMedia(fileInfo.pharmacy_url);
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);
            return { ...fileInfo, objectUrl: url };
          }),
        );
        let voice = null;
        if (data.voice_note_file?.pharmacy_url && !ctrl.signal.aborted) {
          const blob = await fetchPharmacyMedia(data.voice_note_file.pharmacy_url);
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.push(url);
          voice = { ...data.voice_note_file, objectUrl: url };
        }
        if (!ctrl.signal.aborted) setMediaUrls({ prescriptions: prescriptions.filter(Boolean), voice });
      } catch (e) {
        if (isAbortError(e)) return; // navigated away — discard silently
        if (!ctrl.signal.aborted) setError(e.message);
      } finally {
        if (!ctrl.signal.aborted) setIsLoading(false);
      }
    }
    loadOrder();
    return () => ctrl.abort();
  }, [orderId]);

  // Save rows as a draft whenever they change (but only after initial load)
  useEffect(() => {
    if (!rowsReadyRef.current) return;
    saveRowDraft(orderId, rows);
  }, [rows, orderId]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function updateRow(id, field, value) {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, DEFAULT_ROW()]);
  }

  function removeRow(id) {
    setPendingDeleteRowId(null);
    setRows((rs) => rs.length > 1 ? rs.filter((r) => r._id !== id) : rs);
  }

  /** Returns an error string if validation fails, null if OK. */
  function validateRows() {
    for (const row of rows) {
      if (!row.name.trim()) return "Every row must have a medicine name.";
      if (!row.qty || Number(row.qty) <= 0) return `Row "${row.name}": quantity must be > 0.`;
      if (!row.amount || Number(row.amount) <= 0) return `Row "${row.name}": amount must be > 0.`;
      if (row.unavailable && !row.substitute_name.trim()) {
        return `Row "${row.name}": enter substitute medicine name.`;
      }
    }
    return null;
  }

  /** Step 1 — validate, then show confirmation panel. */
  function requestSubmit(e) {
    e.preventDefault();
    setError("");
    const validationError = validateRows();
    if (validationError) { setError(validationError); return; }
    setShowSubmitConfirm(true);
  }

  /** Step 2 — user confirmed, do the API call. */
  async function confirmSubmit() {
    const items = rows.map((r) => ({
      name: r.name.trim(),
      qty: String(r.qty),
      type: r.type.trim() || "unit",
      amount: String(r.amount),
      ...(r.unavailable && r.substitute_name.trim() ? { substitute_name: r.substitute_name.trim() } : {}),
    }));
    setIsSubmitting(true);
    try {
      const updated = await submitPharmacyBill(orderId, items);
      clearRowDraft(orderId);
      setPickupCode(updated.pickup_code || "");
      setOrder(updated);
    } catch (err) {
      setError(err.message);
      setShowSubmitConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  const billTotal = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0) * (parseFloat(r.qty) || 0), 0);

  const hasMedia = Boolean(
    (order?.prescription_files || []).length || order?.voice_note_file,
  );

  if (isLoading) {
    return (
      <PharmacyPageShell>
        <div className="panel">
          <div className="bill-skeleton" aria-busy="true" aria-label="Loading order">
            <span className="skeleton skeleton-text-lg" style={{ width: "45%" }} />
            <span className="skeleton skeleton-text-sm" style={{ width: "30%" }} />
            <div className="bill-skeleton-row" style={{ marginTop: "1rem" }}>
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" style={{ width: "2rem" }} />
            </div>
            <div className="bill-skeleton-row">
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" />
              <span className="skeleton skeleton-rect" style={{ width: "2rem" }} />
            </div>
            <span className="skeleton skeleton-rect" style={{ width: "180px", marginTop: "0.5rem" }} />
          </div>
        </div>
      </PharmacyPageShell>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (pickupCode) {
    return (
      <PharmacyPageShell>
        <div className="bill-success-screen">
          <PackageCheck size={56} className="bill-success-icon" />
          <h1>Bill Submitted — Order Ready for Pickup!</h1>
          <p>Share this code with the customer when they arrive to collect their order.</p>
          <div className="pickup-code-big">
            <QrCode size={28} />
            <span>{pickupCode}</span>
          </div>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.5rem" }}>
            The pickup code remains valid until the customer collects the order. Keep this screen open or note it down.
          </p>
          <button className="button" type="button" onClick={() => navigate("/orders")}>
            Back to Order Management
          </button>
        </div>
      </PharmacyPageShell>
    );
  }

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <button className="back-link" type="button" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>
          <p className="eyebrow">Bill Generation</p>
          <h1>Generate Final Bill</h1>
          <p>
            {order?.patient_name || "Customer"} —{" "}
            {order?.substitution_allowed
              ? "Substitution approved"
              : "No substitution allowed"}
          </p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {/* Media viewer for prescriptions / voice */}
      {hasMedia ? (
        <section className="bill-media-section">
          <h2>Prescription Attachments</h2>
          {mediaError ? <div className="error">{mediaError}</div> : null}
          {mediaUrls.prescriptions.length > 0 ? (
            <div className="bill-media-grid">
              {mediaUrls.prescriptions.map((f) =>
                f.content_type === "application/pdf" ? (
                  <a key={f.filename} href={f.objectUrl} target="_blank" rel="noreferrer" className="bill-media-pdf">
                    <FileImage size={20} /> {f.original_name || "PDF Prescription"}
                  </a>
                ) : (
                  <a key={f.filename} href={f.objectUrl} target="_blank" rel="noreferrer">
                    <img src={f.objectUrl} alt={f.original_name || "Prescription"} className="bill-media-thumb" />
                  </a>
                ),
              )}
            </div>
          ) : order?.prescription_files?.length ? (
            <p>Loading prescriptions…</p>
          ) : null}
          {mediaUrls.voice ? (
            <div className="bill-voice-player">
              <FileAudio size={18} /> Voice Note:
              <audio controls src={mediaUrls.voice.objectUrl}>
                <track kind="captions" />
              </audio>
            </div>
          ) : order?.voice_note_file ? (
            <p>Loading voice note…</p>
          ) : null}
        </section>
      ) : null}

      {/* Bill grid */}
      <form onSubmit={requestSubmit} className="bill-form">
        <div className="bill-grid-wrapper">
          <table className="bill-grid">
            <thead>
              <tr>
                <th>Medicine Name</th>
                <th>Qty</th>
                <th>Type / Unit</th>
                <th>Amount (₹)</th>
                {order?.substitution_allowed ? <th>Substitution</th> : null}
                <th aria-label="Remove row" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>
                    <input
                      type="text"
                      placeholder="e.g. Paracetamol 500mg"
                      value={row.name}
                      onChange={(e) => updateRow(row._id, "name", e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder="1"
                      value={row.qty}
                      onChange={(e) => updateRow(row._id, "qty", e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="Tablet / ml / Strip"
                      value={row.type}
                      onChange={(e) => updateRow(row._id, "type", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => updateRow(row._id, "amount", e.target.value)}
                      required
                    />
                  </td>
                  {order?.substitution_allowed ? (
                    <td className="sub-cell">
                      <label className="sub-unavail-label">
                        <input
                          type="checkbox"
                          checked={row.unavailable}
                          onChange={(e) => updateRow(row._id, "unavailable", e.target.checked)}
                        />
                        Not available
                      </label>
                      {row.unavailable ? (
                        <input
                          type="text"
                          placeholder="Substitute name (required)"
                          className="sub-name-input"
                          value={row.substitute_name}
                          onChange={(e) => updateRow(row._id, "substitute_name", e.target.value)}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  <td>
                    {pendingDeleteRowId === row._id ? (
                      <span style={{ display: "flex", gap: "0.25rem", alignItems: "center", fontSize: "0.8rem" }}>
                        <span style={{ color: "#b45309", whiteSpace: "nowrap" }}>Remove?</span>
                        <button
                          type="button"
                          className="danger-button"
                          style={{ padding: "0.15rem 0.4rem", fontSize: "0.8rem" }}
                          onClick={() => removeRow(row._id)}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className="outline-button"
                          style={{ padding: "0.15rem 0.4rem", fontSize: "0.8rem" }}
                          onClick={() => setPendingDeleteRowId(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label="Remove row"
                        onClick={() =>
                          row.name.trim()
                            ? setPendingDeleteRowId(row._id)
                            : removeRow(row._id)
                        }
                        disabled={rows.length === 1}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bill-footer">
          <button className="outline-button" type="button" onClick={addRow}>
            <PlusCircle size={16} /> Add Row
          </button>
          <div className="bill-total">
            Total: ₹{billTotal.toFixed(2)}
          </div>
          <button
            className="button"
            type="submit"
            disabled={isSubmitting || showSubmitConfirm}
          >
            <Send size={16} />
            Submit Bill &amp; Mark Ready for Pickup
          </button>
        </div>

        {/* Confirmation panel — appears after first submit click */}
        {showSubmitConfirm ? (
          <div
            className="bill-submit-confirm"
            style={{
              marginTop: "1rem",
              padding: "1rem",
              border: "1px solid var(--color-border, #e5e7eb)",
              borderRadius: "8px",
              background: "var(--color-surface-2, #f9fafb)",
            }}
          >
            <p style={{ marginBottom: "0.75rem" }}>
              <strong>Confirm submission</strong> — {rows.length} item{rows.length !== 1 ? "s" : ""}, total ₹{billTotal.toFixed(2)}.
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="button"
                type="button"
                disabled={isSubmitting}
                onClick={confirmSubmit}
              >
                <Send size={16} />
                {isSubmitting ? "Submitting…" : "Confirm & Submit"}
              </button>
              <button
                className="outline-button"
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowSubmitConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </PharmacyPageShell>
  );
}
