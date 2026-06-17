import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Paperclip, Send, X } from "lucide-react";
import { getPharmacyOrderById, raisePharmacyDispute, raisePharmacyOrderDispute } from "../lib/api.js";
import { MAX_FILE_SIZE_BYTES, validateFileSize } from "../lib/validation.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// tagged_sectors values are unchanged for backend/admin-filter compatibility —
// only the vendor-facing label changes, since "pharmacy" here means "this is
// about my pharmacy account/billing", not "I'm disputing against myself".
const SECTOR_OPTIONS = [
  { value: "delivery", label: "Delivery" },
  { value: "pharmacy", label: "Platform / Billing" },
];

export function RaiseDisputePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("order_id") || "";
  const referenceType = params.get("reference_type") || "";
  const referenceId = params.get("reference_id") || "";
  const defaultSectors = params.get("sectors") || "delivery";

  const [sectors, setSectors] = useState(defaultSectors.split(",").map((s) => s.trim()).filter(Boolean));
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [orderError, setOrderError] = useState("");
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);

  useEffect(() => {
    if (!orderId) { setIsLoadingOrder(false); return; }
    let isMounted = true;
    getPharmacyOrderById(orderId)
      .then((o) => { if (isMounted) setOrder(o); })
      .catch((e) => { if (isMounted) setOrderError(e.message); })
      .finally(() => { if (isMounted) setIsLoadingOrder(false); });
    return () => { isMounted = false; };
  }, [orderId]);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => { clearInterval(timerRef.current); if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }, []);

  function toggleSector(s) { setSectors((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]); }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" })); setIsRecording(false); clearInterval(timerRef.current); };
      recorder.start(); recorderRef.current = recorder;
      setRecordingSec(0); setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingSec((s) => s + 1), 1000);
    } catch { setError("Microphone access denied."); }
  }

  function stopRecording() { recorderRef.current?.stop(); clearInterval(timerRef.current); }

  function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeErr = validateFileSize(file); if (sizeErr) { setError(sizeErr); return; }
    setAttachment(file);
  }

  const isGenericReference = !orderId && Boolean(referenceType);

  async function submit(e) {
    e.preventDefault(); setError("");
    if (!orderId && !isGenericReference) { setError("Order ID missing."); return; }
    if (!text.trim() && !audioBlob && !attachment) { setError("Add text, voice, or a file."); return; }
    if (!isGenericReference && sectors.length === 0) { setError("Select at least one sector."); return; }

    const voiceFile = audioBlob
      ? (audioBlob instanceof File ? audioBlob : new File([audioBlob], "voice.webm", { type: "audio/webm" }))
      : null;
    const imageFile = attachment?.type.startsWith("image/") ? attachment : null;
    const attachmentFile = attachment && !attachment.type.startsWith("image/") ? attachment : null;

    setIsSubmitting(true);
    try {
      if (isGenericReference) {
        await raisePharmacyDispute({
          dispute_type: `${referenceType}_DISPUTE`,
          reference_type: referenceType,
          reference_id: referenceId || undefined,
          text_content: text.trim() || undefined,
          voice_file: voiceFile,
          voice_duration_secs: recordingSec > 0 ? recordingSec : undefined,
          image_file: imageFile,
          attachment_file: attachmentFile,
        });
      } else {
        const fd = new FormData();
        fd.append("source_order_id", orderId);
        fd.append("tagged_sectors", sectors.join(","));
        if (text.trim()) fd.append("text_content", text.trim());
        if (voiceFile) {
          fd.append("voice_file", voiceFile);
          if (recordingSec > 0) fd.append("voice_duration_secs", String(recordingSec));
        }
        if (attachment) fd.append(imageFile ? "image_file" : "attachment_file", attachment);
        await raisePharmacyOrderDispute(fd);
      }
      navigate("/disputes");
    }
    catch (err) { setError(err.message); }
    finally { setIsSubmitting(false); }
  }

  return (
    <div className="ph-page">
      <header className="ph-inner-header">
        <button type="button" className="ph-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h1>Raise Dispute</h1>
      </header>
      <form className="dispute-raise-form" onSubmit={submit}>
        {error && <div className="dispute-error">{error}</div>}
        <div className="dispute-field">
          <label className="dispute-label">{isGenericReference ? "Reference" : "Order"}</label>
          {isGenericReference ? (
            <p className="dispute-order-id">{referenceType.replace(/_/g, " ")}{referenceId ? ` · ${referenceId}` : ""}</p>
          ) : !orderId ? (
            <p className="dispute-order-id">No order linked to this dispute.</p>
          ) : isLoadingOrder ? (
            <p className="field-help">Loading order…</p>
          ) : orderError ? (
            <p className="dispute-order-id">{orderId} <span style={{ color: "#8a1f11" }}>(could not load details: {orderError})</span></p>
          ) : order ? (
            <div className="dispute-order-summary">
              <div className="dispute-order-summary-row">
                <span className={`status-pill status-${order.status?.toLowerCase()}`}>{order.status?.replace(/_/g, " ")}</span>
                <span className="dispute-order-summary-date">
                  {order.created_at && new Date(order.created_at).toLocaleString("en-IN")}
                </span>
              </div>
              {order.substitution_allowed === false ? (
                <span className="substitution-row-badge substitution-row-badge-no">No Substitution Allowed</span>
              ) : order.substitution_allowed === true ? (
                <span className="substitution-row-badge substitution-row-badge-yes">Substitution Approved</span>
              ) : null}
              {order.partial_fulfillment_allowed === true ? (
                <span className="substitution-row-badge substitution-row-badge-yes">Partial Fulfillment Allowed</span>
              ) : null}
              <p className="dispute-order-summary-line"><strong>Patient:</strong> {order.patient_name || "—"}</p>
              {order.doctor_name && <p className="dispute-order-summary-line"><strong>Doctor:</strong> {order.doctor_name}</p>}
              {Array.isArray(order.items) && order.items.length > 0 && (
                <p className="dispute-order-summary-line">
                  <strong>Items:</strong> {order.items.map((it) => `${it.name}${it.quantity ? ` ×${it.quantity}` : ""}`).join(", ")}
                </p>
              )}
              {(order.final_amount || order.estimated_amount) && (
                <p className="dispute-order-summary-line">
                  <strong>Amount:</strong> ₹{Number(order.final_amount ?? order.estimated_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  {order.final_amount ? "" : " (estimated)"}
                </p>
              )}
              <p className="dispute-order-summary-line dispute-order-summary-id">Order ID: {orderId}</p>
            </div>
          ) : (
            <p className="dispute-order-id">{orderId}</p>
          )}
        </div>
        {!isGenericReference && (
          <div className="dispute-field">
            <label className="dispute-label">Which area is this about?</label>
            <div className="dispute-sector-chips">
              {SECTOR_OPTIONS.map(({ value, label }) => (
                <button key={value} type="button" className={`dispute-sector-chip${sectors.includes(value) ? " active" : ""}`} onClick={() => toggleSector(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="dispute-field">
          <label className="dispute-label">Describe your issue</label>
          <textarea className="dispute-textarea" rows={5} placeholder="What went wrong?" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="dispute-field">
          <label className="dispute-label">Voice note (optional)</label>
          {audioBlob ? (
            <div className="dispute-audio-preview"><audio controls src={URL.createObjectURL(audioBlob)} /><button type="button" className="dispute-remove-btn" onClick={() => setAudioBlob(null)}><X size={14} /> Remove</button></div>
          ) : isRecording ? (
            <button type="button" className="dispute-record-btn recording" onClick={stopRecording}><MicOff size={18} /> Stop ({recordingSec}s)</button>
          ) : (
            <button type="button" className="dispute-record-btn" onClick={startRecording}><Mic size={18} /> Record Voice Note</button>
          )}
        </div>
        <div className="dispute-field">
          <label className="dispute-label">Attach file (image / PDF / audio · max 10 MB)</label>
          {attachment ? (
            <div className="dispute-attachment-preview"><Paperclip size={14} /> {attachment.name}<button type="button" className="dispute-remove-btn" onClick={() => setAttachment(null)}><X size={14} /></button></div>
          ) : (
            <label className="dispute-file-label"><Paperclip size={16} /> Choose file<input type="file" accept="image/*,application/pdf,audio/*" style={{ display: "none" }} onChange={pickFile} /></label>
          )}
        </div>
        <button type="submit" className="dispute-submit-btn" disabled={isSubmitting}><Send size={16} /> {isSubmitting ? "Submitting…" : "Submit Dispute"}</button>
      </form>
    </div>
  );
}
