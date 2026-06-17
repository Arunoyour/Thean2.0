import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, RefreshCw, Search } from "lucide-react";
import { DeliveryLayout } from "./DeliveryLayout.jsx";
import { listDeliveryOrders } from "../lib/api.js";
import { exportToExcel } from "../lib/exportExcel.js";
import { BackButton } from "../components/BackButton.jsx";

const STATUS_COLOR = {
  ASSIGNED_TO_DELIVERY: "#f59e0b",
  DELIVERY_ACCEPTED:    "#3b82f6",
  ARRIVED_AT_STORE:     "#fb923c",
  ORDER_PICKED_UP:      "#8b5cf6",
  ARRIVED_AT_CUSTOMER:  "#a855f7",
  DELIVERED:            "#22c55e",
  DELIVERY_REJECTED:    "#ef4444",
  DELIVERY_CANCELLED:   "#64748b",
};

const ALL_STATUSES = Object.keys(STATUS_COLOR);

const SECTOR_OPTIONS = ["", "pharmacy", "food", "fish", "grocery", "other"];

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || "#64748b";
  return (
    <span className="dl-admin-badge" style={{ background: color + "22", color, border: `1px solid ${color}` }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function DeliveryOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [codFilter, setCodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { load(); }, []);
  useEffect(() => { applyFilters(); }, [orders, search, statusFilter, sectorFilter, codFilter, dateFrom, dateTo]);

  async function load() {
    setLoading(true); setError("");
    try { setOrders(await listDeliveryOrders()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function applyFilters() {
    let list = [...orders];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.source_name?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.delivery_order_id?.toLowerCase().includes(q) ||
        o.source_order_id?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter(o => o.status === statusFilter);
    if (sectorFilter) list = list.filter(o => o.sector === sectorFilter);
    if (codFilter === "cod") list = list.filter(o => o.cod_amount > 0);
    if (codFilter === "prepaid") list = list.filter(o => !o.cod_amount || o.cod_amount === 0);
    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00");
      list = list.filter(o => new Date(o.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      list = list.filter(o => new Date(o.created_at) <= to);
    }
    setFiltered(list);
  }

  function handleExport() {
    const rows = filtered.map(o => ({
      "Order ID": o.delivery_order_id,
      "Sector": o.sector,
      "Source Order ID": o.source_order_id,
      "Source": o.source_name || "",
      "Customer": o.customer_name || "",
      "Driver ID": o.account_id,
      "Status": o.status,
      "Distance (km)": o.distance_km || "",
      "Earnings (₹)": o.earnings_amount || "",
      "COD Amount (₹)": o.cod_amount || 0,
      "Created": new Date(o.created_at).toLocaleString(),
      "Accepted": o.accepted_at ? new Date(o.accepted_at).toLocaleString() : "",
      "Picked Up": o.picked_up_at ? new Date(o.picked_up_at).toLocaleString() : "",
      "Delivered": o.delivered_at ? new Date(o.delivered_at).toLocaleString() : "",
      "Rejected": o.rejected_at ? new Date(o.rejected_at).toLocaleString() : "",
    }));
    exportToExcel([{ name: "Delivery Orders", rows }], `delivery_orders_${Date.now()}.xlsx`);
  }

  const totalCod = filtered.filter(o => o.status === "DELIVERED").reduce((s, o) => s + Number(o.cod_amount || 0), 0);
  const totalEarnings = filtered.filter(o => o.status === "DELIVERED").reduce((s, o) => s + Number(o.earnings_amount || 0), 0);
  const delivered = filtered.filter(o => o.status === "DELIVERED").length;
  const active = filtered.filter(o => !["DELIVERED","DELIVERY_REJECTED","DELIVERY_CANCELLED"].includes(o.status)).length;

  return (
    <DeliveryLayout title="Delivery Orders">
      <div className="dl-admin-kpi-row">
        <div className="dl-admin-kpi"><span className="dl-kpi-num">{filtered.length}</span><span>Shown</span></div>
        <div className="dl-admin-kpi dl-kpi-blue"><span className="dl-kpi-num">{active}</span><span>In Progress</span></div>
        <div className="dl-admin-kpi dl-kpi-green"><span className="dl-kpi-num">{delivered}</span><span>Delivered</span></div>
        <div className="dl-admin-kpi dl-kpi-orange"><span className="dl-kpi-num">₹{totalCod.toFixed(0)}</span><span>COD Collected</span></div>
        <div className="dl-admin-kpi dl-kpi-green"><span className="dl-kpi-num">₹{totalEarnings.toFixed(0)}</span><span>Driver Earnings</span></div>
      </div>

      <div className="dl-admin-toolbar">
        <div className="dl-admin-search">
          <Search size={16} />
          <input placeholder="Search order ID, source, customer…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="dl-admin-filters">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
            <option value="">All Sectors</option>
            {SECTOR_OPTIONS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={codFilter} onChange={e => setCodFilter(e.target.value)}>
            <option value="">COD + Prepaid</option>
            <option value="cod">COD Only</option>
            <option value="prepaid">Prepaid Only</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
        </div>
        <div className="dl-admin-actions">
          <button className="dl-admin-btn" onClick={load}><RefreshCw size={15} /> Refresh</button>
          <button className="dl-admin-btn dl-admin-btn-primary" onClick={handleExport}><Download size={15} /> Export</button>
        </div>
      </div>

      {error && <div className="dl-admin-error">{error}</div>}

      {loading ? (
        <div className="dl-admin-loading"><RefreshCw size={22} className="dl-spin" /> Loading orders…</div>
      ) : (
        <div className="dl-admin-table-wrap">
          <table className="dl-admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sector</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Distance</th>
                <th>Earnings</th>
                <th>COD</th>
                <th>Status</th>
                <th>Timeline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.delivery_order_id}>
                  <td className="dl-driver-sub">{new Date(o.created_at).toLocaleDateString()}<br />{new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                  <td><span className="dl-admin-badge dl-badge-gray">{o.sector}</span></td>
                  <td>
                    <div className="dl-route-cell">
                      <span>🏪 {o.source_name || "—"}</span>
                      <span className="dl-route-arrow">→</span>
                      <span>👤 {o.customer_name || "—"}</span>
                    </div>
                    <div className="dl-driver-sub">{o.source_address || ""}</div>
                  </td>
                  <td>
                    <Link to={`/dashboard/delivery/boys/${o.account_id}`} className="dl-admin-link">
                      {o.account_id?.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>{o.distance_km ? `${Number(o.distance_km).toFixed(1)} km` : "—"}</td>
                  <td className="dl-earn-cell">
                    {o.earnings_amount ? `₹${Number(o.earnings_amount).toFixed(0)}` : "—"}
                    {o.surge_multiplier > 1 && (
                      <span title={o.surge_label || "Surge"} style={{ marginLeft: 4, background: "#f59e0b", color: "#fff", fontSize: "0.6rem", padding: "1px 5px", borderRadius: 99, fontWeight: 700 }}>
                        ⚡{Number(o.surge_multiplier).toFixed(2)}×
                      </span>
                    )}
                  </td>
                  <td>{o.cod_amount > 0 ? <span className="dl-cod-badge-sm">₹{Number(o.cod_amount).toFixed(0)}</span> : <span className="dl-driver-sub">Prepaid</span>}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>
                    <div className="dl-timeline-mini">
                      {o.accepted_at && <span title="Accepted">✅</span>}
                      {o.arrived_at_store_at && <span title="At Store">🏪</span>}
                      {o.picked_up_at && <span title="Picked Up">📦</span>}
                      {o.arrived_at_customer_at && <span title="At Customer">🚪</span>}
                      {o.delivered_at && <span title="Delivered">🎉</span>}
                      {o.rejected_at && <span title="Rejected">❌</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="dl-admin-empty">No orders match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </DeliveryLayout>
  );
}
