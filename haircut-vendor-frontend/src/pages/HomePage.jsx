import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyShop, getShopHours, getTodayAppointments, otpCheckin, approveManualCheckin } from "../lib/api.js";

function statusClass(status) {
  return `hc-booking-status hc-status-${status.toLowerCase()}`;
}

// Card accent: success(completed)=green, failed(no-show/cancelled)=red,
// happening right now=yellow, scheduled for later today=blue.
function cardAccent(booking) {
  if (booking.status === "COMPLETED") return { background: "#dff6e8", border: "#bfe8cf" };
  if (["NO_SHOW", "CANCELED"].includes(booking.status)) return { background: "#fde8e4", border: "#f2c2b8" };

  const start = new Date(`${booking.appointment_date}T${booking.start_time}`);
  const end = new Date(start.getTime() + booking.total_duration_minutes * 60000);
  const now = new Date();
  if (now >= start && now <= end) return { background: "#fff8ea", border: "#fde68a" };
  return { background: "#e0f2fe", border: "#bae0fd" };
}

function BookingCard({ booking, onRefresh }) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleOtp() {
    if (otp.length !== 6) { setError("Enter 6-digit OTP."); return; }
    setError(""); setLoading(true);
    try { await otpCheckin(booking.booking_id, otp); onRefresh(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleApprove() {
    if (!confirm("Confirm manual check-in for this customer?")) return;
    setError(""); setLoading(true);
    try { await approveManualCheckin(booking.booking_id); onRefresh(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const isActive = ["PENDING", "CONFIRMED"].includes(booking.status);
  const hasPendingCheckin = !!booking.manual_checkin_requested_at && booking.status !== "COMPLETED";
  const accent = cardAccent(booking);

  return (
    <div className="hc-booking-card" style={{ background: accent.background, borderColor: accent.border }}>
      <div className="hc-booking-card-header">
        <span className="hc-booking-time">
          {booking.start_time.slice(0, 5)}
          {" "}
          <span style={{ fontSize: "0.8rem", color: "#52625f", fontWeight: 400 }}>
            ({booking.total_duration_minutes} min)
          </span>
        </span>
        <span className={statusClass(booking.status)}>{booking.status}</span>
      </div>

      <div className="hc-booking-services">
        {booking.services.map(s => s.service_name).join(", ")}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="hc-booking-total">₹{booking.total_fee}</span>
        {hasPendingCheckin && (
          <span className="hc-badge-checkin">📍 Check-in requested</span>
        )}
      </div>

      {error && <div className="hc-error" style={{ padding: "8px 12px" }}>{error}</div>}

      {isActive && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* OTP check-in */}
          <div className="hc-otp-strip">
            <input
              type="text"
              placeholder="OTP"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
            />
            <button className="hc-btn hc-btn-success hc-btn-sm" onClick={handleOtp} disabled={loading}>
              ✓ OTP Check-in
            </button>
          </div>

          {/* Manual check-in approval */}
          {hasPendingCheckin && (
            <button className="hc-btn hc-btn-primary hc-btn-sm" onClick={handleApprove} disabled={loading}>
              Approve Manual Check-in
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function HomePage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shopName, setShopName] = useState("");
  const [hoursConfigured, setHoursConfigured] = useState(true); // assume configured until checked

  async function load() {
    setLoading(true);
    try { setBookings(await getTodayAppointments()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    getMyShop().then((shop) => setShopName(shop.shop_name)).catch(() => {});
    getShopHours().then((rows) => setHoursConfigured(rows.some(r => r.is_open))).catch(() => {});
  }, []);

  const pending = bookings.filter(b => ["PENDING", "CONFIRMED"].includes(b.status));
  const done = bookings.filter(b => !["PENDING", "CONFIRMED"].includes(b.status));

  return (
    <div className="hc-page">
      <div className="hc-topbar">
        <div>
          {shopName && <div style={{ fontSize: "0.8rem", color: "#52625f" }}>{shopName}</div>}
          <h2>Today's Appointments</h2>
        </div>
        <button className="hc-btn hc-btn-secondary hc-btn-sm" onClick={load} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <div className="hc-content">
        {error && <div className="hc-error">{error}</div>}

        {!hoursConfigured && (
          <div className="hc-error" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span>⚠ Opening hours aren't set up yet — customers can currently book 10:00 AM – 7:00 PM (default) every day. Set your real hours so this matches your shop.</span>
            <Link to="/settings/hours" className="hc-btn hc-btn-primary hc-btn-sm" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
              Set Opening Hours
            </Link>
          </div>
        )}

        {!loading && bookings.length === 0 && (
          <div className="hc-empty">
            <div className="hc-empty-icon">📅</div>
            <p>No appointments today.</p>
          </div>
        )}

        {bookings.length > 0 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: "0.72rem", color: "#52625f" }}>
            <span>🟦 Upcoming</span>
            <span>🟨 Happening now</span>
            <span>🟩 Completed</span>
            <span>🟥 No-show / Cancelled</span>
          </div>
        )}

        {pending.length > 0 && (
          <>
            <div className="hc-section-label">Upcoming ({pending.length})</div>
            {pending.map(b => <BookingCard key={b.booking_id} booking={b} onRefresh={load} />)}
          </>
        )}

        {done.length > 0 && (
          <>
            <div className="hc-section-label">Done / Past ({done.length})</div>
            {done.map(b => {
              const accent = cardAccent(b);
              return (
                <div key={b.booking_id} className="hc-booking-card" style={{ background: accent.background, borderColor: accent.border }}>
                  <div className="hc-booking-card-header">
                    <span className="hc-booking-time">{b.start_time.slice(0, 5)}</span>
                    <span className={statusClass(b.status)}>{b.status}</span>
                  </div>
                  <div className="hc-booking-services">{b.services.map(s => s.service_name).join(", ")}</div>
                  <span className="hc-booking-total">₹{b.total_fee}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
