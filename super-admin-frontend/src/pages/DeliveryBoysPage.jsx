import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle, Download, Filter, RefreshCw, Search,
  Shield, ShieldOff, UserCheck, UserX, XCircle,
} from "lucide-react";
import { DeliveryLayout } from "./DeliveryLayout.jsx";
import { listDeliveryAccounts, setDeliveryAccountStatus } from "../lib/api.js";
import { exportToExcel } from "../lib/exportExcel.js";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
];
const ONLINE_OPTIONS = [
  { value: "", label: "All" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];
const COD_OPTIONS = [
  { value: "", label: "All COD" },
  { value: "warn", label: "≥ ₹1000 (Warning)" },
  { value: "blocked", label: "COD Blocked" },
  { value: "clear", label: "Clear (₹0)" },
];
const VEHICLE_OPTIONS = [
  { value: "", label: "All Vehicles" },
  { value: "bike", label: "Bike" },
  { value: "car", label: "Car" },
  { value: "cycle", label: "Cycle" },
];

function StatusBadge({ status }) {
  const cls = status === "active" ? "dl-badge-green" : status === "pending" ? "dl-badge-yellow" : "dl-badge-red";
  return <span className={`dl-admin-badge ${cls}`}>{status}</span>;
}

function CodBadge({ balance, blocked }) {
  if (blocked) return <span className="dl-admin-badge dl-badge-red">🔴 Blocked ₹{Number(balance).toFixed(0)}</span>;
  if (balance >= 1000) return <span className="dl-admin-badge dl-badge-orange">⚠️ ₹{Number(balance).toFixed(0)}</span>;
  if (balance > 0) return <span className="dl-admin-badge dl-badge-gray">₹{Number(balance).toFixed(0)}</span>;
  return <span className="dl-admin-badge dl-badge-gray">—</span>;
}

export function DeliveryBoysPage() {
  const [accounts, setAccounts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [onlineFilter, setOnlineFilter] = useState("");
  const [codFilter, setCodFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");

  useEffect(() => { load(); }, []);
  useEffect(() => { applyFilters(); }, [accounts, search, statusFilter, onlineFilter, codFilter, vehicleFilter]);

  async function load() {
    setLoading(true); setError("");
    try { setAccounts(await listDeliveryAccounts()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function applyFilters() {
    let list = [...accounts];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.full_name?.toLowerCase().includes(q) ||
        a.phone_number?.includes(q) ||
        a.vehicle_number?.toLowerCase().includes(q) ||
        a.license_number?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter(a => a.account_status === statusFilter);
    if (onlineFilter === "online") list = list.filter(a => a.is_online);
    if (onlineFilter === "offline") list = list.filter(a => !a.is_online);
    if (codFilter === "blocked") list = list.filter(a => a.cod_blocked);
    if (codFilter === "warn") list = list.filter(a => !a.cod_blocked && a.cod_balance >= 1000);
    if (codFilter === "clear") list = list.filter(a => a.cod_balance === 0 || a.cod_balance === "0");
    if (vehicleFilter) list = list.filter(a => a.vehicle_type === vehicleFilter);
    setFiltered(list);
  }

  async function toggleStatus(account) {
    const next = account.account_status === "active" ? "disabled" : "active";
    setActionLoading(account.account_id);
    try {
      const updated = await setDeliveryAccountStatus(account.account_id, next);
      setAccounts(prev => prev.map(a => a.account_id === updated.account_id ? updated : a));
    } catch (e) { setError(e.message); }
    finally { setActionLoading(null); }
  }

  function handleExport() {
    const rows = filtered.map(a => ({
      "Name": a.full_name,
      "Phone": a.phone_number,
      "Email": a.email || "",
      "Vehicle": a.vehicle_type,
      "Vehicle No.": a.vehicle_number || "",
      "License No.": a.license_number || "",
      "ID No.": a.id_number || "",
      "Status": a.account_status,
      "Online": a.is_online ? "Yes" : "No",
      "COD Balance (₹)": Number(a.cod_balance || 0).toFixed(2),
      "COD Blocked": a.cod_blocked ? "Yes" : "No",
      "Registered": a.created_at ? new Date(a.created_at).toLocaleDateString() : "",
    }));
    exportToExcel([{ name: "Delivery Boys", rows }], `delivery_boys_${Date.now()}.xlsx`);
  }

  const stats = {
    total: accounts.length,
    active: accounts.filter(a => a.account_status === "active").length,
    pending: accounts.filter(a => a.account_status === "pending").length,
    disabled: accounts.filter(a => a.account_status === "disabled").length,
    blocked: accounts.filter(a => a.cod_blocked).length,
    warn: accounts.filter(a => !a.cod_blocked && a.cod_balance >= 1000).length,
  };

  return (
    <DeliveryLayout title="Delivery Boys">
      {/* KPI cards */}
      <div className="dl-admin-kpi-row">
        <div className="dl-admin-kpi"><span className="dl-kpi-num">{stats.total}</span><span>Total</span></div>
        <div className="dl-admin-kpi dl-kpi-green"><span className="dl-kpi-num">{stats.active}</span><span>Active</span></div>
        <div className="dl-admin-kpi dl-kpi-yellow"><span className="dl-kpi-num">{stats.pending}</span><span>Pending</span></div>
        <div className="dl-admin-kpi dl-kpi-red"><span className="dl-kpi-num">{stats.disabled}</span><span>Disabled</span></div>
        <div className="dl-admin-kpi dl-kpi-red"><span className="dl-kpi-num">{stats.blocked}</span><span>COD Blocked</span></div>
        <div className="dl-admin-kpi dl-kpi-orange"><span className="dl-kpi-num">{stats.warn}</span><span>COD ≥ ₹1000</span></div>
      </div>

      {/* Toolbar */}
      <div className="dl-admin-toolbar">
        <div className="dl-admin-search">
          <Search size={16} />
          <input
            placeholder="Search name, phone, vehicle, license…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="dl-admin-filters">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={onlineFilter} onChange={e => setOnlineFilter(e.target.value)}>
            {ONLINE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={codFilter} onChange={e => setCodFilter(e.target.value)}>
            {COD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}>
            {VEHICLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="dl-admin-actions">
          <button className="dl-admin-btn" onClick={load}><RefreshCw size={15} /> Refresh</button>
          <button className="dl-admin-btn dl-admin-btn-primary" onClick={handleExport}><Download size={15} /> Export</button>
        </div>
      </div>

      {error && <div className="dl-admin-error">{error}</div>}

      {loading ? (
        <div className="dl-admin-loading"><RefreshCw size={22} className="dl-spin" /> Loading…</div>
      ) : (
        <div className="dl-admin-table-wrap">
          <table className="dl-admin-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Contact</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Online</th>
                <th>COD</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.account_id} className={a.cod_blocked ? "dl-row-blocked" : ""}>
                  <td>
                    <Link to={`/dashboard/delivery/boys/${a.account_id}`} className="dl-admin-link">
                      <div className="dl-driver-name">{a.full_name}</div>
                      <div className="dl-driver-sub">{a.license_number || "No license on file"}</div>
                    </Link>
                  </td>
                  <td>
                    <div>{a.phone_number}</div>
                    {a.email && <div className="dl-driver-sub">{a.email}</div>}
                  </td>
                  <td>
                    <div>{a.vehicle_type}</div>
                    {a.vehicle_number && <div className="dl-driver-sub">{a.vehicle_number}</div>}
                  </td>
                  <td><StatusBadge status={a.account_status} /></td>
                  <td>
                    <span className={`dl-online-dot ${a.is_online ? "dl-online" : "dl-offline-dot"}`} />
                    {a.is_online ? "Online" : "Offline"}
                  </td>
                  <td><CodBadge balance={a.cod_balance} blocked={a.cod_blocked} /></td>
                  <td className="dl-driver-sub">{a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="dl-admin-row-actions">
                      <Link to={`/dashboard/delivery/boys/${a.account_id}`} className="dl-admin-btn dl-admin-btn-sm">
                        View
                      </Link>
                      {a.account_status !== "pending" && (
                        <button
                          className={`dl-admin-btn dl-admin-btn-sm ${a.account_status === "active" ? "dl-admin-btn-danger" : "dl-admin-btn-success"}`}
                          onClick={() => toggleStatus(a)}
                          disabled={actionLoading === a.account_id}
                        >
                          {actionLoading === a.account_id ? <RefreshCw size={13} className="dl-spin" /> :
                            a.account_status === "active" ? <><UserX size={13} /> Disable</> : <><UserCheck size={13} /> Activate</>}
                        </button>
                      )}
                      {a.account_status === "pending" && (
                        <button
                          className="dl-admin-btn dl-admin-btn-sm dl-admin-btn-success"
                          onClick={async () => {
                            setActionLoading(a.account_id);
                            try {
                              const updated = await setDeliveryAccountStatus(a.account_id, "active");
                              setAccounts(prev => prev.map(x => x.account_id === updated.account_id ? updated : x));
                            } catch (e) { setError(e.message); }
                            finally { setActionLoading(null); }
                          }}
                          disabled={actionLoading === a.account_id}
                        >
                          <UserCheck size={13} /> Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="dl-admin-empty">No delivery boys match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </DeliveryLayout>
  );
}
