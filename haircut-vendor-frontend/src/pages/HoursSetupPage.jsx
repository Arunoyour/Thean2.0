import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getShopHours, setShopHours } from "../lib/api.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultHours() {
  return DAY_NAMES.map((_, i) => ({
    day_of_week: i,
    is_open: i >= 1 && i <= 6, // Mon-Sat open by default
    opening_time: "09:00",
    closing_time: "20:00",
  }));
}

export function HoursSetupPage({ isSetup = false }) {
  const navigate = useNavigate();
  const [hours, setHours] = useState(defaultHours());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    getShopHours()
      .then(rows => {
        if (rows.length === 0) return; // keep defaults for first-time setup
        const map = Object.fromEntries(rows.map(r => [r.day_of_week, r]));
        setHours(defaultHours().map(d => {
          const r = map[d.day_of_week];
          if (!r) return d;
          return {
            day_of_week: d.day_of_week,
            is_open: r.is_open,
            opening_time: r.opening_time.slice(0, 5),
            closing_time: r.closing_time.slice(0, 5),
          };
        }));
      })
      .catch(() => {}) // first setup: no hours yet, keep defaults
      .finally(() => setFetching(false));
  }, []);

  function toggleDay(i) {
    setHours(h => h.map((d, idx) => idx === i ? { ...d, is_open: !d.is_open } : d));
  }
  function setTime(i, field) {
    return e => setHours(h => h.map((d, idx) => idx === i ? { ...d, [field]: e.target.value } : d));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    // Validate open days: closing > opening
    for (const d of hours) {
      if (d.is_open && d.closing_time <= d.opening_time) {
        setError(`${DAY_NAMES[d.day_of_week]}: closing time must be after opening time.`);
        return;
      }
    }
    setLoading(true);
    try {
      await setShopHours({ hours });
      if (isSetup) {
        navigate("/services");
      } else {
        setSuccess("Hours saved.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (fetching) return <div style={{ padding: 32, textAlign: "center", color: "#52625f" }}>Loading…</div>;

  return (
    <div className="hc-page">
      <div className="hc-topbar">
        <h2>Opening Hours</h2>
      </div>
      <div className="hc-content">
        {error && <div className="hc-error">{error}</div>}
        {success && <div className="hc-success">{success}</div>}

        <div className="hc-card">
          <form onSubmit={handleSave}>
            {hours.map((day, i) => (
              <div key={i} className="hc-hours-row">
                <span className="hc-hours-day">{DAY_NAMES[i]}</span>
                <label className="hc-toggle">
                  <input type="checkbox" checked={day.is_open} onChange={() => toggleDay(i)} />
                  <span className="hc-toggle-slider" />
                </label>
                {day.is_open && (
                  <div className="hc-hours-times">
                    <input type="time" value={day.opening_time} onChange={setTime(i, "opening_time")} />
                    <span style={{ color: "#52625f", fontSize: "0.85rem" }}>to</span>
                    <input type="time" value={day.closing_time} onChange={setTime(i, "closing_time")} />
                  </div>
                )}
                {!day.is_open && <span style={{ color: "#94a3a0", fontSize: "0.85rem", marginLeft: 8 }}>Closed</span>}
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <button className="hc-btn hc-btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Saving…" : isSetup ? "Save & Continue" : "Save Hours"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
