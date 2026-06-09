import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, History, Save } from "lucide-react";
import { getSectorFeeHistory, getSectorFees, setSectorFee } from "../lib/api";
import { validateNonNegativeNumber, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqName   = validateRequired("Your name");
const reqReason = (v) => (!v || v.trim().length < 5 ? "Reason must be at least 5 characters" : null);
const reqFee    = validateNonNegativeNumber("Platform fee");
const reqGst    = (v) => {
  if (v === "" || v === null || v === undefined) return "GST % is required";
  const n = parseFloat(v);
  if (isNaN(n) || n < 0 || n > 100) return "GST % must be between 0 and 100";
  return null;
};

const SECTORS = [
  { key: "pharmacy", label: "Pharmacy", emoji: "💊" },
  { key: "food",     label: "Food",     emoji: "🍱" },
  { key: "fish",     label: "Fish",     emoji: "🐟" },
  { key: "grocery",  label: "Grocery",  emoji: "🛒" },
  { key: "other",    label: "Other",    emoji: "📦" },
];

function fmt(dt) {
  return new Date(dt).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SectorTab({ config, onSave }) {
  const [platformFee, setPlatformFee] = useState(config ? String(config.platform_fee) : "");
  const [gstPercent, setGstPercent]   = useState(config ? String(config.gst_percent)  : "");
  const [changedBy, setChangedBy]     = useState("");
  const [reason, setReason]           = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");
  const [history, setHistory]         = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [touched, setTouched]         = useState({});

  const fieldErrors = {
    platformFee: touched.platformFee ? reqFee(platformFee)      : null,
    gstPercent:  touched.gstPercent  ? reqGst(gstPercent)       : null,
    changedBy:   touched.changedBy   ? reqName(changedBy)       : null,
    reason:      touched.reason      ? reqReason(reason)        : null,
  };

  // reset form fields when config prop changes (tab switch)
  useEffect(() => {
    if (config) {
      setPlatformFee(String(config.platform_fee));
      setGstPercent(String(config.gst_percent));
    }
  }, [config?.config_id]);

  async function loadHistory() {
    if (!config) return;
    setHistLoading(true);
    try {
      const h = await getSectorFeeHistory(config.sector);
      setHistory(h);
    } finally {
      setHistLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setTouched({ platformFee: true, gstPercent: true, changedBy: true, reason: true });
    if (reqFee(platformFee) || reqGst(gstPercent) || reqName(changedBy) || reqReason(reason)) return;
    setError(""); setSuccess("");
    setSaving(true);
    try {
      const updated = await setSectorFee(config.sector, {
        platform_fee: fee,
        gst_percent: gst,
        changed_by: changedBy.trim(),
        reason: reason.trim(),
      });
      onSave(updated);
      setSuccess(`Saved: ₹${fee.toFixed(2)} platform fee, ${gst}% GST.`);
      setChangedBy(""); setReason("");
      if (showHistory) loadHistory();
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <div className="fee-tab-empty">No config loaded.</div>;

  return (
    <div className="fee-tab">
      {/* Current values */}
      <div className="fee-current-strip">
        <div className="fee-current-item">
          <span>Platform Fee</span>
          <strong>₹{parseFloat(config.platform_fee).toFixed(2)}</strong>
        </div>
        <div className="fee-current-divider" />
        <div className="fee-current-item">
          <span>GST</span>
          <strong>{parseFloat(config.gst_percent).toFixed(1)}%</strong>
        </div>
        <div className="fee-current-divider" />
        <div className="fee-current-item fee-current-item-meta">
          <span>Last changed by</span>
          <strong>{config.changed_by}</strong>
        </div>
        <div className="fee-current-divider" />
        <div className="fee-current-item fee-current-item-meta">
          <span>Effective since</span>
          <strong>{fmt(config.effective_at)}</strong>
        </div>
      </div>

      {/* Update form */}
      <div className="fee-form-card">
        <h3>Update Config</h3>
        {error   && <div className="fee-alert fee-alert-error">{error}</div>}
        {success && <div className="fee-alert fee-alert-success">{success}</div>}
        <form className="fee-form" onSubmit={handleSave}>
          <div className="fee-form-row">
            <label>
              Platform Fee (₹) <em>*</em>
              <input type="number" min="0" step="0.50" value={platformFee}
                     onChange={e => setPlatformFee(e.target.value)}
                     onBlur={touch(setTouched, "platformFee")}
                     className={inputClass(touched.platformFee, fieldErrors.platformFee)}
                     placeholder="e.g. 5.00" required />
              <span className="fee-form-hint">Flat ₹ amount added to every order in this sector.</span>
              {fieldErrors.platformFee && <span className="field-error-msg">{fieldErrors.platformFee}</span>}
            </label>
            <label>
              GST (%) <em>*</em>
              <input type="number" min="0" max="100" step="0.5" value={gstPercent}
                     onChange={e => setGstPercent(e.target.value)}
                     onBlur={touch(setTouched, "gstPercent")}
                     className={inputClass(touched.gstPercent, fieldErrors.gstPercent)}
                     placeholder="e.g. 5.0" required />
              <span className="fee-form-hint">Applied on (medicine cost + delivery + platform fee).</span>
              {fieldErrors.gstPercent && <span className="field-error-msg">{fieldErrors.gstPercent}</span>}
            </label>
          </div>
          <div className="fee-form-row">
            <label>
              Your Name / Admin ID <em>*</em>
              <input type="text" value={changedBy}
                     onChange={e => setChangedBy(e.target.value)}
                     onBlur={touch(setTouched, "changedBy")}
                     className={inputClass(touched.changedBy, fieldErrors.changedBy)}
                     placeholder="e.g. Aruna Aravind" required />
              {fieldErrors.changedBy && <span className="field-error-msg">{fieldErrors.changedBy}</span>}
            </label>
            <label>
              Reason for Change <em>*</em>
              <input type="text" value={reason}
                     onChange={e => setReason(e.target.value)}
                     onBlur={touch(setTouched, "reason")}
                     className={inputClass(touched.reason, fieldErrors.reason)}
                     placeholder="e.g. GST rate revised by government" required />
              {fieldErrors.reason && <span className="field-error-msg">{fieldErrors.reason}</span>}
            </label>
          </div>
          <button type="submit" className="fee-save-btn" disabled={saving}>
            <Save size={16} />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Change log */}
      <div className="fee-history-card">
        <button
          type="button"
          className="fee-history-toggle"
          onClick={() => { setShowHistory(v => { if (!v) loadHistory(); return !v; }); }}
        >
          <History size={16} />
          {showHistory ? "Hide" : "View"} Change Log
        </button>
        {showHistory && (
          histLoading ? <div className="fee-loading">Loading…</div> : (
            <table className="fee-history-table">
              <thead>
                <tr><th>#</th><th>Platform Fee</th><th>GST %</th><th>Changed By</th><th>Reason</th><th>Effective At</th></tr>
              </thead>
              <tbody>
                {history.map((row, i) => (
                  <tr key={row.config_id} className={i === 0 ? "fee-row-current" : ""}>
                    <td>{history.length - i}</td>
                    <td>₹{parseFloat(row.platform_fee).toFixed(2)}</td>
                    <td>{parseFloat(row.gst_percent).toFixed(1)}%</td>
                    <td>{row.changed_by}</td>
                    <td className="fee-reason-col">{row.reason}</td>
                    <td className="fee-nowrap">{fmt(row.effective_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

export default function FeeConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [activeTab, setActiveTab] = useState("pharmacy");

  useEffect(() => {
    setLoading(true);
    getSectorFees()
      .then(setConfigs)
      .catch(e => setError(e.message || "Failed to load."))
      .finally(() => setLoading(false));
  }, []);

  function handleSave(updated) {
    setConfigs(prev =>
      prev.map(c => c.sector === updated.sector ? updated : c)
    );
  }

  const activeConfig = configs.find(c => c.sector === activeTab) || null;

  return (
    <div className="fee-page">
      <div className="fee-page-header">
        <Link to="/dashboard" className="fee-back-link">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div>
          <h1>Fee &amp; Tax Configuration</h1>
          <p>Set the platform fee (₹) and GST % for each sector. Every change is logged.</p>
        </div>
      </div>

      {error && <div className="fee-alert fee-alert-error">{error}</div>}

      {loading ? (
        <div className="fee-loading">Loading configurations…</div>
      ) : (
        <>
          {/* Sector tabs */}
          <div className="fee-tabs">
            {SECTORS.map(({ key, label, emoji }) => (
              <button
                key={key}
                type="button"
                className={`fee-tab-btn${activeTab === key ? " fee-tab-active" : ""}`}
                onClick={() => setActiveTab(key)}
              >
                <span>{emoji}</span> {label}
              </button>
            ))}
          </div>

          {/* Active sector content */}
          <SectorTab config={activeConfig} onSave={handleSave} />
        </>
      )}
    </div>
  );
}
