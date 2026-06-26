import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  FileAudio,
  FileImage,
  Maximize2,
  PackagePlus,
  Phone,
  RefreshCw,
  RotateCw,
  Star,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import "leaflet/dist/leaflet.css";
import { FormMessage } from "../components/FormMessage.jsx";
import {
  approvePriceEstimate,
  fetchCustomerMedia,
  getDeliveryTracking,
  listCustomerDisputes,
  listCustomerPharmacyOrders,
  rejectPriceEstimate,
  reorderCustomerPharmacyOrder,
  setPartialFulfillmentPermission,
  setSubstitutionPermission,
  submitDeliveryRating,
  updateCustomerPharmacyOrder,
} from "../lib/api.js";

// Delivery statuses where we should poll the driver's location
const DELIVERY_IN_TRANSIT_STATUSES = new Set([
  "READY_FOR_DELIVERY",
  "ASSIGNED_TO_DELIVERY",
  "DELIVERY_ACCEPTED",
  "ARRIVED_AT_STORE",
  "ORDER_PICKED_UP",
  "ARRIVED_AT_CUSTOMER",
]);

// PIN is only meaningful once the driver has physically picked up the order
const DELIVERY_PIN_VISIBLE_STATUSES = new Set([
  "ORDER_PICKED_UP",
  "ARRIVED_AT_CUSTOMER",
]);

// Substitution can only be changed while the order is with the pharmacy
const SUBSTITUTION_ACTIVE_STATUSES = new Set([
  "ASSIGNED_TO_PHARMACY",
  "PHARMACY_ACCEPTED",
]);

// Haversine distance in metres between two lat/lng points
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const CALL_VISIBLE_METRES = 150; // show call button when driver is this close

// ── Inline delivery map ────────────────────────────────────────────────────
function DeliveryMap({ tracking, dropLat, dropLng }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const driverMarkerRef = useRef(null);

  // Initialise map once
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    if (!tracking?.driver_lat) return;

    import("leaflet").then((mod) => {
      const L = mod.default;

      // Fix default icon paths broken by Vite bundling
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false })
        .setView([tracking.driver_lat, tracking.driver_lng], 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // Driver pin — bike icon
      const bikeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="32" height="32">
        <ellipse cx="18" cy="17" rx="5" ry="6" fill="#6366f1"/>
        <circle cx="18" cy="9" r="4" fill="#6366f1"/>
        <path d="M14.5 8.5 Q18 6.5 21.5 8.5 Q21.5 11 18 11 Q14.5 11 14.5 8.5Z" fill="rgba(0,0,0,0.25)"/>
        <circle cx="9" cy="26" r="5" fill="none" stroke="#6366f1" stroke-width="2.5"/>
        <circle cx="9" cy="26" r="1.5" fill="#6366f1"/>
        <circle cx="27" cy="26" r="5" fill="none" stroke="#6366f1" stroke-width="2.5"/>
        <circle cx="27" cy="26" r="1.5" fill="#6366f1"/>
        <line x1="9" y1="26" x2="18" y2="18" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>
        <line x1="27" y1="26" x2="18" y2="18" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>
        <line x1="9" y1="26" x2="27" y2="26" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="24" y1="19" x2="29" y2="17" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>
        <circle cx="18" cy="18" r="17" fill="none" stroke="#fff" stroke-width="2" opacity="0.8"/>
      </svg>`;
      const driverIcon = L.divIcon({
        className: "",
        html: `<div style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));width:32px;height:32px">${bikeSvg}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const driverM = L.marker([tracking.driver_lat, tracking.driver_lng], { icon: driverIcon })
        .addTo(map)
        .bindTooltip("Driver", { permanent: false });
      driverMarkerRef.current = driverM;

      // Destination pin
      if (dropLat && dropLng) {
        const destIcon = L.divIcon({
          className: "",
          html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        L.marker([dropLat, dropLng], { icon: destIcon })
          .addTo(map)
          .bindTooltip("📍 You", { permanent: false });

        // Fit both pins in view
        map.fitBounds([[tracking.driver_lat, tracking.driver_lng], [dropLat, dropLng]], { padding: [30, 30] });
      }

      leafletMapRef.current = map;
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        driverMarkerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update driver marker position when tracking changes
  useEffect(() => {
    if (!driverMarkerRef.current || !tracking?.driver_lat) return;
    driverMarkerRef.current.setLatLng([tracking.driver_lat, tracking.driver_lng]);
  }, [tracking?.driver_lat, tracking?.driver_lng]);

  const etaText = tracking?.eta_minutes != null
    ? `~${tracking.eta_minutes} min`
    : null;
  const kmText = tracking?.road_km_to_customer != null
    ? `${tracking.road_km_to_customer.toFixed(1)} km`
    : null;

  return (
    <div className="delivery-map-card">
      {(etaText || kmText) && (
        <div className="delivery-map-eta">
          <span className="delivery-map-eta-icon">🛵</span>
          {kmText && <span>{kmText} away</span>}
          {etaText && <span className="delivery-map-eta-time">ETA {etaText}</span>}
        </div>
      )}
      <div ref={mapRef} className="delivery-map-container" />
    </div>
  );
}

const AUTO_APPROVAL_SECONDS = 120;
const MANUAL_REVIEW_SECONDS = 300;

function formatStatus(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getReviewState(order, nowMs) {
  const billingMode = order.notes?.billing_mode === "manual" ? "manual" : "auto";
  const windowSeconds = billingMode === "manual" ? MANUAL_REVIEW_SECONDS : AUTO_APPROVAL_SECONDS;
  const placedAtMs = new Date(order.created_at).getTime();

  // Prefer the server-authoritative deadline; fall back to client estimate so both
  // the action banner and the price-review invoice use the same source of truth.
  const serverDeadlineMs = order.customer_review_deadline_at
    ? new Date(order.customer_review_deadline_at).getTime()
    : null;
  const deadlineMs = serverDeadlineMs ?? (placedAtMs + windowSeconds * 1000);

  const remainingSeconds = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
  return { billingMode, deadlineMs, remainingSeconds };
}

function AttachmentReader({ fileInfo, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const isPdf = fileInfo?.content_type === "application/pdf";

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!fileInfo) return null;

  const documentStyle = {
    transform: `scale(${zoom}) rotate(${rotation}deg)`,
  };

  return (
    <div className="attachment-reader" role="dialog" aria-modal="true" aria-label="Prescription attachment reader">
      <div className="attachment-reader-toolbar">
        <div>
          <p className="eyebrow">Prescription reader</p>
          <strong>{fileInfo.original_name || fileInfo.filename}</strong>
        </div>
        <div className="attachment-reader-actions">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>
            <ZoomOut size={18} />
            Zoom out
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
            <ZoomIn size={18} />
            Zoom in
          </button>
          {!isPdf ? (
            <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)}>
              <RotateCw size={18} />
              Rotate
            </button>
          ) : null}
          <button type="button" onClick={() => {
            setZoom(1);
            setRotation(0);
          }}>
            <Maximize2 size={18} />
            Reset
          </button>
          <button type="button" onClick={onClose}>
            <XCircle size={18} />
            Close
          </button>
        </div>
      </div>

      <div className="attachment-reader-canvas">
        <div className={isPdf ? "attachment-document attachment-document-pdf" : "attachment-document"} style={documentStyle}>
          {isPdf ? (
            <iframe title={fileInfo.original_name || "PDF prescription"} src={fileInfo.objectUrl} />
          ) : (
            <img alt={fileInfo.original_name || "Prescription attachment"} src={fileInfo.objectUrl} />
          )}
        </div>
      </div>
    </div>
  );
}

function OrderAttachmentPreview({ order }) {
  const [mediaUrls, setMediaUrls] = useState({ prescriptions: [], voice: null });
  const [selectedFile, setSelectedFile] = useState(null);
  const [mediaError, setMediaError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];

    async function loadMedia() {
      setMediaError("");
      setMediaUrls({ prescriptions: [], voice: null });
      try {
        const prescriptions = await Promise.all(
          (order.prescription_files || []).map(async (fileInfo) => {
            const blob = await fetchCustomerMedia(fileInfo.url);
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.push(objectUrl);
            return { ...fileInfo, objectUrl };
          }),
        );

        let voice = null;
        if (order.voice_note_file?.url) {
          const voiceBlob = await fetchCustomerMedia(order.voice_note_file.url);
          const objectUrl = URL.createObjectURL(voiceBlob);
          objectUrls.push(objectUrl);
          voice = { ...order.voice_note_file, objectUrl };
        }

        if (!cancelled) {
          setMediaUrls({ prescriptions, voice });
        }
      } catch (error) {
        if (!cancelled) {
          setMediaError(error.message);
        }
      }
    }

    loadMedia();

    return () => {
      cancelled = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [order.order_id, order.prescription_files, order.voice_note_file]);

  const hasAttachments = Boolean((order.prescription_files || []).length || order.voice_note_file);
  if (!hasAttachments) {
    return (
      <div className="order-attachment-panel">
        <h3>Attachments</h3>
        <p>No prescription image, PDF, or audio note attached.</p>
      </div>
    );
  }

  return (
    <div className="order-attachment-panel">
      <h3>Attachments</h3>
      {mediaError ? <FormMessage kind="error">{mediaError}</FormMessage> : null}

      <div className="customer-media-grid">
        <article>
          <h4><FileImage size={16} /> Prescription files</h4>
          {mediaUrls.prescriptions.length ? (
            <div className="customer-prescription-grid">
              {mediaUrls.prescriptions.map((fileInfo) => (
                fileInfo.content_type === "application/pdf" ? (
                  <button
                    className="customer-prescription-document"
                    key={fileInfo.filename}
                    type="button"
                    onClick={() => setSelectedFile(fileInfo)}
                  >
                    <FileImage size={18} />
                    Open {fileInfo.original_name || "PDF prescription"}
                  </button>
                ) : (
                  <button
                    className="customer-prescription-thumb"
                    key={fileInfo.filename}
                    type="button"
                    onClick={() => setSelectedFile(fileInfo)}
                  >
                    <img
                      alt={fileInfo.original_name || "Prescription attachment"}
                      src={fileInfo.objectUrl}
                    />
                  </button>
                )
              ))}
            </div>
          ) : (
            <p>{order.prescription_files?.length ? "Loading prescription files..." : "No prescription file attached."}</p>
          )}
        </article>

        <article>
          <h4><FileAudio size={16} /> Voice note</h4>
          {mediaUrls.voice ? (
            <audio className="customer-order-audio" controls src={mediaUrls.voice.objectUrl}>
              <track kind="captions" />
            </audio>
          ) : (
            <p>{order.voice_note_file ? "Loading voice note..." : "No voice note attached."}</p>
          )}
        </article>
      </div>
      {selectedFile ? <AttachmentReader fileInfo={selectedFile} onClose={() => setSelectedFile(null)} /> : null}
    </div>
  );
}

export function PharmacyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [disputedOrderIds, setDisputedOrderIds] = useState(new Set());
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const refreshedExpiredOrdersRef = useRef(new Set());
  const isExpiryRefreshRunningRef = useRef(false);

  // Delivery tracking: { [order_id]: DeliveryTrackingResponse | null }
  const [trackingMap, setTrackingMap] = useState({});
  const trackingIntervalRef = useRef(null);

  // Delivery rating: { [order_id]: { star: number, comment: string, submitting: bool, submitted: bool, error: string } }
  const [ratingState, setRatingState] = useState({});

  // Inline cancel confirmation — stores the order_id waiting for user to confirm
  const [pendingCancelOrderId, setPendingCancelOrderId] = useState("");

  async function loadOrders({ showLoading = true } = {}) {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const response = await listCustomerPharmacyOrders();
      setOrders(response);
      setError("");
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    loadOrders();
    listCustomerDisputes()
      .then((disputes) => {
        const ids = new Set(disputes.map((d) => d.source_order_id).filter(Boolean));
        setDisputedOrderIds(ids);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const expiredPendingOrder = orders.find((order) => {
      if (order.status !== "PENDING_CUSTOMER_APPROVAL") {
        return false;
      }
      const { remainingSeconds } = getReviewState(order, nowMs);
      return remainingSeconds === 0 && !refreshedExpiredOrdersRef.current.has(order.order_id);
    });

    if (!expiredPendingOrder || isExpiryRefreshRunningRef.current) {
      return;
    }

    isExpiryRefreshRunningRef.current = true;
    loadOrders({ showLoading: false }).then((isUpdated) => {
      if (isUpdated) {
        refreshedExpiredOrdersRef.current.add(expiredPendingOrder.order_id);
      }
      isExpiryRefreshRunningRef.current = false;
    });
  }, [nowMs, orders]);

  // Poll delivery tracking every 5 seconds for orders that are in transit
  const pollTracking = useCallback(async (currentOrders) => {
    const inTransitOrders = currentOrders.filter((o) => DELIVERY_IN_TRANSIT_STATUSES.has(o.status));
    if (inTransitOrders.length === 0) return;
    const results = await Promise.allSettled(
      inTransitOrders.map((o) => getDeliveryTracking(o.order_id))
    );
    setTrackingMap((prev) => {
      const next = { ...prev };
      inTransitOrders.forEach((o, i) => {
        const r = results[i];
        if (r.status === "fulfilled") {
          next[o.order_id] = r.value; // may be null if no delivery yet
        }
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
    // Immediate first poll
    pollTracking(orders);
    trackingIntervalRef.current = setInterval(() => pollTracking(orders), 15000);
    return () => clearInterval(trackingIntervalRef.current);
  }, [orders, pollTracking]);

  function setRating(orderId, star) {
    setRatingState((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] || {}), star, error: "" } }));
  }

  function setRatingComment(orderId, comment) {
    setRatingState((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] || {}), comment } }));
  }

  async function submitRating(orderId, deliveryOrderId) {
    const rs = ratingState[orderId] || {};
    if (!rs.star) return;
    setRatingState((prev) => ({ ...prev, [orderId]: { ...rs, submitting: true, error: "" } }));
    try {
      await submitDeliveryRating(deliveryOrderId, rs.star, rs.comment || null);
      setRatingState((prev) => ({ ...prev, [orderId]: { ...rs, submitting: false, submitted: true } }));
      // Show "thank you" for 2 s then remove entry so the banner disappears cleanly
      setTimeout(() => {
        setRatingState((prev) => {
          const entry = prev[orderId];
          if (!entry?.submitted) return prev;
          const { [orderId]: _removed, ...rest } = prev;
          return rest;
        });
      }, 2000);
      // Refresh orders so delivery_rated flips to true
      await loadOrders({ showLoading: false });
    } catch (e) {
      setRatingState((prev) => ({ ...prev, [orderId]: { ...rs, submitting: false, error: e.message } }));
    }
  }

  async function actOnOrder(orderId, action) {
    try {
      const updatedOrder = await updateCustomerPharmacyOrder(orderId, action);
      setOrders((current) => current.map((order) => (order.order_id === orderId ? updatedOrder : order)));
      setMessage(`Order ${formatStatus(updatedOrder.status)}.`);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function reorder(orderId) {
    try {
      const newOrder = await reorderCustomerPharmacyOrder(orderId);
      setOrders((current) => [newOrder, ...current]);
      setExpandedOrderId(newOrder.order_id);
      setMessage("Re-order created and is pending approval.");
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function priceReviewSecondsLeft(order) {
    if (!order.customer_review_deadline_at) return 0;
    return Math.max(0, Math.ceil((new Date(order.customer_review_deadline_at).getTime() - nowMs) / 1000));
  }

  async function handleApprovePrice(orderId) {
    try {
      const updatedOrder = await approvePriceEstimate(orderId);
      setOrders((current) => current.map((o) => (o.order_id === orderId ? updatedOrder : o)));
      setMessage("Price approved. The pharmacy is preparing your bill.");
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRejectPrice(orderId) {
    try {
      const updatedOrder = await rejectPriceEstimate(orderId);
      setOrders((current) => current.map((o) => (o.order_id === orderId ? updatedOrder : o)));
      setMessage("Price rejected. The order has been cancelled.");
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function respondSubstitution(orderId, allowed) {
    // Guard against race condition: order status may have advanced since the page rendered
    const order = orders.find((o) => o.order_id === orderId);
    if (order && !SUBSTITUTION_ACTIVE_STATUSES.has(order.status)) {
      setError(
        "This order's status has changed — substitution can no longer be updated. Refresh the page to see the latest state.",
      );
      return;
    }
    try {
      const updatedOrder = await setSubstitutionPermission(orderId, allowed);
      setOrders((current) => current.map((o) => (o.order_id === orderId ? updatedOrder : o)));
      setMessage(allowed ? "Alternative medicine approved." : "No substitution preference saved.");
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function respondPartialFulfillment(orderId, allowed) {
    // Guard against race condition: order status may have advanced since the page rendered
    const order = orders.find((o) => o.order_id === orderId);
    if (order && !SUBSTITUTION_ACTIVE_STATUSES.has(order.status)) {
      setError(
        "This order's status has changed — partial fulfillment can no longer be updated. Refresh the page to see the latest state.",
      );
      return;
    }
    try {
      const updatedOrder = await setPartialFulfillmentPermission(orderId, allowed);
      setOrders((current) => current.map((o) => (o.order_id === orderId ? updatedOrder : o)));
      setMessage(allowed ? "Partial fulfillment approved." : "Partial fulfillment preference saved.");
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="home-layout">
      <div className="pharmacy-page-header">
        <Link className="icon-text-button" to="/home/pharmacy">
          <ArrowLeft size={18} aria-hidden="true" />
          Pharmacy
        </Link>
        <div>
          <p className="eyebrow">Pharmacy orders</p>
          <h1>My orders</h1>
          <p>Track pharmacy orders, review pharmacy updates, and take customer actions.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="home-loading">
          <RefreshCw size={20} aria-hidden="true" />
          Loading orders
        </div>
      ) : null}

      {message ? <FormMessage kind="success">{message}</FormMessage> : null}
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}

      {!isLoading && !error && orders.length === 0 ? (
        <div className="home-empty">
          <p>No pharmacy orders yet.</p>
          <Link className="button" to="/home/pharmacy/order">Order Medicine</Link>
        </div>
      ) : null}

      <div className="order-list">
        {orders.map((order) => {
          const isExpanded = expandedOrderId === order.order_id;
          const { billingMode, deadlineMs, remainingSeconds } = getReviewState(order, nowMs);
          const isPending = order.status === "PENDING_CUSTOMER_APPROVAL";
          const isManualPending = isPending && billingMode === "manual";
          const isAutoPending = isPending && billingMode === "auto";
          const isAutoCancelOpen = isAutoPending && remainingSeconds > 0;
          const isManualActionOpen = isManualPending && remainingSeconds > 0;
          const isLockedOfferOrder = Boolean(order.notes?.locked_offer_order);
          const deadlineLabel = new Date(deadlineMs).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
          const canReorder = order.status === "COMPLETED";
          const isCancelled = order.status === "CANCELLED";
          const displayAmount = order.final_amount || order.estimated_amount || null;
          const amountLabel = order.final_amount
            ? "Final amount"
            : order.estimated_amount
            ? "Pharmacy estimate"
            : null;
          return (
            <article className="order-card" key={order.order_id}>
              <div className="order-card-header">
                <div>
                  <span className={`order-status order-status-${order.status.toLowerCase()}`}>
                    {formatStatus(order.status)}
                  </span>
                  <h2>{order.pharmacy_name || "Pharmacy order"}</h2>
                  <p>
                    {[order.pharmacy_city, order.pharmacy_pincode].filter(Boolean).join(" - ") ||
                      "Pharmacy details pending"}
                  </p>
                </div>
                <div className="order-amount">
                  {displayAmount ? (
                    <>
                      <span>{amountLabel}</span>
                      <strong>₹{Number(displayAmount).toFixed(2)}</strong>
                    </>
                  ) : (
                    <span className="order-amount-pending">
                      {isCancelled ? "Cancelled" : "Awaiting estimate"}
                    </span>
                  )}
                </div>
              </div>

              <div className={`order-review-banner ${billingMode === "manual" ? "order-review-banner-manual" : ""}`}>
                <Clock3 size={18} />
                {isAutoPending ? (
                  <span>
                    {isLockedOfferOrder ? "Offer order" : "Auto approval is ON"}. You can cancel this order for a maximum
                    of 2 minutes from order placed time, until <strong>{deadlineLabel}</strong>. Time left:{" "}
                    <strong>{formatCountdown(remainingSeconds)}</strong>.
                    After that, it will go for pharmacy approval automatically.
                  </span>
                ) : null}
                {isManualPending ? (
                  <span>
                    Manual approval is ON. You have 5 minutes from order placed time, until{" "}
                    <strong>{deadlineLabel}</strong>, to review pricing and approve. Time left:{" "}
                    <strong>{formatCountdown(remainingSeconds)}</strong>. After that, this order will be auto-cancelled.
                  </span>
                ) : null}
                {!isPending ? (
                  <span>{formatStatus(order.status)} order. Customer action window is closed.</span>
                ) : null}
              </div>

              <div className="order-pricing-box">
                {order.price_breakdown ? (
                  <>
                    <span>Medicines: ₹{Number(order.price_breakdown.medicine_cost).toFixed(2)}</span>
                    <span>Delivery: ₹{Number(order.price_breakdown.delivery_charge).toFixed(2)}</span>
                    <span>Platform fee: ₹{Number(order.price_breakdown.platform_fee).toFixed(2)}</span>
                    {Number(order.price_breakdown.gst_amount) > 0 && (
                      <span>GST ({Number(order.price_breakdown.gst_percent).toFixed(1)}%): ₹{Number(order.price_breakdown.gst_amount).toFixed(2)}</span>
                    )}
                    <strong>Total: ₹{Number(order.final_amount || order.estimated_amount).toFixed(2)}</strong>
                  </>
                ) : displayAmount ? (
                  <span>{amountLabel}: <strong>₹{Number(displayAmount).toFixed(2)}</strong></span>
                ) : isCancelled ? (
                  <span className="order-pricing-note">Order cancelled before pricing was confirmed.</span>
                ) : (
                  <span className="order-pricing-note">Pricing will appear once the pharmacy reviews your order.</span>
                )}
              </div>

              <div className="order-action-row">
                <button className="button button-secondary" type="button" onClick={() => setExpandedOrderId(isExpanded ? "" : order.order_id)}>
                  <Eye size={18} />
                  {isExpanded ? "Hide details" : "View details"}
                </button>

                {/* Cancel with inline confirm — prevents accidental irreversible cancellation */}
                {isAutoCancelOpen ? (
                  pendingCancelOrderId === order.order_id ? (
                    <div className="cancel-confirm-row">
                      <span>Cancel order? ({formatCountdown(remainingSeconds)} left)</span>
                      <button
                        className="button button-danger address-card-action-sm"
                        type="button"
                        onClick={() => {
                          setPendingCancelOrderId("");
                          actOnOrder(order.order_id, "cancel");
                        }}
                      >
                        Yes, cancel
                      </button>
                      <button
                        className="button button-secondary address-card-action-sm"
                        type="button"
                        onClick={() => setPendingCancelOrderId("")}
                      >
                        Keep order
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => setPendingCancelOrderId(order.order_id)}
                    >
                      <XCircle size={18} />
                      Cancel ({formatCountdown(remainingSeconds)})
                    </button>
                  )
                ) : null}

                {isManualActionOpen ? (
                  <>
                    <button className="button" type="button" onClick={() => actOnOrder(order.order_id, "approve")}>
                      <CheckCircle2 size={18} />
                      Approve ({formatCountdown(remainingSeconds)})
                    </button>
                    <button className="button button-danger" type="button" onClick={() => actOnOrder(order.order_id, "reject")}>
                      <XCircle size={18} />
                      Reject
                    </button>
                  </>
                ) : null}
                {canReorder ? (
                  <button className="button" type="button" onClick={() => reorder(order.order_id)}>
                    <PackagePlus size={18} />
                    Re-order
                  </button>
                ) : null}
              </div>


              {/* ── Delivery rating banner (COMPLETED) ── */}
              {order.status === "COMPLETED" && order.delivery_order_id ? (() => {
                const rs = ratingState[order.order_id] || {};

                // Briefly show success message after submit, then entry is cleared by setTimeout
                if (rs.submitted) {
                  return (
                    <div className="delivery-rating-success" role="status">
                      <CheckCircle2 size={18} aria-hidden="true" />
                      Rating submitted — thank you!
                    </div>
                  );
                }

                // Already rated in a previous session — show compact confirmation
                if (order.delivery_rated) {
                  return (
                    <div className="delivery-rated-note">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Delivery rated
                    </div>
                  );
                }

                // Not yet rated — show the rating form
                return (
                  <div className="delivery-rating-banner">
                    <div className="delivery-rating-title">⭐ Rate your delivery</div>
                    <p className="delivery-rating-sub">How was your delivery experience?</p>

                    {/* Star picker */}
                    <div className="delivery-rating-stars" role="group" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`delivery-rating-star ${(rs.star || 0) >= n ? "delivery-rating-star-filled" : ""}`}
                          onClick={() => setRating(order.order_id, n)}
                          aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        >
                          <Star size={28} />
                        </button>
                      ))}
                    </div>

                    {/* Comment */}
                    <textarea
                      className="delivery-rating-comment"
                      placeholder="Leave a comment (optional)"
                      maxLength={500}
                      rows={3}
                      value={rs.comment || ""}
                      onChange={(e) => setRatingComment(order.order_id, e.target.value)}
                    />
                    <div className="delivery-rating-char-count">
                      {(rs.comment || "").length} / 500
                    </div>

                    {rs.error ? <p className="delivery-rating-error">{rs.error}</p> : null}

                    <button
                      type="button"
                      className="delivery-rating-submit"
                      disabled={!rs.star || rs.submitting}
                      onClick={() => submitRating(order.order_id, order.delivery_order_id)}
                    >
                      {rs.submitting ? "Submitting…" : "Submit Rating"}
                    </button>
                  </div>
                );
              })() : null}

              {/* ── Price review invoice card (PENDING_PRICE_REVIEW) ── */}
              {order.status === "PENDING_PRICE_REVIEW" ? (() => {
                const secs = priceReviewSecondsLeft(order);
                const bd = order.price_breakdown;
                const totalAmt = parseFloat(order.estimated_amount || 0);
                const urgency = secs <= 60 ? "critical" : secs <= 180 ? "warning" : "normal";
                return (
                  <div className="price-invoice-card">
                    {/* Header */}
                    <div className="price-invoice-header">
                      <div className="price-invoice-title-row">
                        <span className="price-invoice-label">Price Estimate from Pharmacy</span>
                        <span className={`price-invoice-timer price-invoice-timer-${urgency}`}>
                          <Clock3 size={14} />
                          {secs > 0 ? `Expires in ${formatCountdown(secs)}` : "Expired"}
                        </span>
                      </div>
                      <p className="price-invoice-sub">
                        Review the breakdown below and accept or reject within the time limit.
                        If no action is taken, the order will be <strong>auto-cancelled</strong>.
                      </p>
                    </div>

                    {/* Invoice table */}
                    <div className="price-invoice-body">
                      <div className="price-invoice-from">
                        <span className="price-invoice-from-label">From</span>
                        <span className="price-invoice-from-name">{order.pharmacy_name || "Pharmacy"}</span>
                        {(order.pharmacy_city || order.pharmacy_pincode) && (
                          <span className="price-invoice-from-loc">
                            {[order.pharmacy_city, order.pharmacy_pincode].filter(Boolean).join(" – ")}
                          </span>
                        )}
                      </div>

                      <table className="price-invoice-table">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th className="price-invoice-amt-col">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bd ? (
                            <>
                              <tr>
                                <td>
                                  <span className="price-invoice-item-icon">💊</span>
                                  Medicine / Products
                                </td>
                                <td className="price-invoice-amt-col">₹{parseFloat(bd.medicine_cost).toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td>
                                  <span className="price-invoice-item-icon">🚚</span>
                                  Delivery Charge
                                  {bd.delivery_km > 0 && (
                                    <span className="price-invoice-sub-detail">
                                      {parseFloat(bd.delivery_km).toFixed(2)} km × ₹{parseFloat(bd.rate_per_km).toFixed(2)}/km
                                    </span>
                                  )}
                                </td>
                                <td className="price-invoice-amt-col">₹{parseFloat(bd.delivery_charge).toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td>
                                  <span className="price-invoice-item-icon">🏷️</span>
                                  Platform Fee
                                </td>
                                <td className="price-invoice-amt-col">₹{parseFloat(bd.platform_fee).toFixed(2)}</td>
                              </tr>
                              <tr className="price-invoice-subtotal-row">
                                <td>Subtotal</td>
                                <td className="price-invoice-amt-col">₹{parseFloat(bd.subtotal).toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td>
                                  <span className="price-invoice-item-icon">🧾</span>
                                  GST ({parseFloat(bd.gst_percent).toFixed(1)}%)
                                </td>
                                <td className="price-invoice-amt-col">₹{parseFloat(bd.gst_amount).toFixed(2)}</td>
                              </tr>
                              {bd.notes && (
                                <tr className="price-invoice-notes-row">
                                  <td colSpan={2}>
                                    <span className="price-invoice-notes-text">📝 {bd.notes}</span>
                                  </td>
                                </tr>
                              )}
                            </>
                          ) : (
                            <tr>
                              <td>Order total</td>
                              <td className="price-invoice-amt-col">₹{totalAmt.toFixed(2)}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="price-invoice-total-row">
                            <td><strong>Total Payable</strong></td>
                            <td className="price-invoice-amt-col price-invoice-total-amt">
                              <strong>₹{totalAmt.toFixed(2)}</strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Actions */}
                    <div className="price-invoice-actions">
                      <button
                        className={`price-invoice-accept-btn${secs === 0 ? " disabled" : ""}`}
                        type="button"
                        disabled={secs === 0}
                        onClick={() => handleApprovePrice(order.order_id)}
                      >
                        <CheckCircle2 size={18} />
                        Accept ₹{totalAmt.toFixed(2)}
                      </button>
                      <button
                        className="price-invoice-reject-btn"
                        type="button"
                        onClick={() => handleRejectPrice(order.order_id)}
                      >
                        <XCircle size={18} />
                        Reject &amp; Cancel
                      </button>
                    </div>

                    {/* Progress bar for timer */}
                    {order.customer_review_deadline_at && (
                      <div className="price-invoice-progress-track">
                        <div
                          className={`price-invoice-progress-bar price-invoice-progress-${urgency}`}
                          style={{ width: `${Math.min(100, (secs / 420) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })() : null}

              {/* ── Pickup ready (READY_FOR_PICKUP) — pickup_code is for the delivery
                   partner/pharmacy handover, not shown to the customer ── */}
              {order.status === "READY_FOR_PICKUP" ? (
                <div className="pickup-code-banner">
                  <strong>Your order is ready!</strong>
                  <p>It will be handed over to your delivery partner shortly.</p>
                </div>
              ) : null}

              {/* ── Delivery status context messages ── */}
              {order.status === "READY_FOR_DELIVERY" ? (
                <div className="delivery-status-banner delivery-status-banner-waiting">
                  📦 Your order is packed and waiting for a delivery partner to be assigned.
                </div>
              ) : order.status === "ASSIGNED_TO_DELIVERY" ? (
                <div className="delivery-status-banner delivery-status-banner-assigned">
                  🛵 A delivery partner has been assigned and will pick up your order shortly.
                </div>
              ) : null}

              {/* ── Live delivery map + call button ── */}
              {(() => {
                if (!DELIVERY_IN_TRANSIT_STATUSES.has(order.status)) return null;
                const tracking = trackingMap[order.order_id];
                if (!tracking) return null;

                const dropLat = order.order_notes?.address_latitude;
                const dropLng = order.order_notes?.address_longitude;
                const distToCustomer =
                  tracking.driver_lat && tracking.driver_lng && dropLat && dropLng
                    ? haversineMetres(tracking.driver_lat, tracking.driver_lng, dropLat, dropLng)
                    : null;
                const isNear = distToCustomer !== null && distToCustomer <= CALL_VISIBLE_METRES;
                const canCall = isNear && tracking.driver_phone;

                return (
                  <>
                    {tracking.driver_lat && (
                      <DeliveryMap tracking={tracking} dropLat={dropLat} dropLng={dropLng} />
                    )}
                    <div className="delivery-tracking-banner">
                      <div className="delivery-tracking-info">
                        <span className="delivery-tracking-icon">🛵</span>
                        <div>
                          <strong>{tracking.driver_name || "Driver"}</strong>
                          <span className="delivery-tracking-status">
                            {tracking.status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                        </div>
                      </div>
                      {canCall && (
                        <a
                          href={`tel:${tracking.driver_phone}`}
                          className="delivery-call-button"
                          aria-label={`Call delivery driver ${tracking.driver_name}`}
                        >
                          <Phone size={18} />
                          Call Driver
                        </a>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Delivery PIN — visible only after order is picked up by the driver */}
              {DELIVERY_PIN_VISIBLE_STATUSES.has(order.status) ? (() => {
                const tracking = trackingMap[order.order_id];
                if (!tracking?.delivery_pin) return null;
                return (
                  <div className="delivery-pin-banner">
                    <div className="delivery-pin-label">🔐 Delivery PIN</div>
                    <div className="delivery-pin-chip">{tracking.delivery_pin}</div>
                    <p className="delivery-pin-hint">
                      Your delivery partner will ask for this PIN before handing over your order.
                      Only share it when you are ready to receive the package at your door.
                    </p>
                  </div>
                );
              })() : null}

              {isExpanded ? (
                <div className="order-detail-panel">
                  <dl>
                    <div>
                      <dt>Doctor</dt>
                      <dd>{order.doctor_name || "Self"}</dd>
                    </div>
                    <div>
                      <dt>Patient</dt>
                      <dd>{order.patient_name || "Customer"}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{new Date(order.created_at).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Billing mode</dt>
                      <dd>{order.notes?.billing_mode === "manual" ? "Manual review" : "Auto approval"}</dd>
                    </div>
                  </dl>
                  {/* Substitution permission — shown while order is with the pharmacy */}
                  {(order.status === "ASSIGNED_TO_PHARMACY" || order.status === "PHARMACY_ACCEPTED") ? (
                    <div className="substitution-permission-panel">
                      <h3>Medicine substitution</h3>
                      {order.substitution_allowed === true ? (
                        <div className="substitution-badge substitution-badge-approved">
                          <CheckCircle2 size={16} aria-hidden="true" />
                          Alternative Approved
                        </div>
                      ) : order.substitution_allowed === false ? (
                        <div className="substitution-badge substitution-badge-denied">
                          <XCircle size={16} aria-hidden="true" />
                          No Substitution Allowed
                        </div>
                      ) : (
                        <>
                          <p className="substitution-prompt">
                            If a medicine in your order is out of stock, can the pharmacy suggest an alternative?
                          </p>
                          <div className="substitution-actions">
                            <button
                              className="button"
                              type="button"
                              onClick={() => respondSubstitution(order.order_id, true)}
                            >
                              <CheckCircle2 size={16} />
                              Yes, Allow Alternative
                            </button>
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => respondSubstitution(order.order_id, false)}
                            >
                              <XCircle size={16} />
                              No, Keep Original Only
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : order.substitution_allowed === true ? (
                    <div className="substitution-badge substitution-badge-approved">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Alternative Approved
                    </div>
                  ) : null}

                  {/* Partial fulfillment permission — only meaningful for multi-item orders */}
                  {order.items.length > 1 && (order.status === "ASSIGNED_TO_PHARMACY" || order.status === "PHARMACY_ACCEPTED") ? (
                    <div className="substitution-permission-panel">
                      <h3>Partial fulfillment</h3>
                      {order.partial_fulfillment_allowed === true ? (
                        <div className="substitution-badge substitution-badge-approved">
                          <CheckCircle2 size={16} aria-hidden="true" />
                          Partial Fulfillment Allowed — missing items become a new order
                        </div>
                      ) : order.partial_fulfillment_allowed === false ? (
                        <div className="substitution-badge substitution-badge-denied">
                          <XCircle size={16} aria-hidden="true" />
                          Full Order Only
                        </div>
                      ) : (
                        <>
                          <p className="substitution-prompt">
                            If the pharmacy only has some of your items in stock, should they fulfil what they
                            have and let us auto-create a new order for the rest?
                          </p>
                          <div className="substitution-actions">
                            <button
                              className="button"
                              type="button"
                              onClick={() => respondPartialFulfillment(order.order_id, true)}
                            >
                              <CheckCircle2 size={16} />
                              Yes, Allow Partial Fulfillment
                            </button>
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => respondPartialFulfillment(order.order_id, false)}
                            >
                              <XCircle size={16} />
                              No, Full Order Only
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : order.partial_fulfillment_allowed === true ? (
                    <div className="substitution-badge substitution-badge-approved">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Partial Fulfillment Allowed
                    </div>
                  ) : null}
                  {order.split_from_order_id ? (
                    <div className="substitution-badge substitution-badge-approved">
                      Split from order {String(order.split_from_order_id).slice(0, 8)}
                    </div>
                  ) : null}

                  <div>
                    <h3>Order items</h3>
                    {order.items.length ? order.items.map((item) => (
                      <div className="order-item-row" key={`${order.order_id}-${item.name}-${item.metric}`}>
                        <strong>{item.name}</strong>
                        <span>
                          {item.quantity} {item.metric}
                          {item.line_total ? ` • ₹${item.line_total}` : ""}
                        </span>
                      </div>
                    )) : <p>No typed medicines. Prescription or voice note order.</p>}
                  </div>
                  <OrderAttachmentPreview order={order} />
                  {order.customer_action_comment ? (
                    <p className="hint">Customer comment: {order.customer_action_comment}</p>
                  ) : null}

                  {/* ── Dispute actions ── */}
                  <div className="order-dispute-row">
                    {(order.status === "COMPLETED" || order.status === "DELIVERED") && (
                      <a
                        href={`/home/disputes/raise?order_id=${order.order_id}&sectors=pharmacy,delivery`}
                        className="order-dispute-link"
                      >
                        ⚠️ Raise a dispute
                      </a>
                    )}
                    {disputedOrderIds.has(order.order_id) && (
                      <a href="/home/disputes" className="order-dispute-view-link">
                        My disputes →
                      </a>
                    )}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
