import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileAudio,
  FileImage,
  QrCode,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { fetchAdminOrderMedia, listAllPharmacyOrders } from "../lib/api.js";
import { exportRowsToExcel } from "../lib/listingUtils.js";

const PAGE_SIZE = 25;

const STATUS_LABELS = {
  PENDING_CUSTOMER_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  ASSIGNED_TO_PHARMACY: "Assigned",
  PHARMACY_ACCEPTED: "Accepted",
  PENDING_PRICE_REVIEW: "Pending Price Review",
  PRICE_APPROVED: "Price Approved",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const STATUS_CLASS = {
  PENDING_CUSTOMER_APPROVAL: "badge-yellow",
  APPROVED: "badge-blue",
  ASSIGNED_TO_PHARMACY: "badge-yellow",
  PHARMACY_ACCEPTED: "badge-blue",
  PENDING_PRICE_REVIEW: "badge-pink",
  PRICE_APPROVED: "badge-green",
  READY_FOR_PICKUP: "badge-purple",
  COMPLETED: "badge-green",
  REJECTED: "badge-red",
  CANCELLED: "badge-red",
};

function fmt(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString();
}

function fmtDate(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString();
}

function secondsLeft(deadline) {
  if (!deadline) return null;
  const s = Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000);
  return s > 0 ? s : 0;
}

function fmtCountdown(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Media panel ────────────────────────────────────────────────────────────
function AdminMediaPanel({ order }) {
  const [media, setMedia] = useState({ prescriptions: [], voice: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const objectUrlsRef = useRef([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    return () => objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  async function loadMedia() {
    if (loaded) return;
    setLoading(true);
    setError("");
    try {
      const prescriptions = await Promise.all(
        (order.prescription_files || []).map(async (f) => {
          // Extract userId / mediaId / filename from pharmacy_url path
          // path: /pharmacy/orders/media/{userId}/{mediaId}/{filename}
          const parts = f.pharmacy_url.split("/");
          const filename = parts[parts.length - 1];
          const mediaId = parts[parts.length - 2];
          const userId = parts[parts.length - 3];
          const blob = await fetchAdminOrderMedia(order.order_id, userId, mediaId, filename);
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.push(url);
          return { ...f, objectUrl: url };
        }),
      );
      let voice = null;
      if (order.voice_note_file?.pharmacy_url) {
        const vp = order.voice_note_file.pharmacy_url.split("/");
        const blob = await fetchAdminOrderMedia(
          order.order_id,
          vp[vp.length - 3],
          vp[vp.length - 2],
          vp[vp.length - 1],
        );
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        voice = { ...order.voice_note_file, objectUrl: url };
      }
      setMedia({ prescriptions, voice });
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const hasMedia = Boolean((order.prescription_files || []).length || order.voice_note_file);
  if (!hasMedia) return <p className="admin-dim">No attachments.</p>;

  return (
    <div className="admin-media-panel">
      {!loaded && !loading ? (
        <button className="outline-button button-small" type="button" onClick={loadMedia}>
          Load Attachments
        </button>
      ) : null}
      {loading ? <p className="admin-dim">Loading media…</p> : null}
      {error ? <p className="form-message form-message-error">{error}</p> : null}
      {media.prescriptions.length > 0 ? (
        <div className="admin-media-grid">
          {media.prescriptions.map((f) =>
            f.content_type === "application/pdf" ? (
              <a key={f.filename} href={f.objectUrl} target="_blank" rel="noreferrer" className="admin-media-pdf">
                <FileImage size={16} /> {f.original_name || "PDF"}
              </a>
            ) : (
              <a key={f.filename} href={f.objectUrl} target="_blank" rel="noreferrer">
                <img src={f.objectUrl} alt={f.original_name || "Prescription"} className="admin-media-thumb" />
              </a>
            ),
          )}
        </div>
      ) : null}
      {media.voice ? (
        <div className="admin-voice-row">
          <FileAudio size={16} />
          <audio controls src={media.voice.objectUrl}><track kind="captions" /></audio>
        </div>
      ) : null}
    </div>
  );
}

// ── Order detail drawer ────────────────────────────────────────────────────
function OrderDetailDrawer({ order, onClose }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const priceReviewSecs = useMemo(() => {
    if (order.status !== "PENDING_PRICE_REVIEW" || !order.customer_review_deadline_at) return null;
    return Math.max(0, Math.ceil((new Date(order.customer_review_deadline_at).getTime() - now) / 1000));
  }, [order, now]);

  return (
    <div className="admin-drawer-overlay" role="dialog" aria-modal="true">
      <div className="admin-drawer">
        <div className="admin-drawer-header">
          <div>
            <p className="eyebrow">Order Detail</p>
            <h2>{order.patient_name || "Customer"} — {order.pharmacy_name || "Pharmacy"}</h2>
            <span className={`admin-status-badge ${STATUS_CLASS[order.status] || "badge-yellow"}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>
          <button className="outline-button button-small" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="admin-drawer-body">
          {/* Pickup code */}
          {order.status === "READY_FOR_PICKUP" && order.pickup_code ? (
            <div className="admin-pickup-code-box">
              <QrCode size={20} />
              <span>Pickup Code:</span>
              <strong className="admin-pickup-code">{order.pickup_code}</strong>
              <span className="admin-dim">Generated {fmt(order.pickup_code_generated_at)}</span>
            </div>
          ) : null}

          {/* Price review timer */}
          {order.status === "PENDING_PRICE_REVIEW" ? (
            <div className="admin-price-review-box">
              <Clock3 size={16} />
              <span>
                Customer reviewing estimated price <strong>₹{order.estimated_amount}</strong>
                {priceReviewSecs !== null
                  ? ` — ${fmtCountdown(priceReviewSecs)} left`
                  : ""}
              </span>
            </div>
          ) : null}

          {/* Core fields */}
          <section className="admin-section">
            <h3>Order Info</h3>
            <dl className="admin-dl">
              <div><dt>Order ID</dt><dd className="mono">{order.order_id}</dd></div>
              <div><dt>Created</dt><dd>{fmt(order.created_at)}</dd></div>
              <div><dt>Status</dt><dd>{STATUS_LABELS[order.status] || order.status}</dd></div>
              <div><dt>Billing mode</dt><dd>{order.notes?.billing_mode === "manual" ? "Manual estimate" : "Auto approve"}</dd></div>
              <div><dt>Patient</dt><dd>{order.patient_name || "—"}</dd></div>
              <div><dt>Doctor</dt><dd>{order.doctor_name || "Self"}</dd></div>
            </dl>
          </section>

          {/* Pharmacy */}
          <section className="admin-section">
            <h3>Pharmacy</h3>
            <dl className="admin-dl">
              <div><dt>Name</dt><dd>{order.pharmacy_name || "—"}</dd></div>
              <div><dt>City</dt><dd>{order.pharmacy_city || "—"}</dd></div>
              <div><dt>Pincode</dt><dd>{order.pharmacy_pincode || "—"}</dd></div>
              <div><dt>Assigned</dt><dd>{fmt(order.assigned_at)}</dd></div>
              <div><dt>Accept deadline</dt><dd>{fmt(order.pharmacy_action_deadline_at)}</dd></div>
              <div><dt>Accepted at</dt><dd>{fmt(order.accepted_at)}</dd></div>
            </dl>
          </section>

          {/* Pricing */}
          <section className="admin-section">
            <h3>Pricing</h3>
            <dl className="admin-dl">
              <div><dt>Estimated amount</dt><dd>{order.estimated_amount ? `₹${order.estimated_amount}` : "—"}</dd></div>
              <div><dt>Final amount</dt><dd>{order.final_amount ? `₹${order.final_amount}` : "—"}</dd></div>
              <div><dt>Customer review deadline</dt><dd>{fmt(order.customer_review_deadline_at)}</dd></div>
            </dl>
          </section>

          {/* Substitution */}
          <section className="admin-section">
            <h3>Substitution</h3>
            <dl className="admin-dl">
              <div>
                <dt>Decision</dt>
                <dd>
                  {order.substitution_allowed === true ? (
                    <span className="admin-status-badge badge-green"><CheckCircle2 size={13} /> Approved</span>
                  ) : order.substitution_allowed === false ? (
                    <span className="admin-status-badge badge-red"><XCircle size={13} /> Not Allowed</span>
                  ) : "Not set"}
                </dd>
              </div>
              <div><dt>Decided at</dt><dd>{fmt(order.substitution_decided_at)}</dd></div>
            </dl>
          </section>

          {/* Medicines */}
          <section className="admin-section">
            <h3>Typed Medicines</h3>
            {order.items?.length ? (
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Qty</th><th>Unit</th></tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.metric}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="admin-dim">No typed medicines — see attachments.</p>}
          </section>

          {/* Bill items */}
          {order.bill_items?.length ? (
            <section className="admin-section">
              <h3>Final Bill Items</h3>
              <table className="admin-table">
                <thead>
                  <tr><th>Medicine</th><th>Qty</th><th>Type</th><th>Amount</th><th>Substitute</th></tr>
                </thead>
                <tbody>
                  {order.bill_items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>{item.qty}</td>
                      <td>{item.type}</td>
                      <td>₹{item.amount}</td>
                      <td>{item.substitute_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="admin-bill-total">
                Total: ₹{order.bill_items.reduce((s, i) => s + (parseFloat(i.amount) || 0) * (parseFloat(i.qty) || 1), 0).toFixed(2)}
              </p>
            </section>
          ) : null}

          {/* Attachments */}
          <section className="admin-section">
            <h3>Attachments</h3>
            <AdminMediaPanel order={order} />
          </section>

          {/* Pickup code info */}
          {order.pickup_code ? (
            <section className="admin-section">
              <h3>Pickup</h3>
              <dl className="admin-dl">
                <div><dt>Code</dt><dd className="mono admin-pickup-code">{order.pickup_code}</dd></div>
                <div><dt>Generated</dt><dd>{fmt(order.pickup_code_generated_at)}</dd></div>
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export function PharmacyOrderManagementPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [filters, setFilters] = useState({
    status: "all",
    dateFrom: "",
    dateTo: "",
    search: "",
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  async function loadOrders({ showLoading = true } = {}) {
    if (showLoading) setIsLoading(true);
    try {
      const data = await listAllPharmacyOrders();
      setOrders(data);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filters.status !== "all" && o.status !== filters.status) return false;
      if (filters.dateFrom) {
        if (new Date(o.created_at) < new Date(`${filters.dateFrom}T00:00:00`)) return false;
      }
      if (filters.dateTo) {
        if (new Date(o.created_at) > new Date(`${filters.dateTo}T23:59:59`)) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hit =
          (o.patient_name || "").toLowerCase().includes(q) ||
          (o.pharmacy_name || "").toLowerCase().includes(q) ||
          (o.order_id || "").toLowerCase().includes(q) ||
          (o.pharmacy_city || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [orders, filters]);

  const kpis = useMemo(() => ({
    total: orders.length,
    active: orders.filter((o) => ["ASSIGNED_TO_PHARMACY","PHARMACY_ACCEPTED","PENDING_PRICE_REVIEW","PRICE_APPROVED"].includes(o.status)).length,
    ready: orders.filter((o) => o.status === "READY_FOR_PICKUP").length,
    completed: orders.filter((o) => o.status === "COMPLETED").length,
    cancelled: orders.filter((o) => ["REJECTED","CANCELLED"].includes(o.status)).length,
  }), [orders]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function exportExcel() {
    const rows = filtered.map((o) => ({
      "Order ID": o.order_id,
      Patient: o.patient_name || "",
      Pharmacy: o.pharmacy_name || "",
      City: o.pharmacy_city || "",
      Status: STATUS_LABELS[o.status] || o.status,
      "Billing Mode": o.notes?.billing_mode || "auto",
      "Estimated (₹)": o.estimated_amount || "",
      "Final (₹)": o.final_amount || "",
      "Substitution": o.substitution_allowed === true ? "Approved" : o.substitution_allowed === false ? "Not Allowed" : "Not Set",
      "Pickup Code": o.pickup_code || "",
      Created: fmtDate(o.created_at),
    }));
    exportRowsToExcel(rows, "pharmacy_orders");
  }

  return (
    <div className="portal-page">
      <header className="portal-header">
        <div>
          <button className="back-link" type="button" onClick={() => navigate("/dashboard/pharmacy")}>
            <ArrowLeft size={16} /> Pharmacy Dashboard
          </button>
          <p className="eyebrow">Operations</p>
          <h1>Pharmacy Order Management</h1>
          <p>Full lifecycle view of all pharmacy orders across every pharmacy.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="outline-button" type="button" onClick={() => loadOrders()}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="outline-button" type="button" onClick={exportExcel}>
            <Download size={16} /> Export
          </button>
        </div>
      </header>

      {/* KPI chips */}
      <div className="admin-order-kpis">
        <button type="button" className={filters.status === "all" ? "kpi-chip kpi-chip-active" : "kpi-chip"} onClick={() => { setFilters((f) => ({ ...f, status: "all" })); setPage(1); }}>
          <span>All</span><strong>{kpis.total}</strong>
        </button>
        <button type="button" className="kpi-chip" onClick={() => { setFilters((f) => ({ ...f, status: "ASSIGNED_TO_PHARMACY" })); setPage(1); }}>
          <span>Active</span><strong>{kpis.active}</strong>
        </button>
        <button type="button" className="kpi-chip kpi-chip-purple" onClick={() => { setFilters((f) => ({ ...f, status: "READY_FOR_PICKUP" })); setPage(1); }}>
          <span>Ready for Pickup</span><strong>{kpis.ready}</strong>
        </button>
        <button type="button" className="kpi-chip kpi-chip-green" onClick={() => { setFilters((f) => ({ ...f, status: "COMPLETED" })); setPage(1); }}>
          <span>Completed</span><strong>{kpis.completed}</strong>
        </button>
        <button type="button" className="kpi-chip kpi-chip-red" onClick={() => { setFilters((f) => ({ ...f, status: "CANCELLED" })); setPage(1); }}>
          <span>Cancelled / Rejected</span><strong>{kpis.cancelled}</strong>
        </button>
      </div>

      {error ? <p className="form-message form-message-error">{error}</p> : null}

      {/* Filters */}
      <div className="admin-order-filters">
        <input
          type="text"
          placeholder="Search patient, pharmacy, order ID…"
          value={filters.search}
          onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
        />
        <label>From<input type="date" value={filters.dateFrom} onChange={(e) => { setFilters((f) => ({ ...f, dateFrom: e.target.value })); setPage(1); }} /></label>
        <label>To<input type="date" value={filters.dateTo} onChange={(e) => { setFilters((f) => ({ ...f, dateTo: e.target.value })); setPage(1); }} /></label>
        <select value={filters.status} onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="outline-button button-small" type="button" onClick={() => { setFilters({ status: "all", dateFrom: "", dateTo: "", search: "" }); setPage(1); }}>Clear</button>
      </div>

      {isLoading ? (
        <div className="panel loading-panel"><RefreshCw size={18} /> Loading orders…</div>
      ) : (
        <div className="admin-order-table-wrap">
          <table className="admin-order-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Pharmacy</th>
                <th>Status</th>
                <th>Billing</th>
                <th>Substitution</th>
                <th>Amount</th>
                <th>Pickup Code</th>
                <th>SLA / Timer</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? paged.map((o) => {
                const slaSecs = o.status === "ASSIGNED_TO_PHARMACY" && o.pharmacy_action_deadline_at
                  ? secondsLeft(o.pharmacy_action_deadline_at)
                  : null;
                const priceReviewSecs = o.status === "PENDING_PRICE_REVIEW" && o.customer_review_deadline_at
                  ? secondsLeft(o.customer_review_deadline_at)
                  : null;
                return (
                  <tr key={o.order_id} className={o.status === "READY_FOR_PICKUP" ? "tr-highlight-pickup" : ""}>
                    <td>{o.patient_name || "—"}</td>
                    <td>
                      <div>{o.pharmacy_name || "—"}</div>
                      <div className="admin-dim">{o.pharmacy_city || ""}</div>
                    </td>
                    <td>
                      <span className={`admin-status-badge ${STATUS_CLASS[o.status] || "badge-yellow"}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td>{o.notes?.billing_mode === "manual" ? "Manual" : "Auto"}</td>
                    <td>
                      {o.substitution_allowed === true
                        ? <span className="admin-status-badge badge-green">Approved</span>
                        : o.substitution_allowed === false
                        ? <span className="admin-status-badge badge-red">Not Allowed</span>
                        : <span className="admin-dim">Not set</span>}
                    </td>
                    <td>
                      {o.final_amount
                        ? <strong>₹{o.final_amount}</strong>
                        : o.estimated_amount
                        ? <span className="admin-dim">~₹{o.estimated_amount}</span>
                        : "—"}
                    </td>
                    <td>
                      {o.pickup_code
                        ? <span className="admin-pickup-inline"><QrCode size={13} />{o.pickup_code}</span>
                        : "—"}
                    </td>
                    <td>
                      {slaSecs !== null
                        ? <span className={`timer-chip ${slaSecs < 60 ? "timer-chip-urgent" : ""}`}><Clock3 size={13} /> Pharmacy SLA {fmtCountdown(slaSecs)}</span>
                        : priceReviewSecs !== null
                        ? <span className="timer-chip timer-chip-pink"><Clock3 size={13} /> Price review {fmtCountdown(priceReviewSecs)}</span>
                        : "—"}
                    </td>
                    <td>{fmtDate(o.created_at)}</td>
                    <td>
                      <button className="outline-button button-small" type="button" onClick={() => setSelectedOrder(o)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="10" className="admin-empty-row">No orders match the filters.</td></tr>
              )}
            </tbody>
          </table>
          <div className="admin-pagination">
            <span>{filtered.length} orders</span>
            <div>
              <button className="outline-button button-small" disabled={safePage <= 1} type="button" onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {safePage} / {pageCount}</span>
              <button className="outline-button button-small" disabled={safePage >= pageCount} type="button" onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder ? (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      ) : null}
    </div>
  );
}
