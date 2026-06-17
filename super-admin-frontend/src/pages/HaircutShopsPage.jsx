import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminListHaircutShops,
  adminSetHaircutShopStatus,
  adminListHaircutVendors,
  adminApproveHaircutVendor,
  adminRejectHaircutVendor,
} from "../lib/api.js";
import { BackButton } from "../components/BackButton.jsx";

const SHOP_STATUS_BADGE = {
  pending:   { bg: "#fff8ea", color: "#b45309", label: "Pending" },
  active:    { bg: "#dff6e8", color: "#115e36", label: "Active" },
  suspended: { bg: "#fde8e4", color: "#8a1f11", label: "Suspended" },
};

const VENDOR_STATUS_BADGE = {
  pending:  { bg: "#fff8ea", color: "#b45309", label: "Pending Approval" },
  active:   { bg: "#dff6e8", color: "#115e36", label: "Approved" },
  rejected: { bg: "#fde8e4", color: "#8a1f11", label: "Rejected" },
};

function Badge({ status, map }) {
  const s = map[status] || { bg: "#eef3f1", color: "#52625f", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 100, padding: "3px 10px", fontSize: "0.75rem", fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(/\/api\/v1$/, "");

// Older rows store a raw filesystem path (e.g. "storage/haircut/..."); newer ones
// store a proper "/media/..." URL. Handle both until existing data is backfilled.
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

function VendorCard({ vendor, onApprove, onReject, actioning }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "1rem", color: "#13201e" }}>{vendor.full_name}</span>
            <Badge status={vendor.account_status} map={VENDOR_STATUS_BADGE} />
          </div>
          <div style={{ fontSize: "0.82rem", color: "#52625f", marginBottom: 2 }}>
            📞 {vendor.phone}{vendor.email ? ` · ✉ ${vendor.email}` : ""}
          </div>
          {vendor.owner_address && (
            <div style={{ fontSize: "0.78rem", color: "#52625f", marginBottom: 4 }}>📍 {vendor.owner_address}</div>
          )}
          {vendor.shop_name && (
            <div style={{ fontSize: "0.82rem", color: "#0f766e", marginBottom: 6 }}>🏪 {vendor.shop_name}</div>
          )}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
            <DocLink label="Shop Licence" url={vendor.licence_url} />
            <DocLink label="Owner ID / Aadhaar" url={vendor.owner_id_url} />
            {vendor.shop_image_url && <DocLink label="Shop Photo" url={vendor.shop_image_url} />}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3a0", marginTop: 6 }}>
            Registered {new Date(vendor.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>

        {vendor.account_status === "pending" && (
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
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9d8d4", background: "#ffffff", color: "#13201e", fontSize: "0.82rem", resize: "vertical", minHeight: 60, width: 200 }}
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
        )}
      </div>
    </div>
  );
}

export function HaircutShopsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("approvals");
  const [shops, setShops] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [shopFilter, setShopFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState(null);

  async function loadShops(f = shopFilter) {
    setLoading(true); setError("");
    try { setShops(await adminListHaircutShops(f === "all" ? "" : f)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function loadVendors(f = vendorFilter) {
    setLoading(true); setError("");
    try { setVendors(await adminListHaircutVendors(f === "all" ? "" : f)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (tab === "approvals") loadVendors(vendorFilter);
    else loadShops(shopFilter);
  }, [tab, shopFilter, vendorFilter]);

  async function handleApprove(vendor) {
    if (!confirm(`Approve "${vendor.full_name}"? This will activate their shop.`)) return;
    setActioning(vendor.account_id);
    try {
      const updated = await adminApproveHaircutVendor(vendor.account_id);
      setVendors(v => v.map(x => x.account_id === updated.account_id ? updated : x));
    } catch (err) { setError(err.message); }
    finally { setActioning(null); }
  }

  async function handleReject(vendor, reason) {
    setActioning(vendor.account_id);
    try {
      const updated = await adminRejectHaircutVendor(vendor.account_id, reason);
      setVendors(v => v.map(x => x.account_id === updated.account_id ? updated : x));
    } catch (err) { setError(err.message); }
    finally { setActioning(null); }
  }

  async function handleShopStatus(shop, newStatus) {
    if (!confirm(`Set "${shop.shop_name}" to ${newStatus}?`)) return;
    setActioning(shop.shop_id);
    try {
      const updated = await adminSetHaircutShopStatus(shop.shop_id, newStatus);
      setShops(s => s.map(x => x.shop_id === updated.shop_id ? { ...x, ...updated } : x));
    } catch (err) { setError(err.message); }
    finally { setActioning(null); }
  }

  const pendingCount = tab === "approvals"
    ? vendors.filter(v => v.account_status === "pending").length
    : 0;

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <BackButton to="/dashboard" />
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 20px", color: "#13201e" }}>✂️ Haircut Management</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #dce6e3" }}>
        {[
          { key: "approvals", label: `Vendor Approvals${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          { key: "shops", label: "All Shops" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 22px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.88rem",
            background: "transparent",
            color: tab === t.key ? "#0f766e" : "#52625f",
            borderBottom: tab === t.key ? "2px solid #0f766e" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: "#fde8e4", color: "#8a1f11", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {/* Approvals tab */}
      {tab === "approvals" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["pending", "active", "rejected", "all"].map(f => (
              <button key={f} onClick={() => setVendorFilter(f)} style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem",
                background: vendorFilter === f ? "#0f766e" : "#eef3f1",
                color: vendorFilter === f ? "#fff" : "#52625f",
              }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: "#52625f", padding: 40, textAlign: "center" }}>Loading…</div>
          ) : vendors.length === 0 ? (
            <div style={{ color: "#52625f", padding: 40, textAlign: "center", background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14 }}>
              No vendor registrations found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
        </>
      )}

      {/* Shops tab */}
      {tab === "shops" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["all", "pending", "active", "suspended"].map(f => (
              <button key={f} onClick={() => setShopFilter(f)} style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem",
                background: shopFilter === f ? "#0f766e" : "#eef3f1",
                color: shopFilter === f ? "#fff" : "#52625f",
              }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: "#52625f", padding: 40, textAlign: "center" }}>Loading…</div>
          ) : shops.length === 0 ? (
            <div style={{ color: "#52625f", padding: 40, textAlign: "center", background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14 }}>
              No shops found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {shops.map(shop => (
                <div key={shop.shop_id} style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "1rem", color: "#13201e" }}>{shop.shop_name}</span>
                        <Badge status={shop.shop_status} map={SHOP_STATUS_BADGE} />
                      </div>
                      {shop.owner_name && (
                        <div style={{ fontSize: "0.82rem", color: "#0f766e", marginBottom: 2 }}>
                          Owner: {shop.owner_name}{shop.owner_phone ? ` · ${shop.owner_phone}` : ""}
                        </div>
                      )}
                      <div style={{ fontSize: "0.83rem", color: "#52625f" }}>
                        {shop.address_line || "No address"}{shop.pin_code ? ` — ${shop.pin_code}` : ""} · {shop.total_chairs} chair{shop.total_chairs !== 1 ? "s" : ""}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#94a3a0", marginTop: 2 }}>
                        Registered {new Date(shop.created_at).toLocaleDateString("en-IN")}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => navigate(`/haircut/shops/${shop.shop_id}`)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #c9d8d4", background: "transparent", color: "#52625f", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
                      >
                        View Detail
                      </button>
                      {shop.shop_status !== "active" && (
                        <button
                          disabled={actioning === shop.shop_id}
                          onClick={() => handleShopStatus(shop, "active")}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#dff6e8", color: "#115e36", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}
                        >
                          Activate
                        </button>
                      )}
                      {shop.shop_status === "active" && (
                        <button
                          disabled={actioning === shop.shop_id}
                          onClick={() => handleShopStatus(shop, "suspended")}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#fde8e4", color: "#8a1f11", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
