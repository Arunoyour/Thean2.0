import { useEffect, useRef, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { DeliveryLayout } from "./DeliveryLayout.jsx";
import { listDeliveryAccounts, listDeliveryOrders } from "../lib/api.js";

// Marker colours keyed by driver state
const MARKER_CONFIG = {
  online_idle:        { color: "#22c55e", label: "Online · Idle",           emoji: "🟢" },
  way_to_pickup:      { color: "#f59e0b", label: "En Route to Pickup",      emoji: "🟡" },
  way_to_delivery:    { color: "#3b82f6", label: "En Route to Customer",    emoji: "🔵" },
  waiting_customer:   { color: "#a855f7", label: "At Customer",             emoji: "🟣" },
  at_store:           { color: "#fb923c", label: "At Store",                emoji: "🟠" },
  cod_blocked:        { color: "#ef4444", label: "COD Blocked",             emoji: "🔴" },
  offline:            { color: "#475569", label: "Offline",                 emoji: "⚫" },
};

function driverState(account, activeOrders) {
  if (account.cod_blocked) return "cod_blocked";
  const order = activeOrders[account.account_id];
  if (!order) return account.is_online ? "online_idle" : "offline";
  const s = order.status;
  if (s === "DELIVERY_ACCEPTED") return "way_to_pickup";
  if (s === "ARRIVED_AT_STORE")  return "at_store";
  if (s === "ORDER_PICKED_UP")   return "way_to_delivery";
  if (s === "ARRIVED_AT_CUSTOMER") return "waiting_customer";
  return account.is_online ? "online_idle" : "offline";
}

export function DeliveryMapPage() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef({});
  const [accounts, setAccounts] = useState([]);
  const [activeOrderMap, setActiveOrderMap] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [accs, orders] = await Promise.all([listDeliveryAccounts(), listDeliveryOrders()]);
      const activeStatuses = ["ASSIGNED_TO_DELIVERY","DELIVERY_ACCEPTED","ARRIVED_AT_STORE","ORDER_PICKED_UP","ARRIVED_AT_CUSTOMER"];
      const orderMap = {};
      orders.forEach(o => {
        if (activeStatuses.includes(o.status)) orderMap[o.account_id] = o;
      });
      setAccounts(accs);
      setActiveOrderMap(orderMap);
      setLastRefresh(new Date());
      setLoading(false);
    } catch (e) { setLoading(false); }
  }

  // Build / update Leaflet map once data arrives
  useEffect(() => {
    if (loading || !mapRef.current) return;
    initOrUpdateMap();
  }, [accounts, activeOrderMap, loading]);

  function initOrUpdateMap() {
    // Load Leaflet dynamically (already has CSS from index.html or CDN)
    if (typeof window === "undefined") return;
    const L = window.L;
    if (!L) return;

    const locatedAccounts = accounts.filter(a => a.current_lat && a.current_lng);
    const defaultCenter = locatedAccounts.length > 0
      ? [Number(locatedAccounts[0].current_lat), Number(locatedAccounts[0].current_lng)]
      : [11.0168, 76.9558]; // Coimbatore as fallback

    if (!leafletMapRef.current) {
      leafletMapRef.current = L.map(mapRef.current, { zoomControl: true }).setView(defaultCenter, 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(leafletMapRef.current);
    }

    // Clear old markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    locatedAccounts.forEach(account => {
      const state = driverState(account, activeOrderMap);
      const cfg = MARKER_CONFIG[state] || MARKER_CONFIG.offline;
      const order = activeOrderMap[account.account_id];

      const icon = L.divIcon({
        className: "",
        html: `<div class="dl-map-marker" style="background:${cfg.color};">${cfg.emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      const popup = `
        <div class="dl-map-popup">
          <strong>${account.full_name}</strong>
          <div class="dl-map-popup-state" style="color:${cfg.color}">${cfg.label}</div>
          <div>📱 ${account.phone_number}</div>
          <div>🚗 ${account.vehicle_type}${account.vehicle_number ? " · " + account.vehicle_number : ""}</div>
          ${account.cod_balance > 0 ? `<div class="dl-map-popup-cod ${account.cod_balance >= 1000 ? "warn" : ""}">💰 COD ₹${Number(account.cod_balance).toFixed(0)}</div>` : ""}
          ${order ? `<div>📦 ${order.source_name || "Order"} → ${order.customer_name || "Customer"}</div>` : ""}
        </div>`;

      const marker = L.marker(
        [Number(account.current_lat), Number(account.current_lng)],
        { icon }
      ).addTo(leafletMapRef.current).bindPopup(popup);

      marker.on("click", () => setSelected(account));
      markersRef.current[account.account_id] = marker;
    });
  }

  const counts = {};
  Object.values(MARKER_CONFIG).forEach(v => counts[v.label] = 0);
  accounts.forEach(a => {
    const state = driverState(a, activeOrderMap);
    const cfg = MARKER_CONFIG[state];
    if (cfg) counts[cfg.label] = (counts[cfg.label] || 0) + 1;
  });

  const online = accounts.filter(a => a.is_online && !a.cod_blocked).length;
  const blocked = accounts.filter(a => a.cod_blocked).length;
  const active = Object.keys(activeOrderMap).length;

  return (
    <DeliveryLayout>
      {/* Top KPI strip */}
      <div className="dl-map-kpis">
        <div className="dl-map-kpi"><span className="dl-kpi-val">{accounts.length}</span><span>Total Drivers</span></div>
        <div className="dl-map-kpi dl-kpi-green"><span className="dl-kpi-val">{online}</span><span>Online</span></div>
        <div className="dl-map-kpi dl-kpi-blue"><span className="dl-kpi-val">{active}</span><span>On Delivery</span></div>
        <div className="dl-map-kpi dl-kpi-red"><span className="dl-kpi-val">{blocked}</span><span>COD Blocked</span></div>
        <div className="dl-map-kpi-refresh">
          <button className="dl-admin-btn-icon" onClick={loadData} title="Refresh">
            <RefreshCw size={16} className={loading ? "dl-spin" : ""} />
          </button>
          {lastRefresh && <span className="dl-map-refresh-time">{lastRefresh.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Map + legend side-by-side */}
      <div className="dl-map-wrapper">
        <div ref={mapRef} className="dl-admin-map" />

        {/* Legend */}
        <div className="dl-map-legend">
          <div className="dl-legend-title"><Users size={14} /> Legend</div>
          {Object.entries(MARKER_CONFIG).map(([key, cfg]) => (
            <div key={key} className="dl-legend-row">
              <span className="dl-legend-dot" style={{ background: cfg.color }} />
              <span>{cfg.label}</span>
              <span className="dl-legend-count">{counts[cfg.label] || 0}</span>
            </div>
          ))}

          {/* Driver list panel */}
          <div className="dl-legend-divider" />
          <div className="dl-legend-title">Drivers with GPS</div>
          <div className="dl-map-driver-list">
            {accounts.filter(a => a.current_lat).map(a => {
              const st = driverState(a, activeOrderMap);
              const cfg = MARKER_CONFIG[st];
              return (
                <button
                  key={a.account_id}
                  className={`dl-map-driver-row ${selected?.account_id === a.account_id ? "dl-map-driver-selected" : ""}`}
                  onClick={() => {
                    setSelected(a);
                    if (leafletMapRef.current && markersRef.current[a.account_id]) {
                      leafletMapRef.current.setView(
                        [Number(a.current_lat), Number(a.current_lng)], 15
                      );
                      markersRef.current[a.account_id].openPopup();
                    }
                  }}
                >
                  <span className="dl-legend-dot" style={{ background: cfg?.color }} />
                  <span className="dl-map-driver-name">{a.full_name}</span>
                  {a.cod_balance >= 1000 && <span className="dl-cod-badge-sm">₹{Number(a.cod_balance).toFixed(0)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </DeliveryLayout>
  );
}
