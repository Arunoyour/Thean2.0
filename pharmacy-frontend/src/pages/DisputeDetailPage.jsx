import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Paperclip, Send, X } from "lucide-react";
import { closePharmacyOrderDispute, getPharmacyOrderDispute, replyPharmacyOrderDispute } from "../lib/api.js";
import { MAX_FILE_SIZE_BYTES, validateFileSize } from "../lib/validation.js";
import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const STATUS_COLOR = { OPEN:"#3b82f6", IN_REVIEW:"#f59e0b", REOPENED:"#8b5cf6", RESOLVED:"#10b981", CLOSED:"#6b7280" };

function MessageBubble({ msg }) {
  const isAdmin = msg.sender_type === "ADMIN";
  return (
    <div className={`dispute-bubble-wrap ${isAdmin ? "admin" : "user"}`}>
      <div className="dispute-bubble">
        {msg.text_content && <p>{msg.text_content}</p>}
        {msg.voice_file_path && <audio controls src={`${API_BASE}/../${msg.voice_file_path}`} className="dispute-audio" />}
        {msg.image_file_path && <img src={`${API_BASE}/../${msg.image_file_path}`} alt="attachment" className="dispute-img" />}
        {msg.attachment_path && <a href={`${API_BASE}/../${msg.attachment_path}`} target="_blank" rel="noreferrer" className="dispute-file-link">📎 {msg.attachment_name || "File"}</a>}
        <time className="dispute-bubble-time">{new Date(msg.created_at).toLocaleString([], { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}</time>
      </div>
    </div>
  );
}

export function DisputeDetailPage() {
  const { disputeId } = useParams();
  const navigate = useNavigate();
  const [dispute, setDispute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const recorderRef = useRef(null); const chunksRef = useRef([]); const timerRef = useRef(null); const bottomRef = useRef(null);

  useEffect(() => { load(); }, [disputeId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [dispute?.messages]);
  useEffect(() => () => { clearInterval(timerRef.current); if (recorderRef.current?.state==="recording") recorderRef.current.stop(); }, []);

  async function load() {
    setIsLoading(true);
    try { setDispute(await getPharmacyOrderDispute(disputeId)); }
    catch (e) { setError(e.message); }
    finally { setIsLoading(false); }
  }

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

  async function sendReply(e) {
    e.preventDefault();
    if (!replyText.trim() && !audioBlob && !attachment) { setError("Add text, voice, or a file."); return; }
    setError("");
    const fd = new FormData();
    if (replyText.trim()) fd.append("text_content", replyText.trim());
    if (audioBlob) { fd.append("voice_file", new File([audioBlob], "reply.webm", { type:"audio/webm" })); fd.append("voice_duration_secs", String(recordingSec)); }
    if (attachment) fd.append(attachment.type.startsWith("image/") ? "image_file" : "attachment_file", attachment);
    setIsSending(true);
    try { await replyPharmacyOrderDispute(disputeId, fd); setReplyText(""); setAudioBlob(null); setAttachment(null); await load(); }
    catch (err) { setError(err.message); }
    finally { setIsSending(false); }
  }

  async function handleClose() {
    if (!window.confirm("Close this dispute?")) return;
    setIsClosing(true);
    try { await closePharmacyOrderDispute(disputeId); await load(); }
    catch (err) { setError(err.message); }
    finally { setIsClosing(false); }
  }

  if (isLoading) return <PharmacyPageShell><div className="ph-page"><p className="ph-loading">Loading…</p></div></PharmacyPageShell>;
  if (!dispute) return <PharmacyPageShell><div className="ph-page"><p>Not found.</p></div></PharmacyPageShell>;

  const isClosed = dispute.status === "CLOSED";

  return (
    <PharmacyPageShell>
    <div className="ph-page dispute-detail-page">
      <header className="ph-inner-header">
        <button type="button" className="ph-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <div className="dispute-detail-title">
          <h1>Dispute</h1>
          <span className="dispute-status-pill" style={{ background: STATUS_COLOR[dispute.status] || "#6b7280" }}>{dispute.status.replace("_"," ")}</span>
        </div>
      </header>
      {error && <div className="dispute-error">{error}</div>}
      <div className="dispute-meta">
        <span>{new Date(dispute.created_at).toLocaleDateString()}</span>
        {(dispute.tagged_sectors||[]).map((s) => <span key={s} className="dispute-sector-tag">{s}</span>)}
        <span>{dispute.age_days}d old</span>
      </div>
      <div className="dispute-thread">
        {(dispute.messages||[]).map((m) => <MessageBubble key={m.message_id} msg={m} />)}
        <div ref={bottomRef} />
      </div>
      {!isClosed && (
        <>
          <form className="dispute-reply-form" onSubmit={sendReply}>
            <textarea className="dispute-reply-input" rows={3} placeholder="Type your reply…" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
            <div className="dispute-reply-actions">
              {audioBlob ? (
                <div className="dispute-audio-mini"><audio controls src={URL.createObjectURL(audioBlob)} /><button type="button" className="dispute-remove-btn" onClick={() => setAudioBlob(null)}><X size={12}/></button></div>
              ) : isRecording ? (
                <button type="button" className="dispute-mic-btn recording" onClick={stopRecording}><MicOff size={16}/> {recordingSec}s</button>
              ) : (
                <button type="button" className="dispute-mic-btn" onClick={startRecording}><Mic size={16}/></button>
              )}
              {attachment ? (
                <span className="dispute-attach-name"><Paperclip size={12}/> {attachment.name} <button type="button" onClick={() => setAttachment(null)}><X size={12}/></button></span>
              ) : (
                <label className="dispute-attach-btn"><Paperclip size={16}/><input type="file" accept="image/*,application/pdf,audio/*" style={{display:"none"}} onChange={pickFile}/></label>
              )}
              <button type="submit" className="dispute-send-btn" disabled={isSending}><Send size={16}/></button>
            </div>
          </form>
          <button type="button" className="dispute-close-btn" disabled={isClosing} onClick={handleClose}>{isClosing ? "Closing…" : "Close Dispute"}</button>
        </>
      )}
      {isClosed && (
        <div className="dispute-closed-banner">
          Dispute closed · {dispute.closed_by_raiser ? "Closed by you" : "Closed by admin"}
          <br/>
          <button type="button" className="dispute-raise-again-btn"
            onClick={() => navigate(`/disputes/raise?order_id=${dispute.source_order_id}&sectors=${(dispute.tagged_sectors||[]).join(",")}`)}>
            Raise new dispute on this order
          </button>
        </div>
      )}
    </div>
    </PharmacyPageShell>
  );
}
