import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { haircutActiveBooking, haircutCancelBooking, haircutManualCheckin, haircutRescheduleBooking, haircutShopAvailability } from "../lib/api.js";
import { HaircutSubNav } from "../components/HaircutSubNav.jsx";

function pad(n) { return String(n).padStart(2, "0"); }
function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function ReschedulePanel({ booking, onClose, onDone }) {
  const [selectedDate, setSelectedDate] = useState(dateStr(addDays(new Date(), 1)));
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dateOptions = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i + 1));

  useEffect(() => {
    setLoading(true); setSlots([]); setSelectedSlot(null); setError("");
    haircutShopAvailability(booking.shop_id, selectedDate)
      .then(data => setSlots(data.is_open ? data.slots : []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedDate, booking.shop_id]);

  async function confirm() {
    setSubmitting(true); setError("");
    try {
      const updated = await haircutRescheduleBooking(booking.booking_id, selectedDate, selectedSlot);
      onDone(updated);
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, color: "#13201e" }}>Reschedule Booking</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#52625f", cursor: "pointer", fontSize: "1rem" }}>✕</button>
      </div>
      {error && <div style={{ background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 10, padding: "10px 14px", color: "#8a1f11", fontSize: "0.85rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {dateOptions.map(d => {
          const ds = dateStr(d);
          const selected = ds === selectedDate;
          return (
            <button
              key={ds}
              onClick={() => setSelectedDate(ds)}
              style={{
                flexShrink: 0, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontSize: "0.78rem",
                background: selected ? "#d9f0ec" : "#f8fbfa",
                border: `1.5px solid ${selected ? "#0f766e" : "#eef3f1"}`,
                color: "#13201e", fontWeight: selected ? 700 : 400,
              }}
            >
              {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </button>
          );
        })}
      </div>
      {loading ? (
        <div style={{ color: "#52625f", textAlign: "center", padding: 16 }}>Checking availability…</div>
      ) : slots.length === 0 ? (
        <div style={{ color: "#94a3a0", textAlign: "center", padding: 16, fontSize: "0.85rem" }}>Shop closed on this day.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {slots.map(slot => {
            const selected = selectedSlot === slot.start_time;
            return (
              <button
                key={slot.start_time}
                disabled={!slot.is_available}
                onClick={() => setSelectedSlot(slot.start_time)}
                style={{
                  padding: "10px 8px", borderRadius: 10, cursor: slot.is_available ? "pointer" : "not-allowed",
                  background: !slot.is_available ? "#eef3f1" : selected ? "#0f766e" : "#ffffff",
                  color: !slot.is_available ? "#94a3a0" : selected ? "#ffffff" : "#13201e",
                  fontWeight: selected ? 700 : 400, fontSize: "0.85rem",
                  border: selected ? "2px solid #0f766e" : "2px solid #dce6e3",
                }}
              >
                {slot.start_time.slice(0, 5)}
              </button>
            );
          })}
        </div>
      )}
      {selectedSlot && (
        <button
          onClick={confirm}
          disabled={submitting}
          style={{ width: "100%", padding: "13px 20px", borderRadius: 12, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          {submitting ? "Rescheduling…" : "Confirm New Time"}
        </button>
      )}
    </div>
  );
}

const STATUS_LABEL = {
  PENDING: { color: "#b45309", bg: "#fff8ea", label: "Upcoming" },
  CONFIRMED: { color: "#115e36", bg: "#dff6e8", label: "Confirmed" },
  COMPLETED: { color: "#075985", bg: "#e0f2fe", label: "Completed" },
  CANCELED: { color: "#52625f", bg: "#eef3f1", label: "Cancelled" },
  NO_SHOW: { color: "#8a1f11", bg: "#fde8e4", label: "No-show" },
};

export function HaircutActiveBookingPage() {
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try { setBooking(await haircutActiveBooking()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCancel() {
    if (!confirm("Cancel this booking? This cannot be undone.")) return;
    setCancelling(true); setError("");
    try {
      await haircutCancelBooking(booking.booking_id, null);
      setCheckinMsg("Booking cancelled. Your token has been refunded.");
      setBooking(null);
    } catch (err) { setError(err.message); }
    finally { setCancelling(false); }
  }

  async function handleManualCheckin() {
    setCheckingIn(true); setError(""); setCheckinMsg("");
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setCheckingIn(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await haircutManualCheckin(booking.booking_id, pos.coords.latitude, pos.coords.longitude);
          setCheckinMsg("✅ Check-in request sent! Waiting for vendor to approve.");
          await load();
        } catch (err) {
          // The backend returns a clear message when the user is too far away
          setError(err.message);
        } finally { setCheckingIn(false); }
      },
      () => {
        setError("Location access denied. Please allow location to use manual check-in.");
        setCheckingIn(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  if (loading) return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", display: "flex", alignItems: "center", justifyContent: "center", color: "#52625f" }}>
      Loading…
    </div>
  );

  const apptDt = booking ? new Date(`${booking.appointment_date}T${booking.start_time}`) : null;
  const now = new Date();
  const minutesToAppt = apptDt ? (apptDt - now) / 60000 : null;
  const canCancel = booking && ["PENDING", "CONFIRMED"].includes(booking.status) && minutesToAppt > 60;
  const canReschedule = canCancel && (booking?.reschedule_count ?? 0) < 1;
  const canCheckin = booking && ["PENDING", "CONFIRMED"].includes(booking.status)
    && minutesToAppt <= 30 && minutesToAppt > -30
    && !booking.manual_checkin_requested_at;
  const checkinPending = booking?.manual_checkin_requested_at && ["PENDING", "CONFIRMED"].includes(booking.status);

  return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", paddingBottom: 80 }}>
      <div style={{ position: "sticky", top: 0, background: "#ffffff", borderBottom: "1px solid #dce6e3", padding: "14px 16px", zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#52625f", fontSize: "1.3rem", cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: "1.1rem", color: "#13201e" }}>My Booking</h1>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 10, padding: "12px 16px", color: "#8a1f11", fontSize: "0.88rem" }}>{error}</div>}
        {checkinMsg && <div style={{ background: "#dff6e8", border: "1px solid #bfe8cf", borderRadius: 10, padding: "12px 16px", color: "#115e36", fontSize: "0.88rem" }}>{checkinMsg}</div>}

        {!booking && !loading && !checkinMsg && (
          <div style={{ textAlign: "center", color: "#94a3a0", padding: 48 }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📅</div>
            <p>No upcoming booking.</p>
            <button
              onClick={() => navigate("/haircut")}
              style={{ marginTop: 16, padding: "11px 20px", borderRadius: 10, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >
              Book Now
            </button>
          </div>
        )}

        {booking && (
          <>
            {/* Status */}
            {(() => {
              const s = STATUS_LABEL[booking.status] || { color: "#52625f", bg: "#eef3f1", label: booking.status };
              return (
                <div style={{ background: s.bg, borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: s.color, fontWeight: 700, fontSize: "1rem" }}>{s.label}</span>
                  {minutesToAppt != null && minutesToAppt > 0 && minutesToAppt < 1440 && (
                    <span style={{ color: s.color, fontSize: "0.82rem" }}>in {Math.round(minutesToAppt)} min</span>
                  )}
                </div>
              );
            })()}

            {/* OTP */}
            {["PENDING", "CONFIRMED"].includes(booking.status) && (
              <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: "0.78rem", color: "#52625f", marginBottom: 6 }}>Your OTP — show to barber</div>
                <div style={{ fontSize: "2.8rem", fontWeight: 900, color: "#13201e", letterSpacing: 10 }}>{booking.otp_code}</div>
              </div>
            )}

            {/* Details */}
            <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <Row label="Date" value={new Date(booking.appointment_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
              <Row label="Time" value={booking.start_time.slice(0, 5)} />
              {(booking.services || []).length > 0 ? (
                <div style={{ borderTop: "1px solid #dce6e3", paddingTop: 10 }}>
                  {booking.services.map(s => (
                    <div key={s.service_id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: "#13201e", fontSize: "0.88rem" }}>{s.service_name}</span>
                      <span style={{ color: "#15803d", fontWeight: 600 }}>₹{s.fee}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.82rem", color: "#94a3a0", borderTop: "1px solid #dce6e3", paddingTop: 10 }}>
                  Pay for services directly at the shop.
                </div>
              )}
            </div>

            {/* Manual check-in */}
            {canCheckin && (
              <button
                onClick={handleManualCheckin}
                disabled={checkingIn}
                style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: "#e0f2fe", color: "#075985", fontWeight: 700, cursor: "pointer", fontSize: "0.95rem" }}
              >
                {checkingIn ? "Getting your location…" : "📍 Request Manual Check-in"}
              </button>
            )}

            {checkinPending && (
              <div style={{ background: "#e0f2fe", border: "1px solid #bae0fd", borderRadius: 12, padding: "14px 16px", color: "#075985", fontSize: "0.88rem", textAlign: "center" }}>
                📍 Manual check-in requested — waiting for vendor to approve
              </div>
            )}

            {/* Reschedule */}
            {canReschedule && !rescheduling && (
              <button
                onClick={() => setRescheduling(true)}
                style={{ width: "100%", padding: "13px 20px", borderRadius: 12, border: "1px solid #c9d8d4", background: "#ffffff", color: "#13201e", fontWeight: 700, cursor: "pointer" }}
              >
                Reschedule Booking
              </button>
            )}

            {rescheduling && (
              <ReschedulePanel
                booking={booking}
                onClose={() => setRescheduling(false)}
                onDone={updated => { setBooking(updated); setRescheduling(false); }}
              />
            )}

            {/* Cancel */}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ width: "100%", padding: "13px 20px", borderRadius: 12, border: "1px solid #f2c2b8", background: "transparent", color: "#8a1f11", fontWeight: 700, cursor: "pointer" }}
              >
                {cancelling ? "Cancelling…" : "Cancel Booking"}
              </button>
            )}

            {!canCancel && ["PENDING", "CONFIRMED"].includes(booking.status) && minutesToAppt <= 60 && (
              <div style={{ background: "#fff8ea", borderRadius: 12, padding: "12px 16px", color: "#b45309", fontSize: "0.82rem", textAlign: "center" }}>
                ⚠ Cancellations are not allowed within 1 hour of the appointment.
              </div>
            )}
          </>
        )}
      </div>
      <HaircutSubNav />
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#52625f", fontSize: "0.88rem" }}>{label}</span>
      <span style={{ color: "#13201e", fontWeight: bold ? 700 : 400, fontSize: "0.88rem" }}>{value}</span>
    </div>
  );
}
