import { useEffect, useRef, useState } from "react";
import {
  Camera, CheckCircle2, Clock, Edit2, ExternalLink, FileText,
  MapPin, Save, ShieldCheck, Upload, User, X,
} from "lucide-react";
import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { getCurrentPharmacy, getPharmacyStats, updatePharmacyProfile } from "../lib/api.js";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const STATUS_META = {
  PENDING_CUSTOMER_APPROVAL: { label: "Pending approval", color: "#f59e0b" },
  PENDING_PHARMACY_ACTION:   { label: "Pending action",   color: "#3b82f6" },
  ACCEPTED:                  { label: "Accepted",          color: "#6366f1" },
  ESTIMATE_SUBMITTED:        { label: "Estimate sent",     color: "#8b5cf6" },
  BILL_SUBMITTED:            { label: "Bill sent",         color: "#0ea5e9" },
  READY_FOR_DELIVERY:        { label: "Ready",             color: "#14b8a6" },
  DELIVERED:                 { label: "Delivered",         color: "#10b981" },
  COMPLETED:                 { label: "Completed",         color: "#16a34a" },
  REJECTED:                  { label: "Rejected",          color: "#ef4444" },
  CANCELLED:                 { label: "Cancelled",         color: "#6b7280" },
};

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(/\/api\/v1$/, "");

function resolveMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/media")) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/media/${path.replace(/^storage\/?/, "")}`;
}

function fmt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value, children }) {
  return (
    <div className="about-detail-row">
      <span className="about-detail-label">{label}</span>
      <span className="about-detail-value">{children ?? value ?? "—"}</span>
    </div>
  );
}

// ── Document link ─────────────────────────────────────────────────────────────
function DocLink({ label, url, icon: Icon = FileText }) {
  if (!url) return <InfoRow label={label} value="Not uploaded" />;
  const href = resolveMediaUrl(url);
  return (
    <div className="about-detail-row">
      <span className="about-detail-label">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="about-doc-link">
        <Icon size={13} /> View document <ExternalLink size={11} />
      </a>
    </div>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, color = "#1a7a5e", formatValue }) {
  if (!data || data.length === 0) return <p className="field-help">No data yet.</p>;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const W = 560, H = 140, PAD = 32, BAR_GAP = 4;
  const barW = Math.max(4, (W - PAD * 2) / data.length - BAR_GAP);

  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="about-chart-svg">
      {data.map((d, i) => {
        const barH = Math.max(2, ((d[valueKey] / max) * H * 0.85));
        const x = PAD + i * ((W - PAD * 2) / data.length) + BAR_GAP / 2;
        const y = H - barH + 4;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={color} opacity="0.85" />
            <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize="9" fill="#6b7280">{d[labelKey]}</text>
            {d[valueKey] > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="9" fill={color} fontWeight="600">
                {formatValue ? formatValue(d[valueKey]) : d[valueKey]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ statusCounts }) {
  const entries = Object.entries(statusCounts).filter(([, v]) => v > 0);
  if (entries.length === 0) return <p className="field-help">No orders yet.</p>;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const R = 56, cx = 70, cy = 70;
  let cum = -Math.PI / 2;
  const slices = entries.map(([key, val]) => {
    const angle = (val / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(cum), y1 = cy + R * Math.sin(cum);
    cum += angle;
    const x2 = cx + R * Math.cos(cum), y2 = cy + R * Math.sin(cum);
    return { key, val, x1, y1, x2, y2, large: angle > Math.PI ? 1 : 0, color: (STATUS_META[key] || {}).color || "#9ca3af" };
  });

  return (
    <div className="about-donut-wrap">
      <svg viewBox="0 0 140 140" className="about-donut-svg">
        {slices.map((s) => (
          <path key={s.key}
            d={`M ${cx} ${cy} L ${s.x1} ${s.y1} A ${R} ${R} 0 ${s.large} 1 ${s.x2} ${s.y2} Z`}
            fill={s.color} opacity="0.9" />
        ))}
        <circle cx={cx} cy={cy} r={28} fill="#fff" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="14" fontWeight="700" fill="#13201e">{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#6b7280">orders</text>
      </svg>
      <ul className="about-donut-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <span className="about-legend-dot" style={{ background: s.color }} />
            <span className="about-legend-label">{(STATUS_META[s.key] || {}).label || s.key}</span>
            <span className="about-legend-val">{s.val}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildMonthSeries(rawData, valueKey) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const yr = d.getFullYear(), mo = d.getMonth() + 1;
    const found = rawData.find((r) => r.year === yr && r.month === mo);
    return { label: MONTH_NAMES[mo - 1], value: found ? found[valueKey] : 0 };
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AboutPage() {
  const [pharmacy, setPharmacy] = useState(null);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [newImage, setNewImage] = useState(null);
  const [newImagePreview, setNewImagePreview] = useState(null);
  const [newOwnerPhoto, setNewOwnerPhoto] = useState(null);
  const [newOwnerPhotoPreview, setNewOwnerPhotoPreview] = useState(null);
  const [newDrugLicence, setNewDrugLicence] = useState(null);
  const [newOwnerId, setNewOwnerId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const imageInputRef = useRef(null);
  const ownerPhotoInputRef = useRef(null);
  const drugLicenceInputRef = useRef(null);
  const ownerIdInputRef = useRef(null);

  useEffect(() => {
    Promise.all([getCurrentPharmacy(), getPharmacyStats().catch(() => null)])
      .then(([ph, st]) => { setPharmacy(ph); setStats(st); })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  function startEdit() {
    const p = pharmacy.profile;
    setEditForm({
      owner_name:    pharmacy.owner_name || "",
      email:         pharmacy.email || "",
      store_name:    p.store_name || "",
      license_number: p.license_number || "",
      gstin:          p.gstin || "",
      address_line_1: p.address_line_1 || "",
      city:          p.city || "",
      state:         p.state || "",
      pincode:       p.pincode || "",
      latitude:      p.latitude != null ? String(p.latitude) : "",
      longitude:     p.longitude != null ? String(p.longitude) : "",
    });
    setNewImage(null);
    setNewImagePreview(resolveMediaUrl(p.store_image_url));
    setNewOwnerPhoto(null);
    setNewOwnerPhotoPreview(resolveMediaUrl(p.owner_photo_url));
    setSaveError(""); setSaveSuccess("");
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setNewImage(null); setNewImagePreview(null);
    setNewOwnerPhoto(null); setNewOwnerPhotoPreview(null);
    setNewDrugLicence(null); setNewOwnerId(null);
  }

  function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewImage(file);
    setNewImagePreview(URL.createObjectURL(file));
  }

  function pickOwnerPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewOwnerPhoto(file);
    setNewOwnerPhotoPreview(URL.createObjectURL(file));
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaveError(""); setSaveSuccess("");
    if (!editForm.owner_name.trim()) { setSaveError("Owner name is required."); return; }
    if (!editForm.store_name.trim()) { setSaveError("Store name is required."); return; }
    if (!editForm.license_number.trim()) { setSaveError("Drug licence number is required."); return; }
    if (!editForm.address_line_1.trim()) { setSaveError("Address is required."); return; }
    if (editForm.latitude && isNaN(parseFloat(editForm.latitude))) { setSaveError("Latitude must be a valid number."); return; }
    if (editForm.longitude && isNaN(parseFloat(editForm.longitude))) { setSaveError("Longitude must be a valid number."); return; }
    setIsSaving(true);
    try {
      const fd = new FormData();
      Object.entries(editForm).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== "") fd.append(k, String(v).trim());
      });
      if (newImage) fd.append("store_image", newImage);
      if (newOwnerPhoto) fd.append("owner_photo", newOwnerPhoto);
      if (newDrugLicence) fd.append("drug_licence", newDrugLicence);
      if (newOwnerId) fd.append("owner_id", newOwnerId);
      const updated = await updatePharmacyProfile(fd);
      setPharmacy(updated);
      setSaveSuccess("Profile updated successfully.");
      setIsEditing(false);
      setNewImage(null); setNewImagePreview(null);
      setNewDrugLicence(null); setNewOwnerId(null);
    } catch (err) { setSaveError(err.message); }
    finally { setIsSaving(false); }
  }

  if (isLoading) return <PharmacyPageShell><section className="panel">Loading…</section></PharmacyPageShell>;
  if (error) return <PharmacyPageShell><section className="panel"><div className="error">{error}</div></section></PharmacyPageShell>;

  const p = pharmacy.profile;
  const storeImageUrl = resolveMediaUrl(p.store_image_url);
  const heroImage = isEditing ? (newImagePreview || storeImageUrl) : storeImageUrl;
  const revenueMonths = stats ? buildMonthSeries(stats.monthly_revenue, "total") : [];
  const orderMonths  = stats ? buildMonthSeries(stats.monthly_orders,  "count") : [];
  const fmtINR = (v) => `₹${Math.round(v).toLocaleString("en-IN")}`;

  return (
    <PharmacyPageShell>

      {/* ── Hero ── */}
      <header
        className={`portal-header about-hero${heroImage ? " portal-header-image" : ""}`}
        style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
      >
        <div className="portal-header-content about-hero-content">
          <div className="about-hero-text">
            <p className="eyebrow">Pharmacy Profile</p>
            <h1>{p.store_name}</h1>
            <p><MapPin size={13} style={{ verticalAlign: "middle" }} />{" "}
              {[p.address_line_1, p.city, p.state, p.pincode].filter(Boolean).join(", ")}
            </p>
          </div>
          {!isEditing && (
            <button className="outline-button about-edit-btn" type="button" onClick={startEdit}>
              <Edit2 size={15} /> Edit Profile
            </button>
          )}
        </div>
      </header>

      {saveSuccess && <div className="success">{saveSuccess}</div>}

      {/* ── Edit form ── */}
      {isEditing && (
        <section className="panel about-edit-panel">
          <div className="about-edit-header">
            <h2>Edit Profile</h2>
            <button className="icon-button" type="button" onClick={cancelEdit}><X size={18} /></button>
          </div>
          {saveError && <div className="error">{saveError}</div>}
          <form onSubmit={saveEdit}>

            {/* Store photo */}
            <p className="about-edit-section-title">Store Photo</p>
            <div className="about-photo-row">
              <div className="about-photo-thumb"
                style={(newImagePreview || storeImageUrl) ? { backgroundImage: `url(${newImagePreview || storeImageUrl})` } : undefined}
                onClick={() => imageInputRef.current?.click()}>
                {!newImagePreview && !storeImageUrl && <Camera size={28} color="#9ca3af" />}
                <div className="about-photo-overlay"><Camera size={18} /></div>
              </div>
              <div>
                <button type="button" className="outline-button button-small" onClick={() => imageInputRef.current?.click()}>
                  <Camera size={14} /> {newImage ? newImage.name : "Change store photo"}
                </button>
                <p className="field-help">JPG or PNG · max 5 MB</p>
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickImage} />
            </div>

            {/* Owner photo */}
            <p className="about-edit-section-title">Owner Photo</p>
            <div className="about-photo-row">
              <div
                className="about-owner-photo-thumb"
                style={(newOwnerPhotoPreview) ? { backgroundImage: `url(${newOwnerPhotoPreview})` } : undefined}
                onClick={() => ownerPhotoInputRef.current?.click()}
              >
                {!newOwnerPhotoPreview && <User size={28} color="#9ca3af" />}
                <div className="about-photo-overlay"><Camera size={18} /></div>
              </div>
              <div>
                <button type="button" className="outline-button button-small" onClick={() => ownerPhotoInputRef.current?.click()}>
                  <Camera size={14} /> {newOwnerPhoto ? newOwnerPhoto.name : "Change owner photo"}
                </button>
                <p className="field-help">JPG or PNG · max 5 MB</p>
              </div>
              <input ref={ownerPhotoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickOwnerPhoto} />
            </div>

            {/* Owner & account */}
            <p className="about-edit-section-title">Owner &amp; Account</p>
            <div className="about-form-grid">
              <label className="field-label">
                Owner name *
                <input className="field-input" value={editForm.owner_name || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, owner_name: e.target.value }))} />
              </label>
              <label className="field-label">
                Email
                <input className="field-input" type="email" value={editForm.email || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </label>
            </div>

            {/* Store details */}
            <p className="about-edit-section-title">Store Details</p>
            <div className="about-form-grid">
              <label className="field-label">
                Store name *
                <input className="field-input" value={editForm.store_name || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, store_name: e.target.value }))} />
              </label>
              <label className="field-label">
                Drug licence number *
                <input className="field-input" value={editForm.license_number || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, license_number: e.target.value }))} />
              </label>
              <label className="field-label">
                GST number <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
                <input className="field-input" value={editForm.gstin || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 29ABCDE1234F1Z5" maxLength={15} />
              </label>
              <label className="field-label" style={{ gridColumn: "1 / -1" }}>
                Address *
                <input className="field-input" value={editForm.address_line_1 || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, address_line_1: e.target.value }))} />
              </label>
              <label className="field-label">
                City
                <input className="field-input" value={editForm.city || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, city: e.target.value }))} />
              </label>
              <label className="field-label">
                State
                <input className="field-input" value={editForm.state || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, state: e.target.value }))} />
              </label>
              <label className="field-label">
                Pincode
                <input className="field-input" value={editForm.pincode || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, pincode: e.target.value }))}
                  maxLength={6} inputMode="numeric" />
              </label>
            </div>

            {/* GPS */}
            <p className="about-edit-section-title">GPS Coordinates</p>
            <div className="about-form-grid">
              <label className="field-label">
                Latitude
                <input className="field-input" value={editForm.latitude || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, latitude: e.target.value }))}
                  inputMode="decimal" placeholder="e.g. 12.971599" />
              </label>
              <label className="field-label">
                Longitude
                <input className="field-input" value={editForm.longitude || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, longitude: e.target.value }))}
                  inputMode="decimal" placeholder="e.g. 77.594566" />
              </label>
            </div>

            {/* Documents */}
            <p className="about-edit-section-title">Documents</p>
            <div className="about-doc-upload-grid">
              <div className="about-doc-upload-row">
                <span className="about-doc-upload-label">Drug licence</span>
                <button type="button" className="outline-button button-small"
                  onClick={() => drugLicenceInputRef.current?.click()}>
                  <Upload size={13} /> {newDrugLicence ? newDrugLicence.name : "Replace file"}
                </button>
                <input ref={drugLicenceInputRef} type="file" accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => setNewDrugLicence(e.target.files?.[0] || null)} />
              </div>
              <div className="about-doc-upload-row">
                <span className="about-doc-upload-label">Owner ID proof</span>
                <button type="button" className="outline-button button-small"
                  onClick={() => ownerIdInputRef.current?.click()}>
                  <Upload size={13} /> {newOwnerId ? newOwnerId.name : "Replace file"}
                </button>
                <input ref={ownerIdInputRef} type="file" accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => setNewOwnerId(e.target.files?.[0] || null)} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: "1.5rem" }}>
              <button className="button" type="submit" disabled={isSaving}>
                <Save size={15} /> {isSaving ? "Saving…" : "Save changes"}
              </button>
              <button className="outline-button" type="button" onClick={cancelEdit} disabled={isSaving}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {/* ── Stats row ── */}
      {stats && (
        <div className="about-stat-row">
          <div className="about-stat-card about-stat-highlight">
            <p className="about-stat-label">Orders delivered</p>
            <p className="about-stat-num">{(stats.delivered_orders || 0).toLocaleString("en-IN")}</p>
          </div>
          <div className="about-stat-card">
            <p className="about-stat-label">Total orders</p>
            <p className="about-stat-num">{(stats.total_orders || 0).toLocaleString("en-IN")}</p>
          </div>
          <div className="about-stat-card">
            <p className="about-stat-label">Revenue (12 mo)</p>
            <p className="about-stat-num">{fmtINR(revenueMonths.reduce((s, m) => s + m.value, 0))}</p>
          </div>
        </div>
      )}

      {/* ── Account & Owner ── */}
      <section className="panel about-section">
        <div className="about-owner-header">
          <h2><User size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Owner &amp; Account</h2>
          {p.owner_photo_url && (
            <div
              className="about-owner-avatar"
              style={{ backgroundImage: `url(${resolveMediaUrl(p.owner_photo_url)})` }}
            />
          )}
        </div>
        <InfoRow label="Owner name"       value={pharmacy.owner_name} />
        <InfoRow label="Phone number"     value={`+91 ${pharmacy.phone_number}`} />
        <InfoRow label="Email"            value={pharmacy.email || "—"} />
        <InfoRow label="Account ID"       value={pharmacy.account_id} />
        <InfoRow label="Registered on"    value={fmt(pharmacy.created_at)} />
        <InfoRow label="Approved on"      value={fmt(pharmacy.activated_at)} />
        <InfoRow label="Account status">
          <span style={{ color: pharmacy.is_active ? "#16a34a" : "#d97706", fontWeight: 600 }}>
            {pharmacy.is_active
              ? <><CheckCircle2 size={13} style={{ verticalAlign: "middle" }} /> Active</>
              : <><Clock size={13} style={{ verticalAlign: "middle" }} /> Pending admin approval</>}
          </span>
        </InfoRow>
      </section>

      {/* ── Store details ── */}
      <section className="panel about-section">
        <h2><MapPin size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Store Details</h2>
        <InfoRow label="Store name"       value={p.store_name} />
        <InfoRow label="Drug licence no." value={p.license_number} />
        <InfoRow label="GST number"       value={p.gstin || "—"} />
        <InfoRow label="Address"          value={p.address_line_1} />
        <InfoRow label="City"             value={p.city} />
        <InfoRow label="State"            value={p.state} />
        <InfoRow label="Pincode"          value={p.pincode} />
        <InfoRow label="GPS coordinates"  value={
          p.latitude && p.longitude
            ? `${Number(p.latitude).toFixed(6)}, ${Number(p.longitude).toFixed(6)}`
            : "—"
        } />
        <InfoRow label="Listed on platform">
          <span style={{ color: p.is_listed ? "#16a34a" : "#6b7280" }}>
            {p.is_listed ? "Yes" : "No"}
          </span>
        </InfoRow>
        <InfoRow label="Online status">
          <span style={{ color: p.is_online ? "#16a34a" : "#6b7280" }}>
            {p.is_online ? "Online" : "Offline"}
          </span>
        </InfoRow>
        <InfoRow label="Profile created"  value={fmt(p.created_at)} />
      </section>

      {/* ── Documents ── */}
      <section className="panel about-section">
        <h2><FileText size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Uploaded Documents</h2>
        <DocLink label="Store photo"    url={p.store_image_url} icon={Camera} />
        <DocLink label="Drug licence"   url={p.drug_licence_url} />
        <DocLink label="Owner ID proof" url={p.owner_id_url} />

        {p.photo_taken_at || p.photo_lat ? (
          <div className="about-exif-block">
            <p className="about-exif-title"><ShieldCheck size={13} /> Store photo EXIF data</p>
            <InfoRow label="Photo taken at"   value={p.photo_taken_at ? fmt(p.photo_taken_at) : "—"} />
            <InfoRow label="Photo GPS"        value={
              p.photo_lat && p.photo_lng
                ? `${Number(p.photo_lat).toFixed(6)}, ${Number(p.photo_lng).toFixed(6)}`
                : "—"
            } />
          </div>
        ) : null}
      </section>

      {/* ── Financial / Commission ── */}
      <section className="panel about-section">
        <h2>Financial Terms</h2>
        <p className="field-help" style={{ marginBottom: "0.75rem" }}>
          These rates are set by the platform and cannot be changed here.
        </p>
        <InfoRow label="Product commission"      value={`${p.product_commission_percent}%`} />
        <InfoRow label="Prescription commission" value={`${p.prescription_commission_percent}%`} />
        <InfoRow label="Platform fee"            value={`₹${p.platform_fee}`} />
      </section>

      {/* ── Charts ── */}
      {stats && (
        <>
          <section className="panel about-chart-panel">
            <h2>Order status breakdown</h2>
            <p className="field-help">All-time distribution of orders by status.</p>
            <DonutChart statusCounts={stats.status_counts || {}} />
          </section>
          <section className="panel about-chart-panel">
            <h2>Monthly orders — last 12 months</h2>
            <BarChart data={orderMonths} valueKey="value" labelKey="label" color="#1a7a5e" />
          </section>
          <section className="panel about-chart-panel">
            <h2>Monthly revenue — last 12 months</h2>
            <p className="field-help">Net payable amount from the settlement ledger.</p>
            <BarChart data={revenueMonths} valueKey="value" labelKey="label" color="#0ea5e9" formatValue={fmtINR} />
          </section>
        </>
      )}
    </PharmacyPageShell>
  );
}
