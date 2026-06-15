/**
 * Navigation page — shows Leaflet map with route
 * Current location → Pharmacy (pickup) → Customer (dropoff)
 * "Open in Google Maps" button for turn-by-turn navigation
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Navigation, MapPin, ExternalLink } from "lucide-react";
import { getDeliveryOrders, updateDeliveryLocation } from "../lib/api.js";

export function NavigationPage() {
  const { deliveryOrderId } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const [order, setOrder] = useState(null);
  const [myPos, setMyPos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadOrder();
  }, [deliveryOrderId]);

  async function loadOrder() {
    try {
      const orders = await getDeliveryOrders();
      const found = orders.find((o) => o.delivery_order_id === deliveryOrderId);
      if (found) setOrder(found);
    } catch (e) { setError(e.message); }
  }

  // 15-second GPS heartbeat — runs while this page is open
  useEffect(() => {
    if (!navigator.geolocation) return;

    function sendPosition(pos) {
      const { latitude, longitude } = pos.coords;
      setMyPos({ lat: latitude, lng: longitude });
      updateDeliveryLocation(latitude, longitude).catch(() => {});
    }

    // Immediate first ping
    navigator.geolocation.getCurrentPosition(sendPosition, () => {}, { enableHighAccuracy: true });

    // Then every 15 seconds
    const watchId = navigator.geolocation.watchPosition(sendPosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 14000,
    });

    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(sendPosition, () => {}, { enableHighAccuracy: true });
    }, 15000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalId);
    };
  }, []);

  // Init Leaflet map when order + myPos are ready
  useEffect(() => {
    if (!order || !mapRef.current) return;
    if (leafletMapRef.current) return; // already init

    import("leaflet").then((L) => {
      const pickupLat = order.pickup_lat || 13.0827; // default Chennai
      const pickupLng = order.pickup_lng || 80.2707;
      const dropoffLat = order.dropoff_lat || 13.09;
      const dropoffLng = order.dropoff_lng || 80.28;
      const myLat = myPos?.lat || pickupLat;
      const myLng = myPos?.lng || pickupLng;

      const map = L.default.map(mapRef.current, { zoomControl: true }).setView([myLat, myLng], 13);

      L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      // Icons
      const bikeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36"><ellipse cx="18" cy="17" rx="5" ry="6" fill="#3b82f6"/><circle cx="18" cy="9" r="4" fill="#3b82f6"/><path d="M14.5 8.5 Q18 6.5 21.5 8.5 Q21.5 11 18 11 Q14.5 11 14.5 8.5Z" fill="rgba(0,0,0,0.25)"/><circle cx="9" cy="26" r="5" fill="none" stroke="#3b82f6" stroke-width="2.5"/><circle cx="9" cy="26" r="1.5" fill="#3b82f6"/><circle cx="27" cy="26" r="5" fill="none" stroke="#3b82f6" stroke-width="2.5"/><circle cx="27" cy="26" r="1.5" fill="#3b82f6"/><line x1="9" y1="26" x2="18" y2="18" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/><line x1="27" y1="26" x2="18" y2="18" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="26" x2="27" y2="26" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round"/><line x1="24" y1="19" x2="29" y2="17" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="18" r="17" fill="none" stroke="#fff" stroke-width="2" opacity="0.8"/></svg>`;
      const myIcon = L.default.divIcon({ className: "", html: `<div style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));width:36px;height:36px">${bikeSvg}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
      const pickupIcon = L.default.divIcon({ className: "", html: '<div class="dl-map-marker dl-marker-pickup">🏪</div>', iconSize: [32, 32], iconAnchor: [16, 32] });
      const dropIcon = L.default.divIcon({ className: "", html: '<div class="dl-map-marker dl-marker-drop">🏠</div>', iconSize: [32, 32], iconAnchor: [16, 32] });

      L.default.marker([myLat, myLng], { icon: myIcon }).addTo(map).bindPopup("You are here");
      L.default.marker([pickupLat, pickupLng], { icon: pickupIcon }).addTo(map).bindPopup(`Pickup: ${order.source_name || "Pharmacy"}`);
      L.default.marker([dropoffLat, dropoffLng], { icon: dropIcon }).addTo(map).bindPopup(`Drop-off: ${order.customer_name || "Customer"}`);

      // Route polyline (straight lines — replace with OSRM/ORS for real routing)
      const routeCoords = [[myLat, myLng], [pickupLat, pickupLng], [dropoffLat, dropoffLng]];
      L.default.polyline(routeCoords, { color: "#0f766e", weight: 4, opacity: 0.8, dashArray: "8 4" }).addTo(map);

      // Fit bounds
      const bounds = L.default.latLngBounds(routeCoords);
      map.fitBounds(bounds, { padding: [40, 40] });

      leafletMapRef.current = map;
    });
  }, [order, myPos]);

  function openGoogleMaps() {
    if (!order) return;
    const pickupLat = order.pickup_lat || "";
    const pickupLng = order.pickup_lng || "";
    const dropLat = order.dropoff_lat || "";
    const dropLng = order.dropoff_lng || "";
    const myLat = myPos?.lat || "";
    const myLng = myPos?.lng || "";
    // Waypoints: origin → pharmacy → customer
    const url = `https://www.google.com/maps/dir/?api=1&origin=${myLat},${myLng}&destination=${dropLat},${dropLng}&waypoints=${pickupLat},${pickupLng}&travelmode=driving`;
    window.open(url, "_blank");
  }

  return (
    <div className="dl-page dl-nav-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h1>Navigation</h1>
        <button type="button" className="dl-icon-btn" onClick={openGoogleMaps} title="Open Google Maps">
          <ExternalLink size={20} />
        </button>
      </header>

      {error ? <div className="dl-error">{error}</div> : null}

      {/* Route legend */}
      <div className="dl-route-legend">
        <div className="dl-legend-item"><span>📍</span><span>You</span></div>
        <div className="dl-legend-arrow">→</div>
        <div className="dl-legend-item"><span>🏪</span><span>{order?.source_name || "Pharmacy"}</span></div>
        <div className="dl-legend-arrow">→</div>
        <div className="dl-legend-item"><span>🏠</span><span>{order?.customer_name || "Customer"}</span></div>
        {order?.distance_km ? (
          <div className="dl-legend-dist"><Navigation size={14} /> {Number(order.distance_km).toFixed(1)} km total</div>
        ) : null}
      </div>

      {/* Map */}
      <div ref={mapRef} className="dl-map" />

      <button className="dl-btn dl-btn-gmaps" type="button" onClick={openGoogleMaps}>
        <ExternalLink size={16} /> Open in Google Maps (Turn-by-turn)
      </button>
    </div>
  );
}
