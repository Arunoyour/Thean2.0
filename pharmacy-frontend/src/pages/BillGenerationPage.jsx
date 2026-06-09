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
import { fetchPharmacyMedia, getPharmacyOrderById, submitPharmacyBill } from "../lib/api.js";

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pickupCode, setPickupCode] = useState("");
  const [mediaUrls, setMediaUrls] = useState({ prescriptions: [], voice: null });
  const [mediaError, setMediaError] = useState("");
  const objectUrlsRef = useRef([]);

  useEffect(() => {
    let mounted = true;
    async function loadOrder() {
      setIsLoading(true);
      try {
        const data = await getPharmacyOrderById(orderId);
        if (!mounted) return;
        setOrder(data);
        // Pre-fill rows if typed items exist
        if (data.items?.length) {
          setRows(prefillRows(data.items));
        } else {
          setRows([DEFAULT_ROW()]);
        }
        // Load media
        const prescriptions = await Promise.all(
          (data.prescription_files || []).map(async (fileInfo) => {
            const blob = await fetchPharmacyMedia(fileInfo.pharmacy_url);
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);
            return { ...fileInfo, objectUrl: url };
          }),
        );
        let voice = null;
        if (data.voice_note_file?.pharmacy_url) {
          const blob = await fetchPharmacyMedia(data.voice_note_file.pharmacy_url);
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.push(url);
          voice = { ...data.voice_note_file, objectUrl: url };
        }
        if (mounted) setMediaUrls({ prescriptions, voice });
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadOrder();
    return () => {
      mounted = false;
    };
  }, [orderId]);

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
    setRows((rs) => rs.length > 1 ? rs.filter((r) => r._id !== id) : rs);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    // Validate
    for (const row of rows) {
      if (!row.name.trim()) { setError("Every row must have a medicine name."); return; }
      if (!row.qty || Number(row.qty) <= 0) { setError(`Row "${row.name}": quantity must be > 0.`); return; }
      if (!row.amount || Number(row.amount) <= 0) { setError(`Row "${row.name}": amount must be > 0.`); return; }
      if (row.unavailable && !row.substitute_name.trim()) {
        setError(`Row "${row.name}": enter substitute medicine name.`); return;
      }
    }
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
      setPickupCode(updated.pickup_code || "");
      setOrder(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasMedia = Boolean(
    (order?.prescription_files || []).length || order?.voice_note_file,
  );

  if (isLoading) {
    return (
      <PharmacyPageShell>
        <div className="panel loading-panel">Loading order…</div>
      </PharmacyPageShell>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (pickupCode) {
    return (
      <PharmacyPageShell>
        <div className="bill-success-screen">
          <PackageCheck size={56} className="bill-success-icon" />
          <h1>Order Ready for Pickup!</h1>
          <p>Share this code with the customer to confirm pickup.</p>
          <div className="pickup-code-big">
            <QrCode size={28} />
            <span>{pickupCode}</span>
          </div>
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
      <form onSubmit={handleSubmit} className="bill-form">
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
                          placeholder="Substitute name"
                          className="sub-name-input"
                          value={row.substitute_name}
                          onChange={(e) => updateRow(row._id, "substitute_name", e.target.value)}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  <td>
                    <button
                      className="icon-button danger"
                      type="button"
                      aria-label="Remove row"
                      onClick={() => removeRow(row._id)}
                      disabled={rows.length === 1}
                    >
                      <Trash2 size={15} />
                    </button>
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
            Total: ₹
            {rows
              .reduce((sum, r) => sum + (parseFloat(r.amount) || 0) * (parseFloat(r.qty) || 0), 0)
              .toFixed(2)}
          </div>
          <button className="button" type="submit" disabled={isSubmitting}>
            <Send size={16} />
            {isSubmitting ? "Submitting…" : "Submit Bill & Mark Ready for Pickup"}
          </button>
        </div>
      </form>
    </PharmacyPageShell>
  );
}
