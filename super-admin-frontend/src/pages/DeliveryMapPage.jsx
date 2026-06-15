import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, RefreshCw, RotateCw, Users } from "lucide-react";
import { DeliveryLayout } from "./DeliveryLayout.jsx";
import {
  getActiveDeliveryLocations,
  getDeliveryLocationTrail,
  listDeliveryOrders,
} from "../lib/api.js";

// ── constants ────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  DELIVERY_ACCEPTED:    "#f59e0b",
  ARRIVED_AT_STORE:     "#fb923c",
  ORDER_PICKED_UP:      "#3b82f6",
  ARRIVED_AT_CUSTOMER:  "#a855f7",
};
const STATUS_LABEL = {
  DELIVERY_ACCEPTED:    "Heading to pharmacy",
  ARRIVED_AT_STORE:     "At pharmacy",
  ORDER_PICKED_UP:      "En route to customer",
  ARRIVED_AT_CUSTOMER:  "At customer",
};
const LIVE_POLL_MS  = 15_000;
const REPLAY_STEP_MS = 600; // ms between frames in replay animation

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}
function elapsed(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function bikeSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <!-- body/torso -->
    <ellipse cx="18" cy="17" rx="5" ry="6" fill="${color}"/>
    <!-- head -->
    <circle cx="18" cy="9" r="4" fill="${color}"/>
    <!-- helmet visor -->
    <path d="M14.5 8.5 Q18 6.5 21.5 8.5 Q21.5 11 18 11 Q14.5 11 14.5 8.5Z" fill="rgba(0,0,0,0.25)"/>
    <!-- rear wheel -->
    <circle cx="9" cy="26" r="5" fill="none" stroke="${color}" stroke-width="2.5"/>
    <circle cx="9" cy="26" r="1.5" fill="${color}"/>
    <!-- front wheel -->
    <circle cx="27" cy="26" r="5" fill="none" stroke="${color}" stroke-width="2.5"/>
    <circle cx="27" cy="26" r="1.5" fill="${color}"/>
    <!-- frame -->
    <line x1="9" y1="26" x2="18" y2="18" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    <line x1="27" y1="26" x2="18" y2="18" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    <line x1="9" y1="26" x2="27" y2="26" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <!-- handlebar -->
    <line x1="24" y1="19" x2="29" y2="17" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    <!-- white border ring -->
    <circle cx="18" cy="18" r="17" fill="none" stroke="#fff" stroke-width="2" opacity="0.8"/>
  </svg>`;
}

function makeDriverIcon(L, color) {
  return L.divIcon({
    className: "",
    html: `<div style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));width:36px;height:36px">${bikeSvg(color)}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function makeReplayIcon(L, color) {
  return L.divIcon({
    className: "",
    html: `<div style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3));width:24px;height:24px">${bikeSvg(color)}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ── Live tab ─────────────────────────────────────────────────────────────────
function LiveMap({ mapRef, leafletMapRef, markersRef }) {
  const [drivers, setDrivers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getActiveDeliveryLocations();
      setDrivers(data);
      setLastRefresh(new Date());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Build/update markers whenever drivers list changes
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current) return;

    // Init map once
    if (!leafletMapRef.current) {
      const center = drivers.length > 0
        ? [drivers[0].lat, drivers[0].lng]
        : [11.0168, 76.9558];
      leafletMapRef.current = L.map(mapRef.current, { zoomControl: true })
        .setView(center, 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(leafletMapRef.current);
    }

    // Remove stale markers
    const currentIds = new Set(drivers.map((d) => d.delivery_order_id));
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    drivers.forEach((d) => {
      const color = STATUS_COLOR[d.status] || "#6366f1";
      const label = STATUS_LABEL[d.status] || d.status;

      const popup = `
        <div style="min-width:180px;font-size:0.82rem;line-height:1.6">
          <strong style="font-size:0.9rem">${d.driver_name}</strong><br/>
          <span style="color:${color};font-weight:600">${label}</span><br/>
          ${d.road_km_to_customer != null
            ? `📍 ${d.road_km_to_customer.toFixed(1)} km · ETA ${d.eta_minutes ?? "?"}min<br/>`
            : ""}
          🕒 Updated ${elapsed(d.location_updated_at)}
        </div>`;

      if (markersRef.current[d.delivery_order_id]) {
        markersRef.current[d.delivery_order_id]
          .setLatLng([d.lat, d.lng])
          .setPopupContent(popup);
      } else {
        const marker = L.marker([d.lat, d.lng], {
          icon: makeDriverIcon(L, color),
        })
          .addTo(leafletMapRef.current)
          .bindPopup(popup);
        marker.on("click", () => setSelected(d));
        markersRef.current[d.delivery_order_id] = marker;
      }
    });
  }, [drivers]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="admin-map-panel">
      {/* Side panel */}
      <div className="admin-map-sidebar">
        <div className="admin-map-sidebar-header">
          <span>{drivers.length} active deliveries</span>
          <button className="icon-btn-sm" onClick={load} title="Refresh now">
            <RefreshCw size={14} className={loading ? "spin" : ""} />
          </button>
        </div>
        {error && <p className="admin-map-error">{error}</p>}
        {lastRefresh && (
          <p className="admin-map-refresh-time">Updated {fmtTime(lastRefresh.toISOString())}</p>
        )}

        <div className="admin-map-driver-list">
          {drivers.length === 0 && !loading && (
            <p className="admin-map-empty">No active deliveries right now.</p>
          )}
          {drivers.map((d) => {
            const color = STATUS_COLOR[d.status] || "#6366f1";
            const isSelected = selected?.delivery_order_id === d.delivery_order_id;
            return (
              <button
                key={d.delivery_order_id}
                className={`admin-map-driver-row ${isSelected ? "admin-map-driver-row--selected" : ""}`}
                onClick={() => {
                  setSelected(d);
                  if (leafletMapRef.current && markersRef.current[d.delivery_order_id]) {
                    leafletMapRef.current.setView([d.lat, d.lng], 15);
                    markersRef.current[d.delivery_order_id].openPopup();
                  }
                }}
              >
                <span className="admin-map-driver-dot" style={{ background: color }} />
                <span className="admin-map-driver-name">{d.driver_name}</span>
                <span className="admin-map-driver-meta">{STATUS_LABEL[d.status] || d.status}</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="admin-map-detail">
            <strong>{selected.driver_name}</strong>
            <div style={{ color: STATUS_COLOR[selected.status] || "#6366f1", fontWeight: 600 }}>
              {STATUS_LABEL[selected.status] || selected.status}
            </div>
            {selected.road_km_to_customer != null && (
              <div>📍 {selected.road_km_to_customer.toFixed(1)} km · ETA ~{selected.eta_minutes ?? "?"}min</div>
            )}
            <div>🕒 {elapsed(selected.location_updated_at)}</div>
          </div>
        )}
      </div>

      {/* Map */}
      <div ref={mapRef} className="admin-map-canvas" />
    </div>
  );
}

// ── Replay tab ───────────────────────────────────────────────────────────────
function ReplayMap({ replayMapRef, replayLeafletRef }) {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [trail, setTrail] = useState([]);
  const [loadingTrail, setLoadingTrail] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const playRef = useRef(null);
  const replayMarkerRef = useRef(null);
  const polylineRef = useRef(null);

  useEffect(() => {
    listDeliveryOrders()
      .then((data) => {
        const completed = data.filter((o) => o.status === "DELIVERED" || o.delivered_at);
        setOrders(completed.sort((a, b) => new Date(b.delivered_at || b.created_at) - new Date(a.delivered_at || a.created_at)));
      })
      .catch(() => {})
      .finally(() => setLoadingOrders(false));
  }, []);

  async function loadTrail(order) {
    setSelectedOrder(order);
    setTrail([]);
    setFrameIdx(0);
    setPlaying(false);
    clearInterval(playRef.current);
    setLoadingTrail(true);
    try {
      const data = await getDeliveryLocationTrail(order.delivery_order_id);
      setTrail(data);
      initReplayMap(data, order);
    } catch (e) {
      console.warn("Trail load failed", e);
    } finally {
      setLoadingTrail(false);
    }
  }

  function initReplayMap(trailData, order) {
    const L = window.L;
    if (!L || !replayMapRef.current) return;

    if (replayLeafletRef.current) {
      replayLeafletRef.current.remove();
      replayLeafletRef.current = null;
      replayMarkerRef.current = null;
      polylineRef.current = null;
    }

    if (trailData.length === 0) return;

    const first = trailData[0];
    const map = L.map(replayMapRef.current, { zoomControl: true })
      .setView([first.lat, first.lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 19,
    }).addTo(map);

    // Full trail as faint polyline
    const latlngs = trailData.map((p) => [p.lat, p.lng]);
    polylineRef.current = L.polyline(latlngs, { color: "#6366f1", weight: 2, opacity: 0.4 }).addTo(map);
    map.fitBounds(polylineRef.current.getBounds(), { padding: [30, 30] });

    // Pickup + dropoff pins
    if (order.pickup_lat && order.pickup_lng) {
      L.marker([order.pickup_lat, order.pickup_lng])
        .addTo(map)
        .bindTooltip("🏪 Pharmacy pickup", { permanent: false });
    }
    if (order.dropoff_lat && order.dropoff_lng) {
      L.marker([order.dropoff_lat, order.dropoff_lng])
        .addTo(map)
        .bindTooltip("📍 Customer", { permanent: false });
    }

    // Replay marker at start
    replayMarkerRef.current = L.marker([first.lat, first.lng], {
      icon: makeReplayIcon(L, "#6366f1"),
    }).addTo(map);

    replayLeafletRef.current = map;
  }

  // Animate replay
  useEffect(() => {
    clearInterval(playRef.current);
    if (!playing || trail.length === 0) return;

    playRef.current = setInterval(() => {
      setFrameIdx((prev) => {
        const next = prev + 1;
        if (next >= trail.length) {
          setPlaying(false);
          return prev;
        }
        const point = trail[next];
        if (replayMarkerRef.current) {
          replayMarkerRef.current.setLatLng([point.lat, point.lng]);
          if (replayLeafletRef.current) {
            replayLeafletRef.current.panTo([point.lat, point.lng], { animate: true, duration: 0.5 });
          }
        }
        return next;
      });
    }, REPLAY_STEP_MS / speed);

    return () => clearInterval(playRef.current);
  }, [playing, trail, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSeek(idx) {
    setFrameIdx(idx);
    if (replayMarkerRef.current && trail[idx]) {
      replayMarkerRef.current.setLatLng([trail[idx].lat, trail[idx].lng]);
    }
  }

  const currentPoint = trail[frameIdx];

  return (
    <div className="admin-map-panel">
      {/* Order picker */}
      <div className="admin-map-sidebar">
        <div className="admin-map-sidebar-header">
          <span>Completed orders</span>
        </div>
        {loadingOrders && <p className="admin-map-empty">Loading…</p>}
        <div className="admin-map-driver-list">
          {orders.map((o) => (
            <button
              key={o.delivery_order_id}
              className={`admin-map-driver-row ${selectedOrder?.delivery_order_id === o.delivery_order_id ? "admin-map-driver-row--selected" : ""}`}
              onClick={() => loadTrail(o)}
            >
              <span className="admin-map-driver-name">#{String(o.delivery_order_id).slice(0, 8).toUpperCase()}</span>
              <span className="admin-map-driver-meta">{fmtDate(o.delivered_at || o.created_at)}</span>
            </button>
          ))}
          {!loadingOrders && orders.length === 0 && (
            <p className="admin-map-empty">No completed deliveries yet.</p>
          )}
        </div>

        {selectedOrder && (
          <div className="admin-map-detail">
            <strong>Order #{String(selectedOrder.delivery_order_id).slice(0, 8).toUpperCase()}</strong>
            <div>{trail.length} location points</div>
            <div>Delivered {fmtDate(selectedOrder.delivered_at)}</div>
          </div>
        )}
      </div>

      {/* Replay map + controls */}
      <div className="admin-replay-panel">
        {loadingTrail && <p className="admin-map-loading">Loading trail…</p>}
        {!selectedOrder && !loadingTrail && (
          <div className="admin-replay-placeholder">
            ← Pick a completed order to replay its GPS trail
          </div>
        )}

        <div ref={replayMapRef} className="admin-map-canvas" style={{ display: selectedOrder && trail.length > 0 ? "block" : "none" }} />

        {trail.length > 0 && (
          <div className="admin-replay-controls">
            <button
              className="icon-btn-sm"
              onClick={() => { setFrameIdx(0); handleSeek(0); setPlaying(false); }}
              title="Reset"
            >
              <RotateCw size={14} />
            </button>
            <button
              className="icon-btn-sm"
              onClick={() => setPlaying((p) => !p)}
              title={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={trail.length - 1}
              value={frameIdx}
              onChange={(e) => { setPlaying(false); handleSeek(Number(e.target.value)); }}
              className="admin-replay-scrubber"
            />
            <span className="admin-replay-time">
              {currentPoint ? fmtTime(currentPoint.recorded_at) : "—"}
            </span>
            <select
              className="admin-replay-speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
        )}

        {selectedOrder && trail.length === 0 && !loadingTrail && (
          <div className="admin-replay-placeholder">
            No GPS trail recorded for this order.<br />
            <small>Trail recording started after Phase 3 deployment.</small>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function DeliveryMapPage() {
  const [tab, setTab] = useState("live");

  // Live map refs (shared so map persists during sidebar interactions)
  const liveMapRef   = useRef(null);
  const liveLeaflet  = useRef(null);
  const liveMarkers  = useRef({});

  // Replay map refs
  const replayMapRef    = useRef(null);
  const replayLeaflet   = useRef(null);

  // Destroy live map when switching away, rebuild on return
  useEffect(() => {
    if (tab !== "live" && liveLeaflet.current) {
      Object.values(liveMarkers.current).forEach((m) => m.remove());
      liveMarkers.current = {};
      liveLeaflet.current.remove();
      liveLeaflet.current = null;
    }
    if (tab !== "replay" && replayLeaflet.current) {
      replayLeaflet.current.remove();
      replayLeaflet.current = null;
    }
  }, [tab]);

  return (
    <DeliveryLayout>
      <div className="admin-map-tabs">
        <button
          className={`admin-map-tab ${tab === "live" ? "admin-map-tab--active" : ""}`}
          onClick={() => setTab("live")}
        >
          <Users size={15} /> Live Orders
        </button>
        <button
          className={`admin-map-tab ${tab === "replay" ? "admin-map-tab--active" : ""}`}
          onClick={() => setTab("replay")}
        >
          <Play size={15} /> Replay Trail
        </button>
      </div>

      {tab === "live" && (
        <LiveMap
          mapRef={liveMapRef}
          leafletMapRef={liveLeaflet}
          markersRef={liveMarkers}
        />
      )}
      {tab === "replay" && (
        <ReplayMap
          replayMapRef={replayMapRef}
          replayLeafletRef={replayLeaflet}
        />
      )}
    </DeliveryLayout>
  );
}
