import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { haircutTokenBalance, haircutBookingHistory, haircutSubmitReview } from "../lib/api.js";
import { HaircutSubNav } from "../components/HaircutSubNav.jsx";

const STATUS_LABEL = {
  COMPLETED: { color: "#1d4ed8", label: "Completed" },
  CANCELED:  { color: "#52625f", label: "Cancelled" },
  NO_SHOW:   { color: "#8a1f11", label: "No-show" },
};

function RatingWidget({ booking, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!rating) { setError("Pick a star rating."); return; }
    setSubmitting(true); setError("");
    try {
      await haircutSubmitReview(booking.booking_id, rating, comment.trim());
      onSubmitted();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eef3f1" }}>
      {error && <div style={{ color: "#8a1f11", fontSize: "0.78rem", marginBottom: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => setRating(n)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: n <= rating ? "#b45309" : "#dce6e3" }}
          >
            {n <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        placeholder="Optional comment…"
        value={comment}
        onChange={e => setComment(e.target.value)}
        style={{ width: "100%", border: "1.5px solid #c9d8d4", borderRadius: 8, padding: "8px 10px", fontSize: "0.85rem", color: "#13201e", resize: "vertical", minHeight: 50, marginBottom: 8 }}
      />
      <button
        onClick={submit}
        disabled={submitting}
        style={{ width: "100%", padding: "10px 16px", borderRadius: 10, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem" }}
      >
        {submitting ? "Submitting…" : "Submit Review"}
      </button>
    </div>
  );
}

function HistoryRow({ booking, onReviewed }) {
  const [showRating, setShowRating] = useState(false);
  const [justReviewed, setJustReviewed] = useState(false);
  const status = STATUS_LABEL[booking.status] || { color: "#52625f", label: booking.status };

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#13201e", fontSize: "0.92rem" }}>{booking.shop_name || "Shop"}</div>
          <div style={{ fontSize: "0.8rem", color: "#52625f", marginTop: 2 }}>
            {new Date(booking.appointment_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {booking.start_time.slice(0, 5)}
          </div>
          {(booking.services || []).length > 0 && (
            <div style={{ fontSize: "0.78rem", color: "#94a3a0", marginTop: 2 }}>
              {booking.services.map(s => s.service_name).join(", ")}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          {booking.total_fee > 0 && <div style={{ fontWeight: 700, color: "#15803d", fontSize: "0.88rem" }}>₹{booking.total_fee}</div>}
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: status.color, marginTop: 2 }}>{status.label}</div>
        </div>
      </div>

      {booking.status === "COMPLETED" && !booking.has_review && !justReviewed && (
        showRating ? (
          <RatingWidget booking={booking} onSubmitted={() => { setJustReviewed(true); setShowRating(false); onReviewed(); }} />
        ) : (
          <button
            onClick={() => setShowRating(true)}
            style={{ marginTop: 10, width: "100%", padding: "9px 16px", borderRadius: 10, border: "1px solid #c9d8d4", background: "#ffffff", color: "#13201e", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}
          >
            ★ Rate this visit
          </button>
        )
      )}
      {(booking.has_review || justReviewed) && (
        <div style={{ marginTop: 8, fontSize: "0.78rem", color: "#94a3a0" }}>✓ You reviewed this visit</div>
      )}
    </div>
  );
}

export function HaircutHistoryPage() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true); setError("");
    Promise.all([haircutTokenBalance(), haircutBookingHistory()])
      .then(([b, h]) => { setBalance(b.balance); setHistory(h); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", paddingBottom: 80 }}>
      <div style={{ position: "sticky", top: 0, background: "#ffffff", borderBottom: "1px solid #dce6e3", padding: "14px 16px", zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#52625f", fontSize: "1.3rem", cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: "1.1rem", color: "#13201e" }}>Haircut History</h1>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 10, padding: "12px 16px", color: "#8a1f11", fontSize: "0.88rem" }}>{error}</div>}

        {/* Token balance card */}
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ background: "#d9f0ec", borderRadius: 12, padding: "12px 16px", textAlign: "center", minWidth: 70 }}>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#0f766e" }}>{loading ? "…" : balance ?? 0}</div>
            <div style={{ fontSize: "0.7rem", color: "#52625f", marginTop: 2 }}>Tokens</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#13201e", marginBottom: 4 }}>Booking Tokens</div>
            <div style={{ fontSize: "0.82rem", color: "#52625f" }}>Every new customer starts with 3 free tokens. Each booking uses 1 token — it's refunded when you complete the visit or cancel ≥1 hr before. No-shows forfeit the token.</div>
          </div>
        </div>

        {/* Quick links */}
        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, overflow: "hidden" }}>
          {[
            { label: "📅 My Upcoming Booking", path: "/haircut/booking" },
            { label: "✂️ Browse Shops", path: "/haircut" },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{ display: "flex", width: "100%", padding: "16px", background: "none", border: "none", borderBottom: "1px solid #dce6e3", color: "#13201e", fontSize: "0.95rem", cursor: "pointer", textAlign: "left", justifyContent: "space-between", alignItems: "center" }}
            >
              {item.label}
              <span style={{ color: "#94a3a0" }}>›</span>
            </button>
          ))}
        </div>

        <div>
          <div style={{ fontWeight: 700, color: "#13201e", marginBottom: 10, fontSize: "0.95rem" }}>Past Visits</div>
          {loading ? (
            <div style={{ color: "#52625f", textAlign: "center", padding: 24 }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ color: "#94a3a0", textAlign: "center", padding: 24, fontSize: "0.85rem" }}>No past bookings yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {history.map(b => <HistoryRow key={b.booking_id} booking={b} onReviewed={load} />)}
            </div>
          )}
        </div>
      </div>
      <HaircutSubNav />
    </div>
  );
}
