import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BackButton } from "../components/BackButton.jsx";
import {
  adminGetHaircutShop,
  adminSetHaircutShopStatus,
  adminGetHaircutDayDetail,
  adminGetHaircutClosures,
  adminCreateHaircutClosure,
  adminDeleteHaircutClosure,
  adminGetHaircutShopServices,
  adminGetHaircutShopBookings,
} from "../lib/api.js";

function pad(n) { return String(n).padStart(2, "0"); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const STATUS_BADGE = {
  pending:   { bg: "#fff8ea", color: "#b45309" },
  active:    { bg: "#dff6e8", color: "#115e36" },
  suspended: { bg: "#fde8e4", color: "#8a1f11" },
};

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(/\/api\/v1$/, "");

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Older rows store a raw filesystem path (e.g. "storage/haircut/..."); newer ones
// store a proper "/media/..." URL. Handle both until existing data is backfilled.
function resolveDocUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/media")) return `${API_ORIGIN}${path}`;
  const clean = path.replace(/^storage\/?/, "");
  return `${API_ORIGIN}/media/${clean}`;
}

const BOOKING_STATUS_COLOR = {
  PENDING:   "#b45309",
  CONFIRMED: "#115e36",
  COMPLETED: "#1d4ed8",
  CANCELED:  "#52625f",
  NO_SHOW:   "#8a1f11",
};

function CalendarGrid({ year, month, closureDates, selectedDate, onSelect }) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "0.72rem", color: "#52625f", fontWeight: 700, padding: "4px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isClosed = closureDates.includes(dateStr);
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === todayStr;

          return (
            <button
              key={i}
              onClick={() => onSelect(dateStr)}
              style={{
                padding: "8px 4px",
                borderRadius: 8,
                border: isSelected ? "2px solid #0f766e" : isToday ? "2px solid #94a3a0" : "2px solid transparent",
                background: isClosed ? "#fde8e4" : isSelected ? "#d9f0ec" : "#f8fbfa",
                color: isClosed ? "#8a1f11" : isToday ? "#13201e" : "#52625f",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: isSelected || isToday ? 700 : 400,
                position: "relative",
              }}
            >
              {day}
              {isClosed && (
                <span style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", fontSize: "0.42rem", fontWeight: 800, letterSpacing: "-0.01em", color: "#8a1f11" }}>off</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HaircutShopDetailPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const [shop, setShop] = useState(null);
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState(false);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10));
  const [dayDetail, setDayDetail] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);

  // ── Mark offline ──
  const [showOfflineForm, setShowOfflineForm] = useState(false);
  const [offlineStart, setOfflineStart] = useState(todayStr());
  const [offlineEnd, setOfflineEnd] = useState("");
  const [offlineReason, setOfflineReason] = useState("");
  const [offlineSubmitting, setOfflineSubmitting] = useState(false);

  // ── Services tab ──
  const [services, setServices] = useState([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);

  // ── Quick offline today ──
  const [offlineToday, setOfflineToday] = useState(false);

  // ── Bookings tab (filterable) ──
  const [tab, setTab] = useState("calendar"); // calendar | services | bookings
  const [bookingStart, setBookingStart] = useState(todayStr());
  const [bookingEnd, setBookingEnd] = useState(todayStr());
  const [bookingStatus, setBookingStatus] = useState("");
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // Eagerly load services on mount for the summary bar
  useEffect(() => {
    adminGetHaircutShopServices(shopId)
      .then(rows => { setServices(rows); setServicesLoaded(true); })
      .catch(() => {});
  }, [shopId]);

  useEffect(() => {
    if (tab === "services" && !servicesLoaded) {
      adminGetHaircutShopServices(shopId).then(rows => { setServices(rows); setServicesLoaded(true); }).catch(err => setError(err.message));
    }
  }, [tab, shopId, servicesLoaded]);

  function loadBookings() {
    setBookingsLoading(true); setError("");
    adminGetHaircutShopBookings(shopId, { start_date: bookingStart, end_date: bookingEnd, status: bookingStatus })
      .then(setBookings)
      .catch(err => setError(err.message))
      .finally(() => setBookingsLoading(false));
  }

  useEffect(() => {
    if (tab === "bookings") loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function submitMarkOffline() {
    setOfflineSubmitting(true); setError("");
    try {
      await adminCreateHaircutClosure(shopId, { start_date: offlineStart, end_date: offlineEnd || null, reason: offlineReason.trim() || null });
      const refreshed = await adminGetHaircutClosures(shopId);
      setClosures(refreshed);
      setShowOfflineForm(false);
      setOfflineEnd(""); setOfflineReason("");
    } catch (err) { setError(err.message); }
    finally { setOfflineSubmitting(false); }
  }

  async function removeClosure(closureDate) {
    if (!confirm(`Remove the offline marking for ${closureDate}?`)) return;
    try {
      await adminDeleteHaircutClosure(shopId, closureDate);
      setClosures(c => c.filter(x => x.closure_date !== closureDate));
    } catch (err) { setError(err.message); }
  }

  useEffect(() => {
    Promise.all([adminGetHaircutShop(shopId), adminGetHaircutClosures(shopId)])
      .then(([s, c]) => { setShop(s); setClosures(c); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [shopId]);

  useEffect(() => {
    if (!selectedDate) return;
    setDayLoading(true);
    setDayDetail(null);
    adminGetHaircutDayDetail(shopId, selectedDate)
      .then(setDayDetail)
      .catch(err => setError(err.message))
      .finally(() => setDayLoading(false));
  }, [shopId, selectedDate]);

  async function handleStatus(newStatus) {
    if (!confirm(`Set shop to "${newStatus}"?`)) return;
    setActioning(true);
    try {
      const updated = await adminSetHaircutShopStatus(shopId, newStatus);
      setShop(updated);
    } catch (err) { setError(err.message); }
    finally { setActioning(false); }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  const closureDatesInMonth = closures
    .map(c => c.closure_date)
    .filter(d => {
      const [y, m] = d.split("-");
      return Number(y) === calYear && Number(m) - 1 === calMonth;
    });

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#52625f" }}>Loading…</div>;
  if (!shop) return <div style={{ padding: 40, color: "#b91c1c" }}>{error || "Shop not found."}</div>;

  const badge = STATUS_BADGE[shop.shop_status] || { bg: "#eef3f1", color: "#52625f" };

  function DocLink({ label, url }) {
    const resolved = resolveDocUrl(url);
    if (!resolved) return null;
    return (
      <a href={resolved} target="_blank" rel="noopener noreferrer"
        style={{ color: "#0f766e", fontSize: "0.82rem", textDecoration: "underline", display: "inline-block", marginRight: 16 }}>
        {label} ↗
      </a>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <BackButton to="/haircut/shops" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "#13201e" }}>✂️ {shop.shop_name}</h1>
            <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, padding: "3px 10px", fontSize: "0.75rem", fontWeight: 700 }}>
              {shop.shop_status}
            </span>
          </div>
          <div style={{ fontSize: "0.83rem", color: "#52625f", marginTop: 4 }}>
            {shop.address_line || "No address"}{shop.pin_code ? ` — ${shop.pin_code}` : ""} · {shop.total_chairs} chair{shop.total_chairs !== 1 ? "s" : ""}
            {shop.phone && ` · ${shop.phone}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {shop.shop_status !== "active" && (
            <button onClick={() => handleStatus("active")} disabled={actioning}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#dff6e8", color: "#115e36", fontWeight: 700, cursor: "pointer" }}>
              Activate
            </button>
          )}
          {shop.shop_status === "active" && (
            <button onClick={() => handleStatus("suspended")} disabled={actioning}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#fde8e4", color: "#8a1f11", fontWeight: 700, cursor: "pointer" }}>
              Suspend
            </button>
          )}
          {shop.shop_status === "suspended" && (
            <button onClick={() => handleStatus("pending")} disabled={actioning}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #c9d8d4", background: "transparent", color: "#52625f", fontWeight: 700, cursor: "pointer" }}>
              Reset to Pending
            </button>
          )}
          <button onClick={async () => {
            if (!confirm(`Mark "${shop.shop_name}" offline for today (${todayStr()})? All pending bookings today will be cancelled and refunded.`)) return;
            setOfflineToday(true);
            try {
              await adminCreateHaircutClosure(shopId, { start_date: todayStr(), end_date: null, reason: "Admin: offline for today" });
              const refreshed = await adminGetHaircutClosures(shopId);
              setClosures(refreshed);
              const dd = await adminGetHaircutDayDetail(shopId, selectedDate);
              setDayDetail(dd);
            } catch (err) { setError(err.message); }
            finally { setOfflineToday(false); }
          }} disabled={offlineToday}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#fde8e4", color: "#8a1f11", fontWeight: 700, cursor: "pointer" }}>
            {offlineToday ? "Marking…" : "⚡ Offline Today"}
          </button>
          <button onClick={() => setShowOfflineForm(v => !v)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #c9d8d4", background: "transparent", color: "#13201e", fontWeight: 700, cursor: "pointer" }}>
            📅 Mark Offline (Range)
          </button>
        </div>
      </div>

      {showOfflineForm && (
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 18, marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700, color: "#13201e", fontSize: "0.9rem" }}>Take this shop offline ("Shop off")</div>
          <div style={{ fontSize: "0.78rem", color: "#52625f" }}>
            Leave end date blank to take it offline for just the start date (e.g. "rest of today"). Any pending/confirmed bookings on the affected dates are cancelled and refunded.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#52625f" }}>
              From
              <input type="date" value={offlineStart} onChange={e => setOfflineStart(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#52625f" }}>
              To (optional)
              <input type="date" value={offlineEnd} onChange={e => setOfflineEnd(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#52625f", flex: 1, minWidth: 180 }}>
              Reason (optional)
              <input type="text" value={offlineReason} onChange={e => setOfflineReason(e.target.value)} placeholder="e.g. Vendor unreachable" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4" }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitMarkOffline} disabled={offlineSubmitting}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#fde8e4", color: "#8a1f11", fontWeight: 700, cursor: "pointer" }}>
              {offlineSubmitting ? "Marking…" : "Confirm Offline"}
            </button>
            <button onClick={() => setShowOfflineForm(false)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #c9d8d4", background: "transparent", color: "#52625f", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div className="sa-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Owner / vendor info panel */}
      {(shop.owner_name || shop.licence_url || shop.owner_id_url || shop.shop_image_url) && (
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: "0.72rem", color: "#52625f", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 12 }}>
            Owner / Vendor Info
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
            {shop.owner_name && (
              <div>
                <div style={{ fontSize: "0.72rem", color: "#94a3a0", marginBottom: 2 }}>Owner Name</div>
                <div style={{ fontWeight: 600, color: "#13201e" }}>{shop.owner_name}</div>
              </div>
            )}
            {shop.owner_phone && (
              <div>
                <div style={{ fontSize: "0.72rem", color: "#94a3a0", marginBottom: 2 }}>Phone</div>
                <div style={{ fontWeight: 600, color: "#13201e" }}>{shop.owner_phone}</div>
              </div>
            )}
            {shop.account_status && (
              <div>
                <div style={{ fontSize: "0.72rem", color: "#94a3a0", marginBottom: 2 }}>Account Status</div>
                <div style={{ fontWeight: 700, color: shop.account_status === "active" ? "#115e36" : shop.account_status === "rejected" ? "#8a1f11" : "#b45309" }}>
                  {shop.account_status.toUpperCase()}
                </div>
              </div>
            )}
            {shop.owner_address && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: "0.72rem", color: "#94a3a0", marginBottom: 2 }}>Owner Address</div>
                <div style={{ fontSize: "0.88rem", color: "#52625f" }}>{shop.owner_address}</div>
              </div>
            )}
          </div>
          {(shop.shop_image_url || shop.licence_url || shop.owner_id_url) && (
            <div style={{ paddingTop: 12, borderTop: "1px solid #dce6e3" }}>
              <DocLink label="🏪 Shop Photo" url={shop.shop_image_url} />
              <DocLink label="📄 Shop Licence" url={shop.licence_url} />
              <DocLink label="🪪 Owner ID / Aadhaar" url={shop.owner_id_url} />
              {/* EXIF metadata from store photo */}
              {(() => {
                const hasExif = shop.photo_lat != null && shop.photo_lng != null;
                const hasRegistered = shop.lat != null && shop.lng != null;
                if (!hasExif) return (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "#f8f4ec", borderRadius: 8, fontSize: "0.76rem", color: "#92713a" }}>
                    📷 No EXIF GPS data in shop photo
                  </div>
                );
                let distBadge = null;
                if (hasRegistered) {
                  const km = haversineKm(shop.lat, shop.lng, shop.photo_lat, shop.photo_lng);
                  const distText = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
                  const isFar = km > 1;
                  distBadge = (
                    <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 100, fontSize: "0.74rem", fontWeight: 700, background: isFar ? "#fde8e4" : "#dff6e8", color: isFar ? "#8a1f11" : "#115e36" }}>
                      {isFar ? "⚠ " : "✓ "}{distText} from shop pin
                    </span>
                  );
                }
                const takenAt = shop.photo_taken_at
                  ? new Date(shop.photo_taken_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                  : null;
                return (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "#f0f7f4", borderRadius: 8, fontSize: "0.76rem", color: "#2d5a4e" }}>
                    <div>📷 Photo GPS: {shop.photo_lat.toFixed(5)}, {shop.photo_lng.toFixed(5)}{distBadge}</div>
                    {takenAt && <div style={{ marginTop: 2, color: "#52625f" }}>🕐 Taken: {takenAt}</div>}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Birds-eye summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          {
            label: "Services",
            value: servicesLoaded ? `${services.filter(s => s.is_enabled).length} / ${services.length}` : "—",
            sub: "enabled / total",
            color: "#0f766e",
          },
          {
            label: "Today — Bookings",
            value: dayDetail ? dayDetail.total_bookings : "—",
            sub: `${dayDetail ? dayDetail.completed : 0} done · ${dayDetail ? dayDetail.pending_confirmed : 0} pending`,
            color: "#13201e",
          },
          {
            label: "Today — No-shows",
            value: dayDetail ? dayDetail.no_shows : "—",
            sub: `${dayDetail ? dayDetail.cancelled : 0} cancelled`,
            color: dayDetail && dayDetail.no_shows > 0 ? "#8a1f11" : "#52625f",
          },
          {
            label: "Shop off (total)",
            value: closures.length,
            sub: "marked days",
            color: closures.length > 0 ? "#b45309" : "#52625f",
          },
        ].map(s => (
          <div key={s.label} style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: "0.68rem", color: "#94a3a0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: "0.7rem", color: "#94a3a0", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #dce6e3" }}>
        {[
          { key: "calendar", label: "Calendar" },
          { key: "services", label: "Services" },
          { key: "bookings", label: "Bookings" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 22px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.88rem",
            background: "transparent",
            color: tab === t.key ? "#0f766e" : "#52625f",
            borderBottom: tab === t.key ? "2px solid #0f766e" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>
        {/* Calendar */}
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 20 }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", color: "#52625f", cursor: "pointer", fontSize: "1.2rem" }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#13201e" }}>{MONTH_NAMES[calMonth]} {calYear}</span>
            <button onClick={nextMonth} style={{ background: "none", border: "none", color: "#52625f", cursor: "pointer", fontSize: "1.2rem" }}>›</button>
          </div>

          <CalendarGrid
            year={calYear}
            month={calMonth}
            closureDates={closureDatesInMonth}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />

          <div style={{ marginTop: 14, display: "flex", gap: 16, fontSize: "0.75rem", color: "#52625f" }}>
            <span style={{ color: "#8a1f11", fontWeight: 700 }}>■ = Shop off</span>
            <span style={{ color: "#0f766e" }}>■ = Selected</span>
          </div>
        </div>

        {/* Day detail */}
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: "1rem", color: "#13201e" }}>
            {selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Select a date"}
          </div>

          {dayLoading && <div style={{ color: "#52625f" }}>Loading…</div>}

          {!dayLoading && dayDetail && (
            <>
              {dayDetail.is_closed && (
                <div style={{ background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#8a1f11", fontSize: "0.88rem" }}>
                  🏖 Holiday — {dayDetail.closure_reason || "No reason given"}
                </div>
              )}

              {/* Summary counts */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Total", value: dayDetail.total_bookings, color: "#13201e" },
                  { label: "Done", value: dayDetail.completed, color: "#115e36" },
                  { label: "Cancelled", value: dayDetail.cancelled, color: "#52625f" },
                  { label: "No-show", value: dayDetail.no_shows, color: "#8a1f11" },
                ].map(s => (
                  <div key={s.label} style={{ background: "#f8fbfa", border: "1px solid #eef3f1", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.3rem", fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: "0.72rem", color: "#52625f", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Bookings list */}
              {dayDetail.bookings.length === 0 ? (
                <div style={{ color: "#94a3a0", textAlign: "center", padding: 24 }}>No bookings on this day.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {dayDetail.bookings.map(b => (
                    <div key={b.booking_id} style={{ background: "#f8fbfa", border: "1px solid #eef3f1", borderRadius: 10, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ fontWeight: 700, fontSize: "1rem", minWidth: 48, color: "#13201e" }}>
                        {b.start_time.slice(0, 5)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.85rem", color: "#52625f" }}>{b.services.join(", ")}</div>
                        <div style={{ fontSize: "0.78rem", color: "#94a3a0", marginTop: 2 }}>{b.total_duration_minutes} min</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: "#15803d", fontSize: "0.9rem" }}>₹{b.total_fee}</div>
                        <span style={{
                          fontSize: "0.72rem", fontWeight: 700,
                          color: BOOKING_STATUS_COLOR[b.status] || "#52625f",
                        }}>
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* All closures list */}
      {closures.length > 0 && (
        <div style={{ marginTop: 20, background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, color: "#52625f", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            All "Shop off" Days ({closures.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {closures.map(c => (
              <div
                key={c.closure_id}
                style={{ background: "#f8fbfa", border: "1px solid #eef3f1", borderRadius: 8, padding: "6px 12px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  onClick={() => {
                    const [y, m] = c.closure_date.split("-");
                    setCalYear(Number(y)); setCalMonth(Number(m) - 1);
                    setSelectedDate(c.closure_date);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <span style={{ color: "#8a1f11", fontWeight: 700 }}>{c.closure_date}</span>
                  {c.reason && <span style={{ color: "#52625f", marginLeft: 6 }}>{c.reason}</span>}
                </span>
                <button onClick={() => removeClosure(c.closure_date)} aria-label="Remove offline marking"
                  style={{ background: "none", border: "none", color: "#94a3a0", cursor: "pointer", fontSize: "0.85rem", lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {tab === "services" && (
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, color: "#13201e", fontSize: "1rem" }}>Services ({services.length})</div>
          {services.length === 0 ? (
            <div style={{ color: "#94a3a0", textAlign: "center", padding: 24 }}>No services configured yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {services.map(s => (
                <div key={s.service_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fbfa", border: "1px solid #eef3f1", borderRadius: 10, padding: "10px 14px" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#13201e" }}>{s.service_name}</div>
                    <div style={{ fontSize: "0.78rem", color: "#94a3a0" }}>{s.duration_minutes} min</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, color: "#15803d" }}>₹{s.fee}</span>
                    <span style={{
                      fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 100,
                      background: s.is_enabled ? "#dff6e8" : "#eef3f1", color: s.is_enabled ? "#115e36" : "#52625f",
                    }}>
                      {s.is_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#52625f" }}>
              From
              <input type="date" value={bookingStart} onChange={e => setBookingStart(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#52625f" }}>
              To
              <input type="date" value={bookingEnd} onChange={e => setBookingEnd(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#52625f" }}>
              Status
              <select value={bookingStatus} onChange={e => setBookingStatus(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4" }}>
                <option value="">All</option>
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELED">Cancelled</option>
                <option value="NO_SHOW">No-show</option>
              </select>
            </label>
            <button onClick={loadBookings} disabled={bookingsLoading}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              {bookingsLoading ? "Loading…" : "Apply Filter"}
            </button>
          </div>

          {bookingsLoading ? (
            <div style={{ color: "#52625f", textAlign: "center", padding: 24 }}>Loading…</div>
          ) : bookings.length === 0 ? (
            <div style={{ color: "#94a3a0", textAlign: "center", padding: 24 }}>No bookings match this filter.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bookings.map(b => (
                <div key={b.booking_id} style={{ background: "#f8fbfa", border: "1px solid #eef3f1", borderRadius: 10, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 110 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#13201e" }}>{b.appointment_date}</div>
                    <div style={{ fontSize: "0.82rem", color: "#52625f" }}>{b.start_time.slice(0, 5)}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.85rem", color: "#52625f" }}>{b.services.length > 0 ? b.services.join(", ") : "Chair booking (no services picked)"}</div>
                    <div style={{ fontSize: "0.78rem", color: "#94a3a0", marginTop: 2 }}>{b.total_duration_minutes} min</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {b.total_fee > 0 && <div style={{ fontWeight: 700, color: "#15803d", fontSize: "0.9rem" }}>₹{b.total_fee}</div>}
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: BOOKING_STATUS_COLOR[b.status] || "#52625f" }}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
