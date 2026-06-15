import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Paperclip, Send, X } from "lucide-react";
import { raiseDeliveryOrderDispute } from "../lib/api.js";
import { MAX_FILE_SIZE_BYTES, validateFileSize } from "../lib/validation.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function DeliveryRaiseDisputePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("order_id") || "";
  const defaultSectors = params.get("sectors") || "delivery";

  const [sectors, setSectors] = useState(defaultSectors.split(",").map((s) => s.trim()).filter(Boolean));
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const recorderRef = useRef(null); const chunksRef = useRef([]); const timerRef = useRef(null);

  useEffect(() => () => { clearInterval(timerRef.current); if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }, []);

  function toggleSector(s) { setSectors((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]); }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setAudioBlob(new Blob(chunksRef.current, { type:"audio/webm" })); setIsRecording(false); clearInterval(timerRef.current); };
      recorder.start(); recorderRef.current = recorder; setRecordingSec(0); setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingSec((s) => s+1), 1000);
    } catch { setError("Microphone access denied."); }
  }

  function stopRecording() { recorderRef.current?.stop(); clearInterval(timerRef.current); }

  function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeErr = validateFileSize(file); if (sizeErr) { setError(sizeErr); return; }
    setAttachment(file);
  }

  async function submit(e) {
    e.preventDefault(); setError("");
    if (!orderId) { setError("Order ID missing."); return; }
    if (!text.trim() && !audioBlob && !attachment) { setError("Add text, voice, or a file."); return; }
    if (sectors.length === 0) { setError("Select at least one sector."); return; }

    const fd = new FormData();
    fd.append("source_order_id", orderId);
    fd.append("tagged_sectors", sectors.join(","));
    if (text.trim()) fd.append("text_content", text.trim());
    if (audioBlob) { fd.append("voice_file", new File([audioBlob], "voice.webm", { type:"audio/webm" })); fd.append("voice_duration_secs", String(recordingSec)); }
    if (attachment) fd.append(attachment.type.startsWith("image/") ? "image_file" : "attachment_file", attachment);

    setIsSubmitting(true);
    try { await raiseDeliveryOrderDispute(fd); navigate("/disputes"); }
    catch (err) { setError(err.message); }
    finally { setIsSubmitting(false); }
  }

  return (
    <div className="dl-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20}/></button>
        <h1>Raise Dispute</h1>
      </header>
      <form className="dispute-raise-form" onSubmit={submit}>
        {error && <div className="dispute-error">{error}</div>}
        <div className="dispute-field"><label className="dispute-label">Order ID</label><p className="dispute-order-id">{orderId||"—"}</p></div>
        <div className="dispute-field">
          <label className="dispute-label">Dispute against</label>
          <div className="dispute-sector-chips">
            {["pharmacy","delivery"].map((s) => (
              <button key={s} type="button" className={`dispute-sector-chip${sectors.includes(s)?" active":""}`} onClick={() => toggleSector(s)}>
                {s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="dispute-field">
          <label className="dispute-label">Describe your issue</label>
          <textarea className="dispute-textarea" rows={5} placeholder="What went wrong?" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="dispute-field">
          <label className="dispute-label">Voice note</label>
          {audioBlob ? (
            <div className="dispute-audio-preview"><audio controls src={URL.createObjectURL(audioBlob)}/><button type="button" className="dispute-remove-btn" onClick={()=>setAudioBlob(null)}><X size={14}/> Remove</button></div>
          ) : isRecording ? (
            <button type="button" className="dispute-record-btn recording" onClick={stopRecording}><MicOff size={18}/> Stop ({recordingSec}s)</button>
          ) : (
            <button type="button" className="dispute-record-btn" onClick={startRecording}><Mic size={18}/> Record Voice Note</button>
          )}
        </div>
        <div className="dispute-field">
          <label className="dispute-label">Attach file (max 10 MB)</label>
          {attachment ? (
            <div className="dispute-attachment-preview"><Paperclip size={14}/> {attachment.name}<button type="button" className="dispute-remove-btn" onClick={()=>setAttachment(null)}><X size={14}/></button></div>
          ) : (
            <label className="dispute-file-label"><Paperclip size={16}/> Choose file<input type="file" accept="image/*,application/pdf,audio/*" style={{display:"none"}} onChange={pickFile}/></label>
          )}
        </div>
        <button type="submit" className="dispute-submit-btn" disabled={isSubmitting}><Send size={16}/> {isSubmitting?"Submitting…":"Submit Dispute"}</button>
      </form>
    </div>
  );
}
