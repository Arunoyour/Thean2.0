import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Download, IndianRupee, MapPin, Package, RefreshCw, UserCheck, UserX } from "lucide-react";
import { DeliveryLayout } from "./DeliveryLayout.jsx";
import { clearDeliveryCod, listDeliveryAccounts, listDeliveryOrders, setDeliveryAccountStatus, setDeliveryBoyTier, setDeliveryBoyCustomRate } from "../lib/api.js";
import { exportToExcel } from "../lib/exportExcel.js";

const STATUS_COLOR = {
  ASSIGNED_TO_DELIVERY: "#f59e0b",
  DELIVERY_ACCEPTED: "#3b82f6",
  ARRIVED_AT_STORE: "#fb923c",
  ORDER_PICKED_UP: "#8b5cf6",
  ARRIVED_AT_CUSTOMER: "#a855f7",
  DELIVERED: "#22c55e",
  DELIVERY_REJECTED: "#ef4444",
  DELIVERY_CANCELLED: "#64748b",
};

export function DeliveryBoyDetailPage() {
  const { accountId } = useParams();
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCodModal, setShowCodModal] = useState(false);
  const [codForm, setCodForm] = useState({ amount: "", cleared_by: "", note: "" });
  const [codLoading, setCodLoading] = useState(false);
  const [codError, setCodError] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState("");
  const [customRateInput, setCustomRateInput] = useState("");

  useEffect(() => { load(); }, [accountId]);

  useEffect(() => {
    if (account?.current_lat && mapRef.current) initMap();
  }, [account]);

  async function load() {
    setLoading(true); setError("");
    try {
      const [accs, allOrders] = await Promise.all([listDeliveryAccounts(), listDeliveryOrders()]);
      const acc = accs.find(a => a.account_id === accountId);
      const myOrders = allOrders.filter(o => o.account_id === accountId);
      setAccount(acc || null);
      setOrders(myOrders);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function initMap() {
    const L = window.L;
    if (!L || !mapRef.current || !account?.current_lat) return;
    const lat = Number(account.current_lat);
    const lng = Number(account.current_lng);
    if (!leafletMapRef.current) {
      leafletMapRef.current = L.map(mapRef.current).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(leafletMapRef.current);
    } else {
      leafletMapRef.current.setView([lat, lng], 15);
    }
    // Clear old markers
    leafletMapRef.current.eachLayer(l => { if (l instanceof L.Marker) l.remove(); });

    const icon = L.divIcon({
      className: "",
      html: `<div class="dl-map-marker" style="background:${account.cod_blocked ? "#ef4444" : account.is_online ? "#22c55e" : "#475569"};">🏍</div>`,
      iconSize: [36, 36], iconAnchor: [18, 18],
    });
    L.marker([lat, lng], { icon })
      .addTo(leafletMapRef.current)
      .bindPopup(`<strong>${account.full_name}</strong><br>${account.is_online ? "🟢 Online" : "⚫ Offline"}`)
      .openPopup();
  }

  async function toggleStatus() {
    if (!account) return;
    const next = account.account_status === "active" ? "disabled" : "active";
    setActionLoading(true);
    try {
      const updated = await setDeliveryAccountStatus(accountId, next);
      setAccount(updated);
    } catch (e) { setError(e.message); }
    finally { setActionLoading(false); }
  }

  async function submitCodClear(e) {
    e.preventDefault(); setCodError("");
    if (!codForm.amount || !codForm.cleared_by) { setCodError("Amount and cleared-by name are required."); return; }
    setCodLoading(true);
    try {
      const updated = await clearDeliveryCod(accountId, {
        amount: parseFloat(codForm.amount),
        cleared_by: codForm.cleared_by,
        note: codForm.note || null,
      });
      setAccount(updated);
      setShowCodModal(false);
      setCodForm({ amount: "", cleared_by: "", note: "" });
    } catch (e) { setCodError(e.message); }
    finally { setCodLoading(false); }
  }

  async function handleTierChange(tier) {
    setRateLoading(true); setRateError("");
    try {
      const updated = await setDeliveryBoyTier(accountId, tier);
      setAccount(updated);
    } catch (e) { setRateError(e.message); }
    finally { setRateLoading(false); }
  }

  async function handleSetCustomRate(e) {
    e.preventDefault(); setRateLoading(true); setRateError("");
    const val = customRateInput.trim() === "" ? null : parseFloat(customRateInput);
    if (val !== null && (isNaN(val) || val <= 0)) {
      setRateError("Enter a positive number or leave blank to revert to tier rate.");
      setRateLoading(false);
      return;
    }
    try {
      const updated = await setDeliveryBoyCustomRate(accountId, val);
      setAccount(updated);
      setCustomRateInput("");
    } catch (e) { setRateError(e.message); }
    finally { setRateLoading(false); }
  }

  function handleExport() {
    exportToExcel([
      {
        name: "Profile",
        rows: [{
          "Name": account.full_name, "Phone": account.phone_number,
          "Email": account.email || "", "Vehicle": account.vehicle_type,
          "Vehicle No.": account.vehicle_number || "", "License": account.license_number || "",
          "ID No.": account.id_number || "", "Status": account.account_status,
          "Online": account.is_online ? "Yes" : "No",
          "COD Balance (₹)": Number(account.cod_balance).toFixed(2),
          "COD Blocked": account.cod_blocked ? "Yes" : "No",
        }],
      },
      {
        name: "Orders",
        rows: orders.map(o => ({
          "Order ID": o.delivery_order_id,
          "Sector": o.sector,
          "Source Order": o.source_order_id,
          "Status": o.status,
          "Distance (km)": o.distance_km || "",
          "Earnings (₹)": o.earnings_amount || "",
          "COD Amount (₹)": o.cod_amount || 0,
          "Source": o.source_name || "",
          "Customer": o.customer_name || "",
          "Created": new Date(o.created_at).toLocaleString(),
          "Delivered": o.delivered_at ? new Date(o.delivered_at).toLocaleString() : "",
        })),
      },
    ], `driver_${account.full_name.replace(/ /g, "_")}_${Date.now()}.xlsx`);
  }

  if (loading) return (
    <DeliveryLayout>
      <div className="dl-admin-loading"><RefreshCw size={22} className="dl-spin" /> Loading driver…</div>
    </DeliveryLayout>
  );

  if (!account) return (
    <DeliveryLayout>
      <div className="dl-admin-error">Driver not found.</div>
    </DeliveryLayout>
  );

  const deliveredOrders = orders.filter(o => o.status === "DELIVERED");
  const totalEarned = deliveredOrders.reduce((s, o) => s + Number(o.earnings_amount || 0), 0);
  const totalCodCollected = deliveredOrders.reduce((s, o) => s + Number(o.cod_amount || 0), 0);

  return (
    <DeliveryLayout title={account.full_name}>
      <div className="dl-detail-header">
        <Link to="/dashboard/delivery/boys" className="dl-admin-back-link">
          <ChevronLeft size={16} /> All Drivers
        </Link>
        <div className="dl-detail-header-actions">
          {account.cod_balance > 0 && (
            <button className="dl-admin-btn dl-admin-btn-primary" onClick={() => setShowCodModal(true)}>
              <IndianRupee size={15} /> Clear COD
            </button>
          )}
          <button
            className={`dl-admin-btn ${account.account_status === "active" ? "dl-admin-btn-danger" : "dl-admin-btn-success"}`}
            onClick={toggleStatus}
            disabled={actionLoading}
          >
            {actionLoading ? <RefreshCw size={14} className="dl-spin" /> :
              account.account_status === "active" ? <><UserX size={14} /> Disable</> : <><UserCheck size={14} /> Activate</>}
          </button>
          <button className="dl-admin-btn" onClick={handleExport}><Download size={15} /> Export</button>
        </div>
      </div>

      {error && <div className="dl-admin-error">{error}</div>}

      {/* Profile + Map grid */}
      <div className="dl-detail-grid">
        {/* Profile card */}
        <div className="dl-admin-card">
          <div className="dl-card-title">Profile</div>
          <div className="dl-profile-grid">
            <div className="dl-profile-row"><span>Name</span><strong>{account.full_name}</strong></div>
            <div className="dl-profile-row"><span>Phone</span><strong>{account.phone_number}</strong></div>
            <div className="dl-profile-row"><span>Email</span><strong>{account.email || "—"}</strong></div>
            <div className="dl-profile-row"><span>Vehicle</span><strong>{account.vehicle_type} · {account.vehicle_number || "—"}</strong></div>
            <div className="dl-profile-row"><span>License</span><strong>{account.license_number || "—"}</strong></div>
            <div className="dl-profile-row"><span>ID No.</span><strong>{account.id_number || "—"}</strong></div>
            <div className="dl-profile-row"><span>Status</span>
              <span className={`dl-admin-badge ${account.account_status === "active" ? "dl-badge-green" : account.account_status === "pending" ? "dl-badge-yellow" : "dl-badge-red"}`}>
                {account.account_status}
              </span>
            </div>
            <div className="dl-profile-row"><span>Online</span>
              <span className={`dl-online-dot ${account.is_online ? "dl-online" : "dl-offline-dot"}`} style={{ marginRight: 6 }} />
              {account.is_online ? "Online" : "Offline"}
            </div>
          </div>

          <div className="dl-card-title" style={{ marginTop: 20 }}>Activity Stats</div>
          <div className="dl-stat-grid">
            <div className="dl-stat-box"><span className="dl-stat-num">{orders.length}</span><span>Total Orders</span></div>
            <div className="dl-stat-box dl-stat-green"><span className="dl-stat-num">{deliveredOrders.length}</span><span>Delivered</span></div>
            <div className="dl-stat-box"><span className="dl-stat-num">₹{totalEarned.toFixed(0)}</span><span>Total Earned</span></div>
            <div className="dl-stat-box dl-stat-orange"><span className="dl-stat-num">₹{totalCodCollected.toFixed(0)}</span><span>Total COD Collected</span></div>
          </div>

          <div className="dl-card-title" style={{ marginTop: 20 }}>COD Balance</div>
          <div className={`dl-cod-balance-box ${account.cod_blocked ? "blocked" : account.cod_balance >= 1000 ? "warn" : ""}`}>
            <span className="dl-cod-balance-num">₹{Number(account.cod_balance).toFixed(0)}</span>
            <span className="dl-cod-balance-label">
              {account.cod_blocked ? "🔴 Account Blocked — Clear Immediately" :
               account.cod_balance >= 1000 ? "⚠️ Above Threshold — Warning Active" :
               "✅ Within Limit"}
            </span>
          </div>

          <div className="dl-card-title" style={{ marginTop: 20 }}>Rate per km</div>
          {rateError && <div className="dl-admin-error" style={{ marginBottom: 8 }}>{rateError}</div>}
          <div className="dl-profile-row">
            <span>Effective Rate</span>
            <strong style={{ color: "#22c55e", fontSize: "1.1rem" }}>
              ₹{account.effective_rate != null ? Number(account.effective_rate).toFixed(2) : "—"}/km
            </strong>
          </div>
          <div className="dl-profile-row">
            <span>Custom Rate</span>
            <span>{account.custom_rate_per_km != null ? `₹${Number(account.custom_rate_per_km).toFixed(2)}/km` : <em style={{ color: "#64748b" }}>none (using tier)</em>}</span>
          </div>
          <div className="dl-profile-row" style={{ alignItems: "center" }}>
            <span>Tier</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["JUNIOR", "STANDARD", "SENIOR", "EXPERT"].map(t => (
                <button
                  key={t}
                  disabled={rateLoading}
                  onClick={() => handleTierChange(t)}
                  style={{
                    padding: "2px 10px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 600,
                    cursor: "pointer", border: "1.5px solid",
                    background: account.tier === t ? "#2563eb" : "transparent",
                    color: account.tier === t ? "#fff" : "#94a3b8",
                    borderColor: account.tier === t ? "#2563eb" : "#334155",
                  }}
                >{t}</button>
              ))}
            </div>
          </div>
          <form onSubmit={handleSetCustomRate} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <input
              type="number" step="0.01" min="0.01"
              placeholder="Custom ₹/km (blank = revert to tier)"
              value={customRateInput}
              onChange={e => setCustomRateInput(e.target.value)}
              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: "0.85rem" }}
            />
            <button type="submit" disabled={rateLoading} className="dl-admin-btn dl-admin-btn-primary" style={{ whiteSpace: "nowrap" }}>
              {rateLoading ? "Saving…" : "Set Rate"}
            </button>
            {account.custom_rate_per_km != null && (
              <button type="button" disabled={rateLoading} className="dl-admin-btn" onClick={async () => {
                setRateLoading(true); setRateError("");
                try { const u = await setDeliveryBoyCustomRate(accountId, null); setAccount(u); setCustomRateInput(""); }
                catch (e) { setRateError(e.message); }
                finally { setRateLoading(false); }
              }}>Clear</button>
            )}
          </form>
        </div>

        {/* Map card */}
        <div className="dl-admin-card dl-map-card">
          <div className="dl-card-title">
            <MapPin size={15} /> Live Location
            {account.location_updated_at && (
              <span className="dl-card-subtitle">Updated {new Date(account.location_updated_at).toLocaleTimeString()}</span>
            )}
          </div>
          {account.current_lat ? (
            <div ref={mapRef} className="dl-detail-map" />
          ) : (
            <div className="dl-admin-empty" style={{ padding: 40 }}>No GPS data available</div>
          )}
        </div>
      </div>

      {/* Orders table */}
      <div className="dl-admin-card" style={{ marginTop: 20 }}>
        <div className="dl-card-title"><Package size={15} /> Order History ({orders.length})</div>
        <div className="dl-admin-table-wrap">
          <table className="dl-admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sector</th>
                <th>Source / Customer</th>
                <th>Distance</th>
                <th>Earnings</th>
                <th>COD</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.delivery_order_id}>
                  <td className="dl-driver-sub">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td><span className="dl-admin-badge dl-badge-gray">{o.sector}</span></td>
                  <td>
                    <div>{o.source_name || "—"}</div>
                    <div className="dl-driver-sub">{o.customer_name || "—"}</div>
                  </td>
                  <td>{o.distance_km ? `${Number(o.distance_km).toFixed(1)} km` : "—"}</td>
                  <td className="dl-earn-cell">
                    ₹{o.earnings_amount ? Number(o.earnings_amount).toFixed(0) : "—"}
                    {o.surge_multiplier > 1 && (
                      <span title={o.surge_label || "Surge"} style={{ marginLeft: 4, background: "#f59e0b", color: "#fff", fontSize: "0.6rem", padding: "1px 5px", borderRadius: 99, fontWeight: 700 }}>
                        ⚡{Number(o.surge_multiplier).toFixed(2)}×
                      </span>
                    )}
                  </td>
                  <td>{o.cod_amount > 0 ? <span className="dl-cod-badge-sm">₹{Number(o.cod_amount).toFixed(0)}</span> : "—"}</td>
                  <td>
                    <span className="dl-admin-badge" style={{ background: STATUS_COLOR[o.status] + "22", color: STATUS_COLOR[o.status], border: `1px solid ${STATUS_COLOR[o.status]}` }}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={7} className="dl-admin-empty">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* COD Clear Modal */}
      {showCodModal && (
        <div className="dl-modal-overlay" onClick={() => setShowCodModal(false)}>
          <div className="dl-modal" onClick={e => e.stopPropagation()}>
            <h3>Clear COD Payment</h3>
            <p>Current balance: <strong>₹{Number(account.cod_balance).toFixed(0)}</strong></p>
            {codError && <div className="dl-admin-error">{codError}</div>}
            <form onSubmit={submitCodClear} className="dl-modal-form">
              <label>Amount Received (₹) *
                <input type="number" required min="1" max={account.cod_balance}
                  value={codForm.amount} onChange={e => setCodForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder={Number(account.cod_balance).toFixed(0)} />
              </label>
              <label>Received By *
                <input required value={codForm.cleared_by}
                  onChange={e => setCodForm(f => ({ ...f, cleared_by: e.target.value }))}
                  placeholder="Admin / Hub manager name" />
              </label>
              <label>Note (optional)
                <input value={codForm.note}
                  onChange={e => setCodForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Reference / receipt number" />
              </label>
              <div className="dl-modal-btns">
                <button type="button" className="dl-admin-btn" onClick={() => setShowCodModal(false)}>Cancel</button>
                <button type="submit" className="dl-admin-btn dl-admin-btn-primary" disabled={codLoading}>
                  {codLoading ? <RefreshCw size={14} className="dl-spin" /> : "Confirm Clear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DeliveryLayout>
  );
}
