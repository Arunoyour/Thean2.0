import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { haircutShopServices, haircutShopAvailability, haircutCreateBooking, haircutShopHours, haircutShopClosures } from "../lib/api.js";

function pad(n) { return String(n).padStart(2, "0"); }

function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function HaircutBookingPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [selectedDate, setSelectedDate] = useState(dateStr(addDays(new Date(), 1)));
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(null);
  const [weeklyOpenDays, setWeeklyOpenDays] = useState(null); // Set of schema day-of-week (0=Sun…6=Sat) that are open, or null = not loaded yet
  const [closureDates, setClosureDates] = useState(new Set());

  useEffect(() => {
    haircutShopServices(shopId).then(setServices).catch(() => {});
    haircutShopHours(shopId)
      .then(rows => {
        // No hours configured yet → backend defaults to open 10am–7pm every day.
        if (rows.length === 0) { setWeeklyOpenDays(new Set([0, 1, 2, 3, 4, 5, 6])); return; }
        setWeeklyOpenDays(new Set(rows.filter(r => r.is_open).map(r => r.day_of_week)));
      })
      .catch(() => setWeeklyOpenDays(new Set([0, 1, 2, 3, 4, 5, 6]))); // assume open every day if hours unavailable
    haircutShopClosures(shopId)
      .then(rows => setClosureDates(new Set(rows.map(r => r.closure_date))))
      .catch(() => {});
  }, [shopId]);

  useEffect(() => {
    setLoadingSlots(true); setSlots([]); setSelectedSlot(null); setAvailability(null); setError("");
    haircutShopAvailability(shopId, selectedDate)
      .then(data => { setAvailability(data); setSlots(data.slots || []); })
      .catch(err => setError(err.message))
      .finally(() => setLoadingSlots(false));
  }, [shopId, selectedDate]);

  const dateOptions = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i + 1));

  // If the currently selected date turns out to be closed, auto-advance to the first open one.
  useEffect(() => {
    if (!weeklyOpenDays) return;
    const isClosed = d => !weeklyOpenDays.has(d.getDay()) || closureDates.has(dateStr(d));
    const current = dateOptions.find(d => dateStr(d) === selectedDate);
    if (current && isClosed(current)) {
      const nextOpen = dateOptions.find(d => !isClosed(d));
      if (nextOpen) setSelectedDate(dateStr(nextOpen));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyOpenDays, closureDates]);

  async function handleConfirm() {
    if (!selectedSlot) return;
    setError(""); setSubmitting(true);
    try {
      const result = await haircutCreateBooking({
        shop_id: shopId,
        appointment_date: selectedDate,
        start_time: selectedSlot,
      });
      setBooking(result);
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  // ── Done ──
  if (booking) {
    return (
      <div style={{ minHeight: "100dvh", background: "#f6f8f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#dff6e8", border: "1px solid #bfe8cf", borderRadius: 20, padding: 32, textAlign: "center", maxWidth: 380, width: "100%" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>✅</div>
          <h2 style={{ color: "#115e36", fontWeight: 800, marginBottom: 8 }}>Chair Booked!</h2>
          <div style={{ color: "#15803d", fontSize: "0.9rem", marginBottom: 20 }}>
            {selectedDate} at {selectedSlot?.slice(0, 5)}
          </div>
          <div style={{ background: "#ffffff", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: "0.78rem", color: "#52625f", marginBottom: 4 }}>Your OTP</div>
            <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "#13201e", letterSpacing: 8 }}>{booking.otp_code}</div>
            <div style={{ fontSize: "0.78rem", color: "#52625f", marginTop: 4 }}>Show this to the barber at check-in. Pay for services at the shop.</div>
          </div>
          <button
            onClick={() => navigate("/haircut/booking")}
            style={{ width: "100%", padding: "13px 20px", borderRadius: 10, border: "none", background: "#15803d", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            View My Booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", paddingBottom: 32 }}>
      <div style={{ position: "sticky", top: 0, background: "#ffffff", borderBottom: "1px solid #dce6e3", padding: "14px 16px", zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#52625f", fontSize: "1.3rem", cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: "1.05rem", color: "#13201e" }}>Book a Chair</h1>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {error && (
          <div style={{ background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 10, padding: "12px 16px", color: "#8a1f11", fontSize: "0.88rem" }}>
            {error}
          </div>
        )}

        {/* Services — informational only, not selectable */}
        {services.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, color: "#13201e", marginBottom: 8, fontSize: "0.9rem" }}>Services &amp; Rates</div>
            <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 12, overflow: "hidden" }}>
              {services.map((svc, i) => (
                <div
                  key={svc.service_id}
                  style={{
                    display: "flex", justifyContent: "space-between", padding: "10px 14px",
                    borderBottom: i < services.length - 1 ? "1px solid #eef3f1" : "none",
                  }}
                >
                  <span style={{ color: "#13201e", fontSize: "0.88rem" }}>{svc.service_name} <span style={{ color: "#94a3a0" }}>({svc.duration_minutes}m)</span></span>
                  <span style={{ color: "#15803d", fontWeight: 600 }}>₹{svc.fee}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "0.78rem", color: "#94a3a0", marginTop: 6 }}>For reference only — pay at the shop, no need to pick services now.</div>
          </div>
        )}

        {/* Date + time — single combined picker */}
        <div>
          <div style={{ fontWeight: 700, color: "#13201e", marginBottom: 8, fontSize: "0.9rem" }}>Pick a Date</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {dateOptions.map(d => {
              const ds = dateStr(d);
              const selected = ds === selectedDate;
              // JS Date.getDay() is already Sun=0…Sat=6, matching the backend's schema day-of-week.
              const isClosedDay = (weeklyOpenDays && !weeklyOpenDays.has(d.getDay())) || closureDates.has(ds);
              return (
                <button
                  key={ds}
                  onClick={() => !isClosedDay && setSelectedDate(ds)}
                  disabled={isClosedDay}
                  style={{
                    flexShrink: 0, padding: "10px 14px", borderRadius: 10, fontSize: "0.82rem",
                    cursor: isClosedDay ? "not-allowed" : "pointer",
                    background: isClosedDay ? "#eef3f1" : selected ? "#d9f0ec" : "#ffffff",
                    border: `1.5px solid ${isClosedDay ? "#eef3f1" : selected ? "#0f766e" : "#dce6e3"}`,
                    color: isClosedDay ? "#94a3a0" : "#13201e", fontWeight: selected ? 700 : 400,
                    textAlign: "center",
                  }}
                >
                  {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                  {isClosedDay && <div style={{ fontSize: "0.62rem", marginTop: 2 }}>Shop off</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, color: "#13201e", marginBottom: 8, fontSize: "0.9rem" }}>Pick a Time</div>

          {loadingSlots && <div style={{ color: "#52625f", textAlign: "center", padding: 24 }}>Checking availability…</div>}

          {!loadingSlots && availability && !availability.is_open && (
            <div style={{ background: "#fde8e4", borderRadius: 12, padding: "14px 16px", color: "#8a1f11", fontSize: "0.85rem" }}>
              {availability.is_closed_for_holiday ? "🏖 Shop is closed (holiday)." : "Shop is closed on this day."} Please pick another date.
            </div>
          )}

          {!loadingSlots && availability?.is_open && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {slots.map(slot => {
                const selected = selectedSlot === slot.start_time;
                return (
                  <button
                    key={slot.start_time}
                    disabled={!slot.is_available}
                    onClick={() => setSelectedSlot(slot.start_time)}
                    style={{
                      padding: "10px 6px", borderRadius: 10, cursor: slot.is_available ? "pointer" : "not-allowed",
                      background: !slot.is_available ? "#eef3f1" : selected ? "#0f766e" : "#ffffff",
                      color: !slot.is_available ? "#94a3a0" : selected ? "#ffffff" : "#13201e",
                      fontWeight: selected ? 700 : 400, fontSize: "0.85rem",
                      border: selected ? "2px solid #0f766e" : "2px solid #dce6e3",
                    }}
                  >
                    {slot.start_time.slice(0, 5)}
                    {!slot.is_available && <div style={{ fontSize: "0.6rem", color: "#94a3a0" }}>Full</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ background: "#e0f2fe", border: "1px solid #bae0fd", borderRadius: 12, padding: "12px 16px", fontSize: "0.85rem", color: "#075985" }}>
          ℹ️ 1 booking token will be held for this chair. It's refunded when the visit is completed or cancelled ≥1 hr before.
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selectedSlot || submitting}
          style={{
            width: "100%", padding: "15px 20px", borderRadius: 12, border: "none", fontWeight: 700, fontSize: "1rem",
            background: !selectedSlot ? "#94a3a0" : "#0f766e", color: "#fff",
            cursor: !selectedSlot || submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Booking…" : selectedSlot ? `Confirm Chair — ${selectedDate.slice(5)} at ${selectedSlot.slice(0, 5)}` : "Pick a time to continue"}
        </button>
      </div>
    </div>
  );
}
