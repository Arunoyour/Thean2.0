import { useEffect, useState } from "react";
import { DeliveryLayout } from "./DeliveryLayout";
import { getDeliveryRate, getDeliveryRateHistory, setDeliveryRate } from "../lib/api";
import { validatePositiveNumber, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqName   = validateRequired("Your name");
const reqReason = (v) => (!v || v.trim().length < 5 ? "Reason must be at least 5 characters" : null);
const reqRate   = validatePositiveNumber("Rate");

function fmt(dt) {
  return new Date(dt).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DeliveryRateConfigPage() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({ rate_per_km: "", changed_by: "", reason: "" });
  const [touched, setTouched] = useState({});

  const fieldErrors = {
    rate_per_km: touched.rate_per_km ? reqRate(form.rate_per_km)        : null,
    changed_by:  touched.changed_by  ? reqName(form.changed_by)         : null,
    reason:      touched.reason      ? reqReason(form.reason)           : null,
  };

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [cur, hist] = await Promise.all([getDeliveryRate(), getDeliveryRateHistory()]);
      setCurrent(cur);
      setHistory(hist);
      setForm(f => ({ ...f, rate_per_km: cur.rate_per_km }));
    } catch (e) {
      setError("Failed to load rate configuration.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ rate_per_km: true, changed_by: true, reason: true });
    if (reqRate(form.rate_per_km) || reqName(form.changed_by) || reqReason(form.reason)) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const updated = await setDeliveryRate({
        rate_per_km: rate,
        changed_by: form.changed_by.trim(),
        reason: form.reason.trim(),
      });
      setCurrent(updated);
      setHistory(h => [updated, ...h]);
      setSuccess(`Rate updated to ₹${rate.toFixed(2)}/km successfully.`);
      setForm(f => ({ ...f, changed_by: "", reason: "" }));
    } catch (e) {
      setError(e.message || "Failed to update rate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DeliveryLayout title="KM Rate Configuration">
      <div className="dl-rate-page">
        {/* Current Rate Card */}
        <div className="dl-rate-current-card">
          <div className="dl-rate-current-label">Current Rate</div>
          {loading ? (
            <div className="dl-rate-current-value">—</div>
          ) : (
            <>
              <div className="dl-rate-current-value">
                ₹{current ? parseFloat(current.rate_per_km).toFixed(2) : "—"} <span>/km</span>
              </div>
              {current && (
                <div className="dl-rate-current-meta">
                  Set by <strong>{current.changed_by}</strong> on {fmt(current.effective_at)}
                  <br />
                  <em>{current.reason}</em>
                </div>
              )}
            </>
          )}
        </div>

        {/* Update Form */}
        <div className="dl-rate-form-card">
          <h3>Update Rate</h3>
          {error && <div className="dl-alert dl-alert-error">{error}</div>}
          {success && <div className="dl-alert dl-alert-success">{success}</div>}
          <form onSubmit={handleSubmit} className="dl-rate-form">
            <div className="dl-form-row">
              <label>
                New Rate (₹/km)
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={form.rate_per_km}
                  onChange={e => setForm(f => ({ ...f, rate_per_km: e.target.value }))}
                  onBlur={touch(setTouched, "rate_per_km")}
                  className={inputClass(touched.rate_per_km, fieldErrors.rate_per_km)}
                  placeholder="e.g. 8.50"
                  required
                />
                {fieldErrors.rate_per_km && <span className="field-error-msg">{fieldErrors.rate_per_km}</span>}
              </label>
              <label>
                Your Name / Admin ID
                <input
                  type="text"
                  value={form.changed_by}
                  onChange={e => setForm(f => ({ ...f, changed_by: e.target.value }))}
                  onBlur={touch(setTouched, "changed_by")}
                  className={inputClass(touched.changed_by, fieldErrors.changed_by)}
                  placeholder="e.g. Aruna Aravind"
                  required
                />
                {fieldErrors.changed_by && <span className="field-error-msg">{fieldErrors.changed_by}</span>}
              </label>
            </div>
            <label className="dl-form-full">
              Reason for Change
              <textarea
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                onBlur={touch(setTouched, "reason")}
                className={inputClass(touched.reason, fieldErrors.reason)}
                placeholder="e.g. Fuel price increase — revised to reflect operational costs."
                rows={3}
                required
              />
              {fieldErrors.reason && <span className="field-error-msg">{fieldErrors.reason}</span>}
            </label>
            <button type="submit" className="dl-btn dl-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Update Rate"}
            </button>
          </form>
        </div>

        {/* Change Log */}
        <div className="dl-rate-log-card">
          <h3>Change Log <span className="dl-badge-count">{history.length}</span></h3>
          {loading ? (
            <div className="dl-spinner-row">Loading…</div>
          ) : history.length === 0 ? (
            <div className="dl-empty">No rate changes recorded yet.</div>
          ) : (
            <table className="dl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rate (₹/km)</th>
                  <th>Changed By</th>
                  <th>Reason</th>
                  <th>Effective At</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => (
                  <tr key={row.config_id} className={i === 0 ? "dl-row-highlight" : ""}>
                    <td>{history.length - i}</td>
                    <td><strong>₹{parseFloat(row.rate_per_km).toFixed(2)}</strong></td>
                    <td>{row.changed_by}</td>
                    <td className="dl-rate-log-reason">{row.reason}</td>
                    <td className="dl-nowrap">{fmt(row.effective_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DeliveryLayout>
  );
}
