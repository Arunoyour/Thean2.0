import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  FileAudio,
  FileImage,
  Maximize2,
  PackageCheck,
  QrCode,
  RefreshCw,
  RotateCw,
  Send,
  Volume2,
  VolumeX,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import {
  acceptAssignedOrder,
  fetchPharmacyMedia,
  getPharmacyToken,
  listManagedOrders,
  markOrderReadyForDelivery,
  rejectAssignedOrder,
  submitPharmacyEstimate,
} from "../lib/api.js";

const PAGE_SIZE = 20;
const ANNOUNCE_AT_SECONDS = [360, 180, 60]; // 6min, 3min, 1min
const AUDIO_PREF_KEY = "thean_pharmacy_audio_on";

const statusOptions = [
  { label: "All statuses", value: "all" },
  { label: "Assigned", value: "ASSIGNED_TO_PHARMACY" },
  { label: "Accepted", value: "PHARMACY_ACCEPTED" },
  { label: "Pending Price Review", value: "PENDING_PRICE_REVIEW" },
  { label: "Price Approved", value: "PRICE_APPROVED" },
  { label: "Ready for Delivery", value: "READY_FOR_DELIVERY" },
  { label: "Out for Delivery", value: "OUT_FOR_DELIVERY" },
  { label: "Ready for Pickup", value: "READY_FOR_PICKUP" },
  { label: "Completed", value: "COMPLETED" },
];

function formatStatus(status) {
  const labels = {
    ASSIGNED_TO_PHARMACY: "Assigned",
    PHARMACY_ACCEPTED: "Accepted",
    PENDING_PRICE_REVIEW: "Pending Price Review",
    PRICE_APPROVED: "Price Approved",
    READY_FOR_DELIVERY: "Ready for Delivery",
    ASSIGNED_TO_DELIVERY: "Driver Assigned",
    OUT_FOR_DELIVERY: "Out for Delivery",
    READY_FOR_PICKUP: "Ready for Pickup",
    COMPLETED: "Completed",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
  };
  return labels[status] || status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatDate(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

function secondsLeft(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.95;
  utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

// ── Estimate Modal ─────────────────────────────────────────────────────────
function EstimateModal({ order, onClose, onSubmitted }) {
  const [medicineCost, setMedicineCost] = useState("");
  const [notes, setNotes]               = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]               = useState("");

  async function handleSubmit() {
    const val = parseFloat(medicineCost);
    if (!val || val <= 0) { setError("Enter a valid medicine cost greater than ₹0."); return; }
    setIsSubmitting(true);
    setError("");
    try {
      const updated = await submitPharmacyEstimate(order.order_id, {
        medicine_cost: val,
        notes: notes.trim() || null,
      });
      onSubmitted(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box estimate-modal-box">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Submit Price Estimate</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close estimate modal">
            <X size={20} />
          </button>
        </div>
        <p className="estimate-modal-hint">
          Enter the total cost of medicines/products. Delivery charge, platform fee, and GST
          will be <strong>calculated automatically</strong> by the system and shown to the customer.
          They have <strong>7 minutes</strong> to approve before the order is auto-rejected.
        </p>

        <div className="estimate-line-fields">
          <label>
            <span>Medicine / Product Cost (₹) <em>*</em></span>
            <input
              type="number" min="0.01" step="0.01" placeholder="e.g. 320.00"
              value={medicineCost} onChange={(e) => setMedicineCost(e.target.value)} autoFocus
            />
          </label>
          <label>
            <span>Remarks (optional — shown on customer invoice)</span>
            <input
              type="text" maxLength={200} placeholder="e.g. One item substituted with generic"
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="estimate-auto-notice">
          <span>🚚</span>
          <span>Delivery charge = live KM rate × road distance (OSRM)</span>
          <span>🏷️</span>
          <span>Platform fee + GST = set by admin per sector</span>
        </div>

        {error ? <div className="error">{error}</div> : null}
        <div className="modal-actions">
          <button
            className="button" type="button"
            disabled={isSubmitting || !parseFloat(medicineCost)}
            onClick={handleSubmit}
          >
            <Send size={16} />
            {isSubmitting ? "Calculating & Sending…" : "Send to Customer"}
          </button>
          <button className="outline-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Attachment reader ──────────────────────────────────────────────────────
function AttachmentReader({ fileInfo, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const isPdf = fileInfo?.content_type === "application/pdf";

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!fileInfo) return null;

  return (
    <div className="pharmacy-attachment-reader" role="dialog" aria-modal="true" aria-label="Prescription reader">
      <div className="pharmacy-attachment-toolbar">
        <div>
          <p className="eyebrow">Prescription reader</p>
          <strong>{fileInfo.original_name || fileInfo.filename}</strong>
        </div>
        <div className="pharmacy-attachment-actions">
          <button type="button" onClick={() => setZoom((v) => Math.max(0.75, v - 0.25))}><ZoomOut size={18} /> Zoom out</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((v) => Math.min(3, v + 0.25))}><ZoomIn size={18} /> Zoom in</button>
          {!isPdf ? (
            <button type="button" onClick={() => setRotation((v) => (v + 90) % 360)}><RotateCw size={18} /> Rotate</button>
          ) : null}
          <button type="button" onClick={() => { setZoom(1); setRotation(0); }}><Maximize2 size={18} /> Reset</button>
          <button type="button" onClick={onClose}><XCircle size={18} /> Close</button>
        </div>
      </div>
      <div className="pharmacy-attachment-canvas">
        <div
          className={isPdf ? "pharmacy-attachment-document pharmacy-attachment-document-pdf" : "pharmacy-attachment-document"}
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
        >
          {isPdf
            ? <iframe title={fileInfo.original_name || "PDF"} src={fileInfo.objectUrl} />
            : <img alt={fileInfo.original_name || "Prescription"} src={fileInfo.objectUrl} />}
        </div>
      </div>
    </div>
  );
}

function OrderAttachmentPanel({ isOpen, order, mediaUrls, loadMedia }) {
  const [mediaError, setMediaError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let mounted = true;
    async function load() {
      setMediaError("");
      try { await loadMedia(order); } catch (e) { if (mounted) setMediaError(e.message); }
    }
    load();
    return () => { mounted = false; };
  }, [isOpen, loadMedia, order]);

  const hasAttachments = Boolean((order.prescription_files || []).length || order.voice_note_file);

  return (
    <div className="managed-order-attachment-panel">
      <h3>Attachments</h3>
      {mediaError ? <div className="error">{mediaError}</div> : null}
      {!hasAttachments ? <p>No image, PDF, or voice attachment for this order.</p> : null}
      <div className="managed-media-grid">
        <article>
          <h4><FileImage size={16} /> Prescription image / PDF</h4>
          {mediaUrls.prescriptions.length ? (
            <div className="managed-prescription-grid">
              {mediaUrls.prescriptions.map((fileInfo) => (
                fileInfo.content_type === "application/pdf"
                  ? <button className="managed-prescription-document" type="button" key={fileInfo.filename} onClick={() => setSelectedFile(fileInfo)}>Open {fileInfo.original_name || "PDF prescription"}</button>
                  : <button className="managed-prescription-image-link" type="button" key={fileInfo.filename} onClick={() => setSelectedFile(fileInfo)}><img alt={fileInfo.original_name || "Prescription"} src={fileInfo.objectUrl} /></button>
              ))}
            </div>
          ) : (
            <p>{order.prescription_files?.length ? "Loading prescription files..." : "No prescription file attached."}</p>
          )}
        </article>
        <article>
          <h4><FileAudio size={16} /> Voice note</h4>
          {mediaUrls.voice
            ? <audio className="voice-review-player" controls src={mediaUrls.voice.objectUrl}><track kind="captions" /></audio>
            : <p>{order.voice_note_file ? "Loading voice note..." : "No voice note attached."}</p>}
        </article>
      </div>
      {selectedFile ? <AttachmentReader fileInfo={selectedFile} onClose={() => setSelectedFile(null)} /> : null}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export function OrderManagementPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [mediaByOrderId, setMediaByOrderId] = useState({});
  const mediaByOrderIdRef = useRef({});
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", status: "all" });
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [estimateModalOrder, setEstimateModalOrder] = useState(null);
  const [pendingRejectOrderId, setPendingRejectOrderId] = useState(null);
  const announcedRef = useRef({}); // {orderId: Set of announced seconds}

  // Audio announcement preference — persistent, default ON
  const [audioEnabled, setAudioEnabled] = useState(() => {
    const stored = window.localStorage.getItem(AUDIO_PREF_KEY);
    return stored === null ? true : stored === "true";
  });

  function toggleAudio() {
    const next = !audioEnabled;
    setAudioEnabled(next);
    window.localStorage.setItem(AUDIO_PREF_KEY, String(next));
    if (!next) window.speechSynthesis?.cancel();
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.status !== "all" && order.status !== filters.status) return false;
      const createdAtMs = new Date(order.created_at).getTime();
      const dateFromMs = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
      const dateToMs = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : null;
      if (dateFromMs !== null && createdAtMs < dateFromMs) return false;
      if (dateToMs !== null && createdAtMs > dateToMs) return false;
      return true;
    });
  }, [filters, orders]);

  const counts = useMemo(() => ({
    assigned: filteredOrders.filter((o) => o.status === "ASSIGNED_TO_PHARMACY").length,
    accepted: filteredOrders.filter((o) => o.status === "PHARMACY_ACCEPTED").length,
    completed: filteredOrders.filter((o) => o.status === "COMPLETED").length,
  }), [filteredOrders]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedOrders = filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageStart = filteredOrders.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredOrders.length);

  async function loadOrders({ showLoading = true } = {}) {
    if (showLoading) setIsLoading(true);
    try {
      const response = await listManagedOrders();
      setOrders(response);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }

  useEffect(() => { loadOrders(); }, []);

  // Tick every second for timers
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Audio announcements for ASSIGNED orders — only when audioEnabled
  useEffect(() => {
    orders.forEach((order) => {
      if (order.status !== "ASSIGNED_TO_PHARMACY" || !order.pharmacy_action_deadline_at) return;
      const secs = secondsLeft(order.pharmacy_action_deadline_at);
      if (!announcedRef.current[order.order_id]) {
        announcedRef.current[order.order_id] = new Set();
      }
      const announced = announcedRef.current[order.order_id];
      for (const threshold of ANNOUNCE_AT_SECONDS) {
        if (secs <= threshold && secs > threshold - 5 && !announced.has(threshold)) {
          announced.add(threshold);
          if (audioEnabled) {
            const mins = Math.floor(secs / 60);
            speak(`An order is awaiting your approval. ${mins} ${mins === 1 ? "minute" : "minutes"} remaining.`);
          }
        }
      }
    });
  }, [now, orders, audioEnabled]);

  // WebSocket
  useEffect(() => {
    const token = getPharmacyToken();
    if (!token) return undefined;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host.replace("5174", "8000")}/api/v1/ws/pharmacy?token=${encodeURIComponent(token)}`);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "order_assigned") {
        setMessage("New order received.");
        loadOrders({ showLoading: false });
      } else if (payload.type === "price_approved") {
        setMessage(`Customer approved the price for order. You can now generate the final bill.`);
        loadOrders({ showLoading: false });
      } else if (payload.type === "price_review_timeout" || payload.type === "price_rejected") {
        setMessage(payload.message || "Customer rejected/timed out the price review.");
        loadOrders({ showLoading: false });
      }
    };
    return () => {
      window.speechSynthesis?.cancel();
      socket.close();
    };
  }, []);

  async function submitAction(orderId, action) {
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      if (action === "accept") {
        const updated = await acceptAssignedOrder(orderId);
        // Clear announcements for this order
        delete announcedRef.current[orderId];
        window.speechSynthesis?.cancel();
        setOrders((current) => current.map((o) => (o.order_id === orderId ? updated : o)));
        // Route based on billing mode
        const billingMode = updated.notes?.billing_mode || "auto";
        if (billingMode === "manual") {
          setEstimateModalOrder(updated);
        } else {
          navigate(`/orders/${orderId}/bill`);
        }
      } else {
        await rejectAssignedOrder(orderId);
        setPendingRejectOrderId(null);
        setMessage("Order rejected.");
        await loadOrders({ showLoading: false });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMarkReadyForDelivery(orderId) {
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      await markOrderReadyForDelivery(orderId);
      setMessage("Order marked as ready for delivery.");
      await loadOrders({ showLoading: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }


  const loadOrderMedia = useCallback(async (order) => {
    if (mediaByOrderIdRef.current[order.order_id]) return;
    const prescriptions = await Promise.all(
      (order.prescription_files || []).map(async (fileInfo) => {
        const blob = await fetchPharmacyMedia(fileInfo.pharmacy_url);
        return { ...fileInfo, objectUrl: URL.createObjectURL(blob) };
      }),
    );
    let voice = null;
    if (order.voice_note_file?.pharmacy_url) {
      const voiceBlob = await fetchPharmacyMedia(order.voice_note_file.pharmacy_url);
      voice = { ...order.voice_note_file, objectUrl: URL.createObjectURL(voiceBlob) };
    }
    setMediaByOrderId((current) => {
      if (current[order.order_id]) {
        prescriptions.forEach((f) => URL.revokeObjectURL(f.objectUrl));
        if (voice) URL.revokeObjectURL(voice.objectUrl);
        return current;
      }
      return { ...current, [order.order_id]: { prescriptions, voice } };
    });
  }, []);

  useEffect(() => { mediaByOrderIdRef.current = mediaByOrderId; }, [mediaByOrderId]);
  useEffect(() => { setPage(1); setExpandedOrderId(""); }, [filters]);
  useEffect(() => () => {
    Object.values(mediaByOrderIdRef.current).forEach((media) => {
      media.prescriptions?.forEach((f) => URL.revokeObjectURL(f.objectUrl));
      if (media.voice?.objectUrl) URL.revokeObjectURL(media.voice.objectUrl);
    });
  }, []);

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Order Management</h1>
          <p>Review assigned orders and track accepted or completed pharmacy work sorted by latest order.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            className="outline-button"
            type="button"
            title={audioEnabled ? "Audio announcements ON — click to mute" : "Audio announcements OFF — click to enable"}
            onClick={toggleAudio}
            aria-pressed={audioEnabled}
          >
            {audioEnabled ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
            {audioEnabled ? "Audio on" : "Audio off"}
          </button>
          <button className="outline-button" type="button" onClick={() => loadOrders()}>
            <RefreshCw size={18} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <section className="order-management-metrics">
        <button type="button" onClick={() => setFilters((f) => ({ ...f, status: "ASSIGNED_TO_PHARMACY" }))}>
          <Clock3 size={20} /><span>Assigned</span><strong>{counts.assigned}</strong>
        </button>
        <button type="button" onClick={() => setFilters((f) => ({ ...f, status: "PHARMACY_ACCEPTED" }))}>
          <PackageCheck size={20} /><span>Accepted</span><strong>{counts.accepted}</strong>
        </button>
        <button type="button" onClick={() => setFilters((f) => ({ ...f, status: "COMPLETED" }))}>
          <CheckCircle2 size={20} /><span>Completed</span><strong>{counts.completed}</strong>
        </button>
      </section>

      {message ? <div className="success">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="order-management-filter-panel">
        <label>From date<input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} /></label>
        <label>To date<input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} /></label>
        <label>
          Order status
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button className="outline-button" type="button" onClick={() => setFilters({ dateFrom: "", dateTo: "", status: "all" })}>Clear filters</button>
      </section>

      {isLoading ? (
        <section className="panel loading-panel"><RefreshCw size={20} aria-hidden="true" />Loading orders</section>
      ) : null}

      {!isLoading ? (
        <section className="order-management-list">
          {pagedOrders.length ? pagedOrders.map((order) => {
            const isAssigned = order.status === "ASSIGNED_TO_PHARMACY";
            const isExpanded = expandedOrderId === order.order_id;
            const slaSeconds = secondsLeft(order.pharmacy_action_deadline_at);
            const priceReviewSeconds = secondsLeft(order.customer_review_deadline_at);
            const substitutionClass =
              order.substitution_allowed === false ? "managed-order-card managed-order-card-no-sub"
              : order.substitution_allowed === true ? "managed-order-card managed-order-card-sub-ok"
              : "managed-order-card";

            return (
              <article className={substitutionClass} key={order.order_id}>
                <div className="managed-order-header">
                  <div>
                    <span className={`order-management-status status-${order.status.toLowerCase().replaceAll("_", "-")}`}>
                      {formatStatus(order.status)}
                    </span>
                    {order.substitution_allowed === false ? (
                      <span className="substitution-row-badge substitution-row-badge-no">No Substitution Allowed</span>
                    ) : order.substitution_allowed === true ? (
                      <span className="substitution-row-badge substitution-row-badge-yes">Substitution Approved</span>
                    ) : null}
                    <h2>{order.patient_name || "Customer"} medicine order</h2>
                    <p>
                      {formatDate(order.created_at)}
                      {isAssigned && order.pharmacy_action_deadline_at ? ` • Accept SLA: ${formatCountdown(slaSeconds)} left` : ""}
                      {order.status === "PENDING_PRICE_REVIEW" && order.customer_review_deadline_at
                        ? ` • Customer review: ${formatCountdown(priceReviewSeconds)} left`
                        : ""}
                    </p>

                    {/* READY_FOR_PICKUP: pickup code */}
                    {order.status === "READY_FOR_PICKUP" && order.pickup_code ? (
                      <div className="pickup-code-display">
                        <QrCode size={18} />
                        <span>Pickup code:</span>
                        <strong className="pickup-code">{order.pickup_code}</strong>
                      </div>
                    ) : null}

                    {/* PENDING_PRICE_REVIEW: waiting badge */}
                    {order.status === "PENDING_PRICE_REVIEW" ? (
                      <div className="waiting-badge">
                        <Clock3 size={14} />
                        Waiting for customer to approve price estimate (₹{order.estimated_amount})
                        {order.customer_review_deadline_at
                          ? ` — ${formatCountdown(priceReviewSeconds)} remaining`
                          : ""}
                      </div>
                    ) : null}
                  </div>

                  <div className="managed-order-actions">
                    <button className="outline-button button-small" type="button" onClick={() => setExpandedOrderId(isExpanded ? "" : order.order_id)}>
                      {isExpanded ? "Hide details" : "View details"}
                    </button>
                    {isAssigned ? (
                      <>
                        <button
                          className={`button button-small ${slaSeconds <= 60 ? "button-urgent" : ""}`}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => submitAction(order.order_id, "accept")}
                        >
                          <CheckCircle2 size={16} />
                          Accept {slaSeconds > 0 ? `(${formatCountdown(slaSeconds)})` : ""}
                        </button>
                        {/* Reject — inline confirm before acting */}
                        {pendingRejectOrderId === order.order_id ? (
                          <>
                            <span style={{ fontSize: "0.8rem", color: "#b45309", alignSelf: "center" }}>
                              Reject this order?
                            </span>
                            <button
                              className="danger-button button-small"
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => submitAction(order.order_id, "reject")}
                            >
                              <XCircle size={16} /> Confirm reject
                            </button>
                            <button
                              className="outline-button button-small"
                              type="button"
                              onClick={() => setPendingRejectOrderId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="danger-button button-small"
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => setPendingRejectOrderId(order.order_id)}
                          >
                            <XCircle size={16} /> Reject
                          </button>
                        )}
                      </>
                    ) : null}
                    {order.status === "PRICE_APPROVED" ? (
                      <button className="button button-small" type="button" onClick={() => navigate(`/orders/${order.order_id}/bill`)}>
                        <Send size={16} /> Generate Bill
                      </button>
                    ) : null}
                    {order.status === "PHARMACY_ACCEPTED" ? (
                      <button className="button button-small" type="button" onClick={() => navigate(`/orders/${order.order_id}/bill`)}>
                        <Send size={16} /> Generate Bill
                      </button>
                    ) : null}
                    {(order.status === "PRICE_APPROVED" || order.status === "PHARMACY_ACCEPTED") ? (
                      <button
                        className="success-button button-small"
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleMarkReadyForDelivery(order.order_id)}
                      >
                        <PackageCheck size={16} /> Ready for Delivery
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Delivery boy Pickup PIN — shown once a driver is assigned */}
                {order.delivery_pickup_pin &&
                 (order.status === "READY_FOR_DELIVERY" || order.status === "OUT_FOR_DELIVERY") ? (
                  <div className="pharmacy-pickup-pin-banner">
                    <span className="pharmacy-pickup-pin-label">🛵 Delivery Pickup PIN</span>
                    <span className="pharmacy-pickup-pin-chip">{order.delivery_pickup_pin}</span>
                    <span className="pharmacy-pickup-pin-hint">Show this to the delivery partner when they arrive to collect the order.</span>
                  </div>
                ) : null}

                <div className={`managed-order-detail ${isExpanded ? "managed-order-detail-open" : ""}`} hidden={!isExpanded}>
                  <dl>
                    <div><dt>Doctor</dt><dd>{order.doctor_name || "Self"}</dd></div>
                    <div><dt>Patient</dt><dd>{order.patient_name || "Customer"}</dd></div>
                    <div><dt>Billing</dt><dd>{order.notes?.billing_mode || "Auto"}</dd></div>
                    <div><dt>Assigned</dt><dd>{formatDate(order.assigned_at)}</dd></div>
                    {order.estimated_amount ? <div><dt>Estimated amount</dt><dd>₹{order.estimated_amount}</dd></div> : null}
                    {order.final_amount ? <div><dt>Final amount</dt><dd>₹{order.final_amount}</dd></div> : null}
                  </dl>
                  <div className="managed-order-items">
                    <h3>Medicines</h3>
                    {order.items?.length ? order.items.map((item, i) => (
                      <div key={`${order.order_id}-${item.name}-${i}`}>
                        <strong>{item.name}</strong>
                        <span>{item.quantity} {item.metric}</span>
                      </div>
                    )) : <p>No typed medicines. Check prescription attachments.</p>}
                  </div>
                  {order.bill_items?.length ? (
                    <div className="managed-order-items">
                      <h3>Final Bill Items</h3>
                      {order.bill_items.map((item, i) => (
                        <div key={i}>
                          <strong>{item.substitute_name ? `${item.substitute_name} (sub for ${item.name})` : item.name}</strong>
                          <span>{item.qty} {item.type} × ₹{item.amount}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <OrderAttachmentPanel
                    isOpen={isExpanded}
                    order={order}
                    mediaUrls={mediaByOrderId[order.order_id] || { prescriptions: [], voice: null }}
                    loadMedia={loadOrderMedia}
                  />
                  <div className="order-dispute-row">
                    <a href={`/disputes/raise?order_id=${order.order_id}&sectors=pharmacy,delivery`} className="order-dispute-link">⚠️ Raise a dispute</a>
                    <a href="/disputes" className="order-dispute-view-link">My disputes</a>
                  </div>
                </div>
              </article>
            );
          }) : (
            <article className="panel">No orders match the selected filters.</article>
          )}
          <div className="order-pagination-bar">
            <span>{pageStart}-{pageEnd} of {filteredOrders.length}</span>
            <div>
              <button className="outline-button button-small" type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <strong>Page {safePage} of {pageCount}</strong>
              <button className="outline-button button-small" type="button" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</button>
            </div>
          </div>
        </section>
      ) : null}

      {estimateModalOrder ? (
        <EstimateModal
          order={estimateModalOrder}
          onClose={() => setEstimateModalOrder(null)}
          onSubmitted={(updated) => {
            setEstimateModalOrder(null);
            setOrders((current) => current.map((o) => (o.order_id === updated.order_id ? updated : o)));
            setMessage("Estimated price submitted. Waiting for customer approval.");
          }}
        />
      ) : null}
    </PharmacyPageShell>
  );
}
