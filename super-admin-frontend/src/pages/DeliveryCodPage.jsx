import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, CheckCircle2, Download, IndianRupee, RefreshCw, Search } from "lucide-react";
import { DeliveryLayout } from "./DeliveryLayout.jsx";
import { clearDeliveryCod, listDeliveryAccounts, listDeliveryOrders } from "../lib/api.js";
import { exportToExcel } from "../lib/exportExcel.js";

export function DeliveryCodPage() {
  const [accounts, setAccounts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all"); // all | warned | blocked | cleared
  const [clearModal, setClearModal] = useState(null); // account object
  const [clearForm, setClearForm] = useState({ amount: "", cleared_by: "", note: "" });
  const [clearLoading, setClearLoading] = useState(false);
  const [clearError, setClearError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const [accs, ords] = await Promise.all([listDeliveryAccounts(), listDeliveryOrders()]);
      setAccounts(accs);
      setOrders(ords);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // Merge per-driver COD stats
  const driverStats = accounts.map(a => {
    const myOrders = orders.filter(o => o.account_id === a.account_id && o.status === "DELIVERED");
    const lifetimeCod = myOrders.reduce((s, o) => s + Number(o.cod_amount || 0), 0);
    return { ...a, lifetimeCod };
  });

  function applyTab(list) {
    if (tab === "warned") return list.filter(a => !a.cod_blocked && a.cod_balance >= 1000);
    if (tab === "blocked") return list.filter(a => a.cod_blocked);
    if (tab === "cleared") return list.filter(a => !a.cod_blocked && a.cod_balance === 0 && a.lifetimeCod > 0);
    return list;
  }

  const searched = driverStats.filter(a =>
    !search || a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.phone_number?.includes(search)
  );
  const displayed = applyTab(searched);

  // Summary stats
  const totalOutstanding = accounts.reduce((s, a) => s + Number(a.cod_balance || 0), 0);
  const blockedAccounts = accounts.filter(a => a.cod_blocked);
  const warnAccounts = accounts.filter(a => !a.cod_blocked && a.cod_balance >= 1000);
  const totalCodCollected = orders
    .filter(o => o.status === "DELIVERED")
    .reduce((s, o) => s + Number(o.cod_amount || 0), 0);

  function openClearModal(account) {
    setClearModal(account);
    setClearForm({ amount: Number(account.cod_balance).toFixed(0), cleared_by: "", note: "" });
    setClearError("");
  }

  async function submitClear(e) {
    e.preventDefault(); setClearError("");
    setClearLoading(true);
    try {
      const updated = await clearDeliveryCod(clearModal.account_id, {
        amount: parseFloat(clearForm.amount),
        cleared_by: clearForm.cleared_by,
        note: clearForm.note || null,
      });
      setAccounts(prev => prev.map(a => a.account_id === updated.account_id ? updated : a));
      setClearModal(null);
    } catch (e) { setClearError(e.message); }
    finally { setClearLoading(false); }
  }

  function handleExport() {
    exportToExcel([
      {
        name: "COD Summary",
        rows: driverStats.map(a => ({
          "Name": a.full_name,
          "Phone": a.phone_number,
          "Current Balance (₹)": Number(a.cod_balance).toFixed(2),
          "COD Blocked": a.cod_blocked ? "YES" : "No",
          "Lifetime COD Collected (₹)": a.lifetimeCod.toFixed(2),
          "Account Status": a.account_status,
        })),
      },
      {
        name: "All Blocked Accounts",
        rows: blockedAccounts.map(a => ({
          "Name": a.full_name,
          "Phone": a.phone_number,
          "Balance (₹)": Number(a.cod_balance).toFixed(2),
          "Blocked": "YES",
        })),
      },
    ], `cod_report_${Date.now()}.xlsx`);
  }

  return (
    <DeliveryLayout title="COD & Cash Management">
      {/* Summary KPIs */}
      <div className="dl-admin-kpi-row">
        <div className="dl-admin-kpi dl-kpi-orange">
          <IndianRupee size={20} />
          <span className="dl-kpi-num">₹{totalOutstanding.toFixed(0)}</span>
          <span>Total Outstanding</span>
        </div>
        <div className="dl-admin-kpi dl-kpi-green">
          <span className="dl-kpi-num">₹{totalCodCollected.toFixed(0)}</span>
          <span>Lifetime COD Collected</span>
        </div>
        <div className="dl-admin-kpi dl-kpi-red" onClick={() => setTab("blocked")} style={{ cursor: "pointer" }}>
          <AlertOctagon size={18} />
          <span className="dl-kpi-num">{blockedAccounts.length}</span>
          <span>Blocked Accounts</span>
        </div>
        <div className="dl-admin-kpi dl-kpi-orange" onClick={() => setTab("warned")} style={{ cursor: "pointer" }}>
          <AlertTriangle size={18} />
          <span className="dl-kpi-num">{warnAccounts.length}</span>
          <span>In Warning Zone</span>
        </div>
      </div>

      {/* Blocked accounts alert strip */}
      {blockedAccounts.length > 0 && (
        <div className="dl-cod-alert-strip">
          <AlertOctagon size={18} />
          <strong>{blockedAccounts.length} driver{blockedAccounts.length > 1 ? "s" : ""} blocked due to COD threshold:</strong>
          {blockedAccounts.map(a => (
            <span key={a.account_id} className="dl-cod-alert-name" onClick={() => openClearModal(a)}>
              {a.full_name} (₹{Number(a.cod_balance).toFixed(0)})
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="dl-admin-toolbar">
        <div className="dl-admin-search">
          <Search size={16} />
          <input placeholder="Search driver name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="dl-tab-group">
          {[
            { key: "all", label: "All Drivers" },
            { key: "warned", label: `⚠️ Warning (${warnAccounts.length})` },
            { key: "blocked", label: `🔴 Blocked (${blockedAccounts.length})` },
            { key: "cleared", label: "✅ Cleared" },
          ].map(t => (
            <button
              key={t.key}
              className={`dl-tab ${tab === t.key ? "dl-tab-active" : ""}`}
              onClick={() => setTab(t.key)}
            >{t.label}</button>
          ))}
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
                <th>Phone</th>
                <th>Current Balance</th>
                <th>Threshold Status</th>
                <th>Lifetime COD</th>
                <th>Account</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(a => (
                <tr key={a.account_id} className={a.cod_blocked ? "dl-row-blocked" : a.cod_balance >= 1000 ? "dl-row-warn" : ""}>
                  <td>
                    <Link to={`/dashboard/delivery/boys/${a.account_id}`} className="dl-admin-link">
                      {a.full_name}
                    </Link>
                  </td>
                  <td>{a.phone_number}</td>
                  <td>
                    <span className={`dl-cod-balance-inline ${a.cod_blocked ? "blocked" : a.cod_balance >= 1000 ? "warn" : ""}`}>
                      ₹{Number(a.cod_balance).toFixed(0)}
                    </span>
                    <div className="dl-cod-bar-wrap">
                      <div className="dl-cod-bar" style={{ width: `${Math.min(100, (a.cod_balance / 1200) * 100)}%`, background: a.cod_blocked ? "#ef4444" : a.cod_balance >= 1000 ? "#f59e0b" : "#22c55e" }} />
                    </div>
                  </td>
                  <td>
                    {a.cod_blocked
                      ? <span className="dl-admin-badge dl-badge-red"><AlertOctagon size={12} /> BLOCKED</span>
                      : a.cod_balance >= 1000
                      ? <span className="dl-admin-badge dl-badge-orange"><AlertTriangle size={12} /> WARNING</span>
                      : <span className="dl-admin-badge dl-badge-green"><CheckCircle2 size={12} /> OK</span>}
                  </td>
                  <td className="dl-earn-cell">₹{a.lifetimeCod.toFixed(0)}</td>
                  <td>
                    <span className={`dl-admin-badge ${a.account_status === "active" ? "dl-badge-green" : a.account_status === "pending" ? "dl-badge-yellow" : "dl-badge-red"}`}>
                      {a.account_status}
                    </span>
                  </td>
                  <td>
                    {a.cod_balance > 0 && (
                      <button className="dl-admin-btn dl-admin-btn-sm dl-admin-btn-primary" onClick={() => openClearModal(a)}>
                        <IndianRupee size={13} /> Clear
                      </button>
                    )}
                    {a.cod_balance === 0 && <span className="dl-driver-sub">—</span>}
                  </td>
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr><td colSpan={7} className="dl-admin-empty">No drivers in this category.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* COD Clear Modal */}
      {clearModal && (
        <div className="dl-modal-overlay" onClick={() => setClearModal(null)}>
          <div className="dl-modal" onClick={e => e.stopPropagation()}>
            <h3>Record COD Payment — {clearModal.full_name}</h3>
            <p>Outstanding: <strong>₹{Number(clearModal.cod_balance).toFixed(0)}</strong>
              {clearModal.cod_blocked && <span className="dl-admin-badge dl-badge-red" style={{ marginLeft: 8 }}>Blocked</span>}
            </p>
            {clearError && <div className="dl-admin-error">{clearError}</div>}
            <form onSubmit={submitClear} className="dl-modal-form">
              <label>Amount Collected (₹) *
                <input type="number" required min="1" max={clearModal.cod_balance}
                  value={clearForm.amount}
                  onChange={e => setClearForm(f => ({ ...f, amount: e.target.value }))} />
              </label>
              <label>Received By *
                <input required value={clearForm.cleared_by}
                  onChange={e => setClearForm(f => ({ ...f, cleared_by: e.target.value }))}
                  placeholder="Admin / Hub name" />
              </label>
              <label>Note
                <input value={clearForm.note}
                  onChange={e => setClearForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Receipt / reference number" />
              </label>
              <div className="dl-modal-btns">
                <button type="button" className="dl-admin-btn" onClick={() => setClearModal(null)}>Cancel</button>
                <button type="submit" className="dl-admin-btn dl-admin-btn-primary" disabled={clearLoading}>
                  {clearLoading ? <RefreshCw size={14} className="dl-spin" /> : "Confirm & Clear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DeliveryLayout>
  );
}
