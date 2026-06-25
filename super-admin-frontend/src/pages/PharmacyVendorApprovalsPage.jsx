import { useEffect, useState } from "react";
import { BackButton } from "../components/BackButton.jsx";
import {
  adminListPendingPharmacyVendors,
  adminApprovePharmacyVendor,
  adminRejectPharmacyVendor,
} from "../lib/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(/\/api\/v1$/, "");

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveDocUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/media")) return `${API_ORIGIN}${path}`;
  const clean = path.replace(/^storage\/?/, "");
  return `${API_ORIGIN}/media/${clean}`;
}

function DocLink({ label, url }) {
  const resolved = resolveDocUrl(url);
  if (!resolved) return <span style={{ color: "#94a3a0", fontSize: "0.78rem" }}>{label}: —</span>;
  return (
    <a href={resolved} target="_blank" rel="noopener noreferrer"
      style={{ color: "#0f766e", fontSize: "0.78rem", textDecoration: "underline" }}>
      {label} ↗
    </a>
  );
}

function ExifBadge({ profile }) {
  const hasExif = profile?.photo_lat != null && profile?.photo_lng != null;
  const hasRegistered = profile?.latitude != null && profile?.longitude != null;

  if (!hasExif) {
    return (
      <div style={{ marginTop: 8, padding: "6px 10px", background: "#f8f4ec", borderRadius: 8, fontSize: "0.76rem", color: "#92713a" }}>
        📷 No EXIF GPS data in store photo
      </div>
    );
  }

  let distanceBadge = null;
  if (hasRegistered) {
    const km = haversineKm(profile.latitude, profile.longitude, profile.photo_lat, profile.photo_lng);
    const distText = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
    const isFar = km > 1;
    distanceBadge = (
      <span style={{
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 100,
        fontSize: "0.74rem",
        fontWeight: 700,
        background: isFar ? "#fde8e4" : "#dff6e8",
        color: isFar ? "#8a1f11" : "#115e36",
      }}>
        {isFar ? "⚠ " : "✓ "}{distText} from registered address
      </span>
    );
  }

  const takenAt = profile.photo_taken_at
    ? new Date(profile.photo_taken_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div style={{ marginTop: 8, padding: "6px 10px", background: "#f0f7f4", borderRadius: 8, fontSize: "0.76rem", color: "#2d5a4e" }}>
      <div>
        📷 Photo GPS: {profile.photo_lat.toFixed(5)}, {profile.photo_lng.toFixed(5)}
        {distanceBadge}
      </div>
      {takenAt && <div style={{ marginTop: 2, color: "#52625f" }}>🕐 Taken: {takenAt}</div>}
    </div>
  );
}

function VendorCard({ vendor, onApprove, onReject, actioning }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "1rem", color: "#13201e" }}>{vendor.owner_name}</span>
            <span style={{ background: "#fff8ea", color: "#b45309", borderRadius: 100, padding: "3px 10px", fontSize: "0.75rem", fontWeight: 700 }}>
              Pending Approval
            </span>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#52625f", marginBottom: 2 }}>
            📞 {vendor.phone_number}{vendor.email ? ` · ✉ ${vendor.email}` : ""}
          </div>
          {vendor.profile?.store_name && (
            <div style={{ fontSize: "0.82rem", color: "#0f766e", marginBottom: 4 }}>🏪 {vendor.profile.store_name}</div>
          )}
          {vendor.profile?.license_number && (
            <div style={{ fontSize: "0.78rem", color: "#52625f", marginBottom: 4 }}>📋 Licence No: {vendor.profile.license_number}</div>
          )}
          {vendor.profile?.address_line_1 && (
            <div style={{ fontSize: "0.78rem", color: "#52625f", marginBottom: 6 }}>
              📍 {vendor.profile.address_line_1}{vendor.profile.city ? `, ${vendor.profile.city}` : ""}{vendor.profile.pincode ? ` — ${vendor.profile.pincode}` : ""}
            </div>
          )}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
            <DocLink label="Store Photo" url={vendor.profile?.store_image_url} />
            <DocLink label="Drug Licence" url={vendor.profile?.drug_licence_url} />
            <DocLink label="Owner ID / Aadhaar" url={vendor.profile?.owner_id_url} />
          </div>
          <ExifBadge profile={vendor.profile} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          {!showReject ? (
            <>
              <button
                disabled={actioning === vendor.account_id}
                onClick={() => onApprove(vendor)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#dff6e8", color: "#115e36", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
              >
                {actioning === vendor.account_id ? "…" : "✓ Approve"}
              </button>
              <button
                onClick={() => setShowReject(true)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #f2c2b8", background: "transparent", color: "#8a1f11", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
              >
                ✕ Reject
              </button>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                placeholder="Rejection reason (optional)"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4", fontSize: "0.82rem", resize: "vertical", minHeight: 60, width: 200 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  disabled={actioning === vendor.account_id}
                  onClick={() => { onReject(vendor, rejectReason); setShowReject(false); }}
                  style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: "none", background: "#fde8e4", color: "#8a1f11", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #c9d8d4", background: "transparent", color: "#52625f", cursor: "pointer", fontSize: "0.82rem" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PharmacyVendorApprovalsPage() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    adminListPendingPharmacyVendors()
      .then(setVendors)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleApprove(vendor) {
    setActioning(vendor.account_id);
    try {
      await adminApprovePharmacyVendor(vendor.account_id);
      setVendors(v => v.filter(x => x.account_id !== vendor.account_id));
      showToast(`${vendor.profile?.store_name || vendor.owner_name} approved.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setActioning(null);
    }
  }

  async function handleReject(vendor, reason) {
    setActioning(vendor.account_id);
    try {
      await adminRejectPharmacyVendor(vendor.account_id, reason);
      setVendors(v => v.filter(x => x.account_id !== vendor.account_id));
      showToast(`${vendor.profile?.store_name || vendor.owner_name} rejected.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setActioning(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f3", padding: "24px 16px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <BackButton />
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#13201e", margin: "16px 0 4px" }}>
          Pharmacy Registrations
        </h1>
        <p style={{ color: "#52625f", fontSize: "0.88rem", marginBottom: 20 }}>
          Pending pharmacy applications — review documents and approve or reject.
        </p>

        {toast && (
          <div style={{ background: "#dff6e8", color: "#115e36", padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontWeight: 600 }}>
            {toast}
          </div>
        )}
        {error && (
          <div style={{ background: "#fde8e4", color: "#8a1f11", padding: "10px 16px", borderRadius: 10, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", color: "#52625f", padding: 40 }}>Loading…</div>
        ) : vendors.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3a0", padding: 40 }}>No pending pharmacy registrations.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {vendors.map(v => (
              <VendorCard
                key={v.account_id}
                vendor={v}
                onApprove={handleApprove}
                onReject={handleReject}
                actioning={actioning}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
