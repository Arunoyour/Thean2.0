import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listServices, createService, updateService, toggleService, deleteService } from "../lib/api.js";

function ServiceSheet({ initial, onSave, onClose }) {
  const [form, setForm] = useState(
    initial || { service_name: "", fee: "", duration_minutes: 30, display_order: 0 }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.service_name.trim()) { setError("Service name is required."); return; }
    if (Number(form.fee) < 0) { setError("Fee cannot be negative."); return; }
    setLoading(true);
    try {
      await onSave({
        service_name: form.service_name.trim(),
        fee: Number(form.fee),
        duration_minutes: Number(form.duration_minutes),
        display_order: Number(form.display_order) || 0,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hc-sheet">
        <h3>{initial ? "Edit Service" : "Add Service"}</h3>
        {error && <div className="hc-error">{error}</div>}
        <form className="hc-form" onSubmit={handleSubmit} noValidate>
          <label>Service Name *<input value={form.service_name} onChange={set("service_name")} autoFocus /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>Fee (₹) *<input type="number" min={0} value={form.fee} onChange={set("fee")} /></label>
            <label>Duration (min)<input type="number" min={5} max={480} value={form.duration_minutes} onChange={set("duration_minutes")} /></label>
          </div>
          <label>Display Order<input type="number" min={0} value={form.display_order} onChange={set("display_order")} /></label>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="hc-btn hc-btn-secondary" type="button" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button className="hc-btn hc-btn-primary" type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ServicesPage({ isSetup = false }) {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(null); // null | "create" | service object for edit
  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    setLoading(true);
    try { setServices(await listServices()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(svc) {
    try {
      const updated = await toggleService(svc.service_id);
      setServices(s => s.map(x => x.service_id === updated.service_id ? updated : x));
    } catch (err) { setError(err.message); }
  }

  async function handleDelete(svc) {
    if (!confirm(`Delete "${svc.service_name}"? This cannot be undone.`)) return;
    setDeletingId(svc.service_id);
    try {
      await deleteService(svc.service_id);
      setServices(s => s.filter(x => x.service_id !== svc.service_id));
    } catch (err) { setError(err.message); }
    finally { setDeletingId(null); }
  }

  async function handleSave(payload) {
    if (sheet && sheet !== "create") {
      // edit
      const updated = await updateService(sheet.service_id, payload);
      setServices(s => s.map(x => x.service_id === updated.service_id ? updated : x));
    } else {
      // create
      const created = await createService(payload);
      setServices(s => [...s, created]);
    }
  }

  return (
    <div className="hc-page">
      <div className="hc-topbar">
        <h2>Services</h2>
        <button className="hc-btn hc-btn-primary hc-btn-sm" onClick={() => setSheet("create")}>+ Add</button>
      </div>

      <div className="hc-content">
        {error && <div className="hc-error">{error}</div>}

        {loading ? (
          <div style={{ color: "#52625f", textAlign: "center", padding: 32 }}>Loading…</div>
        ) : services.length === 0 ? (
          <div className="hc-empty">
            <div className="hc-empty-icon">✂️</div>
            <p>No services yet. Add your first service.</p>
          </div>
        ) : (
          <div className="hc-card">
            {services.map(svc => (
              <div key={svc.service_id} className="hc-service-row">
                <label className="hc-toggle">
                  <input type="checkbox" checked={svc.is_enabled} onChange={() => handleToggle(svc)} />
                  <span className="hc-toggle-slider" />
                </label>
                <div style={{ flex: 1 }}>
                  <div className="hc-service-name" style={{ color: svc.is_enabled ? "#13201e" : "#94a3a0" }}>
                    {svc.service_name}
                  </div>
                  <div className="hc-service-meta">{svc.duration_minutes} min</div>
                </div>
                <span className="hc-service-fee">₹{svc.fee}</span>
                <button className="hc-btn hc-btn-secondary hc-btn-sm" onClick={() => setSheet(svc)}>Edit</button>
                <button
                  className="hc-btn hc-btn-danger hc-btn-sm"
                  disabled={deletingId === svc.service_id}
                  onClick={() => handleDelete(svc)}
                >
                  Del
                </button>
              </div>
            ))}
          </div>
        )}

        {isSetup && (
          <button className="hc-btn hc-btn-primary" onClick={() => navigate("/home")} style={{ width: "100%" }}>
            Done — Go to Dashboard →
          </button>
        )}
      </div>

      {sheet && (
        <ServiceSheet
          initial={sheet !== "create" ? sheet : null}
          onSave={handleSave}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
