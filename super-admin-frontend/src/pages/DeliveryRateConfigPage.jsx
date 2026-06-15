import { useEffect, useState } from "react";
import { DeliveryLayout } from "./DeliveryLayout";
import { getDeliveryRate, getDeliveryRateHistory, setDeliveryRate, getTierRates, setTierRate, getSurgeConfig, setSurgeConfig } from "../lib/api";
import { validatePositiveNumber, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqName   = validateRequired("Your name");
const reqReason = (v) => (!v || v.trim().length < 5 ? "Reason must be at least 5 characters" : null);
const reqRate   = validatePositiveNumber("Rate");

const TIERS = ["JUNIOR", "STANDARD", "SENIOR", "EXPERT"];
const TIER_COLORS = { JUNIOR: "#64748b", STANDARD: "#3b82f6", SENIOR: "#8b5cf6", EXPERT: "#f59e0b" };

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

  // Surge config
  const [surge, setSurge] = useState({ is_active: false, multiplier: 1.0, label: "", updated_by: "" });
  const [surgeLabel, setSurgeLabel] = useState("");
  const [surgeMultiplier, setSurgeMultiplier] = useState(1.0);
  const [surgeSaving, setSurgeSaving] = useState(false);
  const [surgeError, setSurgeError] = useState("");
  const [surgeSuccess, setSurgeSuccess] = useState("");
  const [surgeAdminName, setSurgeAdminName] = useState("");

  const SURGE_STEP = 0.25;
  const SURGE_MIN = 1.0;
  const SURGE_MAX = 2.0;

  // Tier rates
  const [tierRates, setTierRates] = useState([]);
  const [tierForm, setTierForm] = useState({});   // { JUNIOR: "6.00", ... }
  const [tierSaving, setTierSaving] = useState(null);
  const [tierError, setTierError] = useState("");
  const [tierSuccess, setTierSuccess] = useState("");
  const [adminName, setAdminName] = useState("");

  const fieldErrors = {
    rate_per_km: touched.rate_per_km ? reqRate(form.rate_per_km)  : null,
    changed_by:  touched.changed_by  ? reqName(form.changed_by)   : null,
    reason:      touched.reason      ? reqReason(form.reason)      : null,
  };

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [cur, hist, tiers, surgeData] = await Promise.all([
        getDeliveryRate(),
        getDeliveryRateHistory(),
        getTierRates(),
        getSurgeConfig(),
      ]);
      setCurrent(cur);
      setHistory(hist);
      setTierRates(tiers);
      setSurge(surgeData);
      setSurgeMultiplier(surgeData.multiplier);
      setSurgeLabel(surgeData.label);
      setForm(f => ({ ...f, rate_per_km: cur.rate_per_km }));
      const init = {};
      tiers.forEach(t => { init[t.tier] = String(t.rate_per_km); });
      setTierForm(init);
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
    const rate = parseFloat(form.rate_per_km);
    if (reqRate(form.rate_per_km) || reqName(form.changed_by) || reqReason(form.reason)) return;
    setError(""); setSuccess(""); setSaving(true);
    try {
      const updated = await setDeliveryRate({
        rate_per_km: rate,
        changed_by: form.changed_by.trim(),
        reason: form.reason.trim(),
      });
      setCurrent(updated);
      setHistory(h => [updated, ...h]);
      setSuccess(`Global rate updated to ₹${rate.toFixed(2)}/km.`);
      setForm(f => ({ ...f, changed_by: "", reason: "" }));
    } catch (e) {
      setError(e.message || "Failed to update rate.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSurgeSave(newActive) {
    if (!surgeAdminName.trim()) { setSurgeError("Enter your name before saving."); return; }
    setSurgeSaving(true); setSurgeError(""); setSurgeSuccess("");
    try {
      const updated = await setSurgeConfig({
        is_active: newActive,
        multiplier: surgeMultiplier,
        label: surgeLabel.trim(),
        updated_by: surgeAdminName.trim(),
      });
      setSurge(updated);
      setSurgeSuccess(updated.is_active ? `Surge active — ${updated.multiplier}× (${updated.label || "no label"})` : "Surge deactivated.");
    } catch (e) {
      setSurgeError(e.message || "Failed to update surge config.");
    } finally {
      setSurgeSaving(false);
    }
  }

  async function handleTierSave(tier) {
    const val = parseFloat(tierForm[tier]);
    if (isNaN(val) || val <= 0) { setTierError(`Enter a valid rate for ${tier}.`); return; }
    if (!adminName.trim()) { setTierError("Enter your name before saving tier rates."); return; }
    setTierSaving(tier); setTierError(""); setTierSuccess("");
    try {
      const updated = await setTierRate(tier, { rate_per_km: val, updated_by: adminName.trim() });
      setTierRates(prev => prev.map(t => t.tier === tier ? updated : t));
      setTierSuccess(`${tier} tier rate updated to ₹${val.toFixed(2)}/km.`);
    } catch (e) {
      setTierError(e.message || "Failed to update tier rate.");
    } finally {
      setTierSaving(null);
    }
  }

  return (
    <DeliveryLayout title="KM Rate Configuration">
      <div className="dl-rate-page">
        {/* Current Global Rate Card */}
        <div className="dl-rate-current-card">
          <div className="dl-rate-current-label">Current Global Rate (fallback)</div>
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

        {/* Tier Rates */}
        <div className="dl-rate-form-card">
          <h3>Tier Rates</h3>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: 12 }}>
            Rate resolution per order: <strong>Custom rate</strong> → <strong>Tier rate</strong> → Global rate. Set tier for each delivery boy on their profile page.
          </p>
          {tierError && <div className="dl-alert dl-alert-error">{tierError}</div>}
          {tierSuccess && <div className="dl-alert dl-alert-success">{tierSuccess}</div>}
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Your name (required to save)</span>
            <input
              type="text" value={adminName}
              onChange={e => setAdminName(e.target.value)}
              placeholder="e.g. Aruna Aravind"
              style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", width: "100%", maxWidth: 280, fontSize: "0.85rem" }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {TIERS.map(tier => {
              const row = tierRates.find(t => t.tier === tier);
              return (
                <div key={tier} style={{ background: "#1e293b", border: `1.5px solid ${TIER_COLORS[tier]}33`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontWeight: 700, color: TIER_COLORS[tier], fontSize: "0.85rem", marginBottom: 6 }}>{tier}</div>
                  {row && <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: 8 }}>Last: {fmt(row.updated_at)} by {row.updated_by}</div>}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number" step="0.50" min="0.50"
                      value={tierForm[tier] ?? ""}
                      onChange={e => setTierForm(f => ({ ...f, [tier]: e.target.value }))}
                      style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9", fontSize: "0.85rem" }}
                      placeholder="₹/km"
                    />
                    <button
                      onClick={() => handleTierSave(tier)}
                      disabled={tierSaving === tier}
                      className="dl-admin-btn dl-admin-btn-primary"
                      style={{ whiteSpace: "nowrap", fontSize: "0.8rem", padding: "4px 10px" }}
                    >
                      {tierSaving === tier ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Update Global Rate Form */}
        <div className="dl-rate-form-card">
          <h3>Update Global Rate</h3>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: 12 }}>
            Applied only when a delivery boy has no tier rate set (or tier rate table is empty).
          </p>
          {error && <div className="dl-alert dl-alert-error">{error}</div>}
          {success && <div className="dl-alert dl-alert-success">{success}</div>}
          <form onSubmit={handleSubmit} className="dl-rate-form">
            <div className="dl-form-row">
              <label>
                New Rate (₹/km)
                <input
                  type="number" step="0.5" min="0.5"
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
                  type="text" value={form.changed_by}
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
              {saving ? "Saving…" : "Update Global Rate"}
            </button>
          </form>
        </div>

        {/* Change Log */}
        <div className="dl-rate-log-card">
          <h3>Global Rate Change Log <span className="dl-badge-count">{history.length}</span></h3>
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

        {/* ── Surge Charge ── */}
        <div className="dl-rate-card" style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>
              Surge Charge
              {surge.is_active && (
                <span style={{ marginLeft: 10, background: "#f59e0b", color: "#fff", fontSize: "0.72rem", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>
                  ACTIVE {surge.multiplier}×
                </span>
              )}
            </h3>
            <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>
              Max 2.0× · steps of 0.25×
            </div>
          </div>

          {surgeError && <div className="dl-error-banner" style={{ marginBottom: "0.75rem" }}>{surgeError}</div>}
          {surgeSuccess && <div className="dl-success-banner" style={{ marginBottom: "0.75rem" }}>{surgeSuccess}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Multiplier stepper */}
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.4rem" }}>Multiplier</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="dl-btn dl-btn-secondary"
                  style={{ width: 40, height: 40, fontSize: "1.2rem", padding: 0, borderRadius: 8 }}
                  disabled={surgeMultiplier <= SURGE_MIN || surgeSaving}
                  onClick={() => setSurgeMultiplier(m => Math.max(SURGE_MIN, parseFloat((m - SURGE_STEP).toFixed(2))))}
                >−</button>
                <span style={{ fontSize: "1.6rem", fontWeight: 700, minWidth: 60, textAlign: "center" }}>
                  {surgeMultiplier.toFixed(2)}×
                </span>
                <button
                  type="button"
                  className="dl-btn dl-btn-secondary"
                  style={{ width: 40, height: 40, fontSize: "1.2rem", padding: 0, borderRadius: 8 }}
                  disabled={surgeMultiplier >= SURGE_MAX || surgeSaving}
                  onClick={() => setSurgeMultiplier(m => Math.min(SURGE_MAX, parseFloat((m + SURGE_STEP).toFixed(2))))}
                >+</button>
                <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  {surgeMultiplier > 1 ? `+${((surgeMultiplier - 1) * 100).toFixed(0)}% on delivery earnings` : "No surcharge"}
                </span>
              </div>
            </div>

            {/* Label */}
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                Reason label <span style={{ fontWeight: 400, color: "#6b7280" }}>(shown to delivery boys and customers)</span>
              </label>
              <input
                className="dl-input"
                placeholder="e.g. Rain, Peak hours, Festival"
                value={surgeLabel}
                maxLength={100}
                onChange={e => setSurgeLabel(e.target.value)}
              />
            </div>

            {/* Admin name */}
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>Your name *</label>
              <input
                className="dl-input"
                placeholder="Admin name"
                value={surgeAdminName}
                onChange={e => setSurgeAdminName(e.target.value)}
                style={{ maxWidth: 260 }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="dl-btn dl-btn-primary"
                disabled={surgeSaving}
                onClick={() => handleSurgeSave(true)}
                style={{ background: "#f59e0b", borderColor: "#f59e0b" }}
              >
                {surgeSaving ? "Saving…" : surge.is_active ? "Update Surge" : "Activate Surge"}
              </button>
              {surge.is_active && (
                <button
                  type="button"
                  className="dl-btn dl-btn-secondary"
                  disabled={surgeSaving}
                  onClick={() => handleSurgeSave(false)}
                >
                  Deactivate Surge
                </button>
              )}
            </div>

            {surge.is_active && (
              <div style={{ fontSize: "0.78rem", color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: "0.6rem" }}>
                Last updated by <strong>{surge.updated_by}</strong> · {surge.label ? `"${surge.label}"` : "no label"}
              </div>
            )}
          </div>
        </div>
      </div>
    </DeliveryLayout>
  );
}
