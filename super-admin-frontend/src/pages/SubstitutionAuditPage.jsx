import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, LogOut, RefreshCw, XCircle } from "lucide-react";

import { getCurrentAdmin, getSubstitutionAuditOrders, logoutAdmin } from "../lib/api.js";
import { exportRowsToExcel } from "../lib/listingUtils.js";
import { BackButton } from "../components/BackButton.jsx";

function formatStatus(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function SubstitutionAuditPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | approved | denied

  useEffect(() => {
    getCurrentAdmin()
      .then(setAdmin)
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);

  async function loadOrders() {
    setIsLoading(true);
    setError("");
    try {
      const data = await getSubstitutionAuditOrders();
      setOrders(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    if (filterStatus === "approved") return orders.filter((o) => o.substitution_allowed === true);
    if (filterStatus === "denied") return orders.filter((o) => o.substitution_allowed === false);
    return orders;
  }, [orders, filterStatus]);

  function handleExport() {
    const rows = filteredOrders.map((o) => ({
      "Order ID": o.order_id,
      "Patient Name": o.patient_name || "—",
      "Pharmacy": o.pharmacy_name || "—",
      "City": o.pharmacy_city || "—",
      "Order Status": formatStatus(o.status),
      "Substitution Decision": o.substitution_allowed ? "Approved" : "Not Approved",
      "Decision Time": formatDate(o.substitution_decided_at),
      "Order Created": formatDate(o.created_at),
    }));
    exportRowsToExcel(rows, "substitution_audit");
  }

  function handleLogout() {
    logoutAdmin();
    navigate("/login", { replace: true });
  }

  return (
    <div className="portal-layout">
      <header className="portal-topbar">
        <strong>Thean Admin</strong>
        {admin ? <span>{admin.full_name}</span> : null}
        <button className="outline-button" type="button" onClick={handleLogout}>
          <LogOut size={16} /> Logout
        </button>
      </header>

      <main className="portal-main">
        <header className="portal-header">
          <div>
            <button className="outline-button" type="button" onClick={() => navigate("/dashboard/pharmacy")}>
              <ArrowLeft size={16} /> Pharmacy
            </button>
            <p className="eyebrow" style={{ marginTop: 12 }}>Audit Log</p>
            <h1>Medicine Substitution Decisions</h1>
            <p>All orders where a customer decided whether to allow an alternative medicine.</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="outline-button" type="button" onClick={loadOrders}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button className="outline-button" type="button" onClick={handleExport} disabled={!filteredOrders.length}>
              <Download size={16} /> Export
            </button>
          </div>
        </header>

        {/* KPI chips */}
        <section className="substitution-audit-chips">
          <button
            type="button"
            className={`substitution-chip ${filterStatus === "all" ? "substitution-chip-active" : ""}`}
            onClick={() => setFilterStatus("all")}
          >
            <span>All decisions</span>
            <strong>{orders.length}</strong>
          </button>
          <button
            type="button"
            className={`substitution-chip substitution-chip-approved ${filterStatus === "approved" ? "substitution-chip-active" : ""}`}
            onClick={() => setFilterStatus("approved")}
          >
            <CheckCircle2 size={16} />
            <span>Approved</span>
            <strong>{orders.filter((o) => o.substitution_allowed === true).length}</strong>
          </button>
          <button
            type="button"
            className={`substitution-chip substitution-chip-denied ${filterStatus === "denied" ? "substitution-chip-active" : ""}`}
            onClick={() => setFilterStatus("denied")}
          >
            <XCircle size={16} />
            <span>Not Approved</span>
            <strong>{orders.filter((o) => o.substitution_allowed === false).length}</strong>
          </button>
        </section>

        {error ? <div className="error">{error}</div> : null}

        {isLoading ? (
          <section className="panel loading-panel">
            <RefreshCw size={20} aria-hidden="true" /> Loading audit log…
          </section>
        ) : (
          <section className="substitution-audit-table-wrap">
            {filteredOrders.length === 0 ? (
              <div className="panel">No substitution decisions recorded yet.</div>
            ) : (
              <table className="substitution-audit-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Pharmacy</th>
                    <th>Order Status</th>
                    <th>Decision</th>
                    <th>Decision Time</th>
                    <th>Order Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.order_id}>
                      <td>{order.patient_name || "—"}</td>
                      <td>
                        {order.pharmacy_name || "—"}
                        {order.pharmacy_city ? <span className="table-sub">{order.pharmacy_city}</span> : null}
                      </td>
                      <td>
                        <span className={`admin-status-badge status-${order.status.toLowerCase()}`}>
                          {formatStatus(order.status)}
                        </span>
                      </td>
                      <td>
                        {order.substitution_allowed === true ? (
                          <span className="substitution-audit-badge substitution-audit-badge-approved">
                            <CheckCircle2 size={14} /> Approved
                          </span>
                        ) : (
                          <span className="substitution-audit-badge substitution-audit-badge-denied">
                            <XCircle size={14} /> Not Approved
                          </span>
                        )}
                      </td>
                      <td className="table-timestamp">{formatDate(order.substitution_decided_at)}</td>
                      <td className="table-timestamp">{formatDate(order.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
