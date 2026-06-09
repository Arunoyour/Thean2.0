import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Download, Home, Package, RefreshCw } from "lucide-react";

import { getCustomerDetail } from "../lib/api.js";
import { DEFAULT_PAGE_SIZE, exportRowsToExcel, getPageCount, pageLabel, paginate } from "../lib/listingUtils.js";

function formatDate(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

export function CustomerDetailPage() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [detail, setDetail] = useState(null);
  const [addressPage, setAddressPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadDetail() {
    setError("");
    setIsLoading(true);
    try {
      setDetail(await getCustomerDetail(userId));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [userId]);

  const customer = detail?.customer;
  const pharmacyOrders = detail?.sector_orders?.pharmacy || [];
  const addresses = detail?.addresses || [];
  const pagedAddresses = paginate(addresses, addressPage, DEFAULT_PAGE_SIZE);
  const pagedPharmacyOrders = paginate(pharmacyOrders, orderPage, DEFAULT_PAGE_SIZE);
  const addressPageCount = getPageCount(addresses, DEFAULT_PAGE_SIZE);
  const orderPageCount = getPageCount(pharmacyOrders, DEFAULT_PAGE_SIZE);

  function exportAddresses() {
    exportRowsToExcel(
      "thean-customer-addresses.xls",
      "Customer Addresses",
      [
        { label: "Customer", value: () => customer?.full_name || "" },
        { label: "Nickname", value: (address) => address.label },
        { label: "Default", value: (address) => address.is_default ? "Yes" : "No" },
        { label: "Address", value: (address) => address.address_line_1 },
        { label: "Landmark", value: (address) => address.landmark || "" },
        { label: "City", value: (address) => address.city || "" },
        { label: "Pincode", value: (address) => address.pincode },
        { label: "Latitude", value: (address) => address.latitude },
        { label: "Longitude", value: (address) => address.longitude },
      ],
      addresses,
    );
  }

  function exportPharmacyOrders() {
    exportRowsToExcel(
      "thean-customer-pharmacy-orders.xls",
      "Pharmacy Orders",
      [
        { label: "Order ID", value: (order) => order.order_id },
        { label: "Customer", value: () => customer?.full_name || "" },
        { label: "Pharmacy", value: (order) => order.pharmacy_name || "" },
        { label: "Status", value: (order) => order.status },
        { label: "Doctor", value: (order) => order.doctor_name || "Self" },
        { label: "Patient", value: (order) => order.patient_name || "Customer" },
        { label: "Billing mode", value: (order) => order.notes?.billing_mode || "" },
        { label: "Estimated amount", value: (order) => order.estimated_amount || "" },
        { label: "Final amount", value: (order) => order.final_amount || "" },
        { label: "Customer comment", value: (order) => order.customer_action_comment || "" },
        { label: "Created", value: (order) => order.created_at },
      ],
      pharmacyOrders,
    );
  }

  return (
    <main className="page">
      <header className="dashboard-header">
        <div>
          <button className="text-nav-button" type="button" onClick={() => navigate("/dashboard/customers")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Customers
          </button>
          <p className="eyebrow">Customer detail</p>
          <h1>{customer?.full_name || "Customer"}</h1>
          <p>{customer?.phone_number} {customer?.email ? `• ${customer.email}` : ""}</p>
        </div>
        <div className="header-actions">
          <button className="outline-button" type="button" onClick={loadDetail}>
            <RefreshCw size={18} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {isLoading ? (
        <section className="panel loading-panel">
          <RefreshCw size={20} aria-hidden="true" />
          Loading customer
        </section>
      ) : null}

      {detail && !isLoading ? (
        <>
          <section className="customer-detail-grid">
            <article className="metric-card">
              <p>Wallet balance</p>
              <strong>₹{customer.wallet_balance}</strong>
            </article>
            <article className="metric-card">
              <p>Status</p>
              <strong>{customer.is_active ? "Active" : "Inactive"}</strong>
            </article>
            <article className="metric-card">
              <p>Joined</p>
              <strong>{formatDate(customer.created_at)}</strong>
            </article>
          </section>

          <section className="table-panel">
            <div className="table-heading">
              <h2>Saved addresses</h2>
              <button className="outline-button button-small" type="button" onClick={exportAddresses}>
                <Download size={16} aria-hidden="true" />
                Export Excel
              </button>
            </div>
            <div className="address-admin-grid">
              {pagedAddresses.map((address) => (
                <article className="admin-address-card" key={address.address_id}>
                  <Home size={20} aria-hidden="true" />
                  <div>
                    <h3>{address.label} {address.is_default ? <span>Default</span> : null}</h3>
                    <p>{address.address_line_1}</p>
                    <p>{address.landmark} • {address.city || "City missing"} • {address.pincode}</p>
                    <p>{address.latitude}, {address.longitude}</p>
                  </div>
                </article>
              ))}
              {!detail.addresses.length ? <p className="muted-line">No saved addresses.</p> : null}
            </div>
            <div className="pagination-bar">
              <span>{pageLabel(addressPage, addresses, DEFAULT_PAGE_SIZE)}</span>
              <div>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={addressPage <= 1}
                  onClick={() => setAddressPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <strong>Page {Math.min(addressPage, addressPageCount)} of {addressPageCount}</strong>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={addressPage >= addressPageCount}
                  onClick={() => setAddressPage((page) => Math.min(addressPageCount, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          <section className="table-panel">
            <div className="table-heading">
              <h2>Pharmacy orders</h2>
              <button className="outline-button button-small" type="button" onClick={exportPharmacyOrders}>
                <Download size={16} aria-hidden="true" />
                Export Excel
              </button>
            </div>
            <div className="admin-order-list">
              {pagedPharmacyOrders.map((order) => (
                <article className="admin-order-card" key={order.order_id}>
                  <div className="admin-order-header">
                    <span className="sector-icon">
                      <ClipboardList size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{order.pharmacy_name || "Pharmacy pending"}</h3>
                      <p>{order.status} • {formatDate(order.created_at)}</p>
                    </div>
                  </div>
                  <dl className="order-detail-list">
                    <div><dt>Doctor</dt><dd>{order.doctor_name || "Self"}</dd></div>
                    <div><dt>Patient</dt><dd>{order.patient_name || "Customer"}</dd></div>
                    <div><dt>Billing</dt><dd>{order.notes?.billing_mode || "Not captured"}</dd></div>
                    <div><dt>Customer action</dt><dd>{order.customer_action_comment || "No comment"}</dd></div>
                  </dl>
                  <div className="order-items-list">
                    {order.items.map((item, index) => (
                      <div key={`${order.order_id}-${item.name}-${index}`}>
                        <Package size={16} aria-hidden="true" />
                        <span>{item.name} • {item.metric} • Qty {item.quantity}</span>
                        <strong>{item.line_total ? `₹${item.line_total}` : "Price pending"}</strong>
                      </div>
                    ))}
                    {!order.items.length ? <p className="muted-line">No item details captured.</p> : null}
                  </div>
                </article>
              ))}
              {!pharmacyOrders.length ? <p className="muted-line">No pharmacy orders yet.</p> : null}
            </div>
            <div className="pagination-bar">
              <span>{pageLabel(orderPage, pharmacyOrders, DEFAULT_PAGE_SIZE)}</span>
              <div>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={orderPage <= 1}
                  onClick={() => setOrderPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <strong>Page {Math.min(orderPage, orderPageCount)} of {orderPageCount}</strong>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={orderPage >= orderPageCount}
                  onClick={() => setOrderPage((page) => Math.min(orderPageCount, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          <section className="sector-placeholder-grid">
            <article className="panel">
              <h2>Vegetables orders</h2>
              <p className="muted-line">No vegetable order module is live yet.</p>
            </article>
            <article className="panel">
              <h2>Print shop orders</h2>
              <p className="muted-line">No print shop order module is live yet.</p>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
