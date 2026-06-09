import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, RefreshCw, Search, UserRound } from "lucide-react";

import { listCustomers } from "../lib/api.js";
import { DEFAULT_PAGE_SIZE, exportRowsToExcel, getPageCount, pageLabel, paginate } from "../lib/listingUtils.js";

export function CustomerDashboardPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadCustomers() {
    setError("");
    setIsLoading(true);
    try {
      setCustomers(await listCustomers());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return customers;
    return customers.filter((customer) =>
      [
        customer.full_name,
        customer.phone_number,
        customer.email,
        customer.default_address_label,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [customers, query]);

  useEffect(() => {
    setCustomerPage(1);
  }, [query]);

  const pagedCustomers = useMemo(
    () => paginate(filteredCustomers, customerPage, DEFAULT_PAGE_SIZE),
    [filteredCustomers, customerPage],
  );
  const customerPageCount = getPageCount(filteredCustomers, DEFAULT_PAGE_SIZE);

  function exportCustomers() {
    exportRowsToExcel(
      "thean-customers.xls",
      "Customers",
      [
        { label: "Name", value: (customer) => customer.full_name || "Unnamed customer" },
        { label: "Phone", value: (customer) => customer.phone_number },
        { label: "Email", value: (customer) => customer.email || "" },
        { label: "Active", value: (customer) => customer.is_active ? "Yes" : "No" },
        { label: "Wallet balance", value: (customer) => customer.wallet_balance },
        { label: "Address count", value: (customer) => customer.address_count },
        { label: "Pharmacy order count", value: (customer) => customer.pharmacy_order_count },
        { label: "Default address", value: (customer) => customer.default_address_label || "" },
        { label: "Latest pharmacy order", value: (customer) => customer.latest_pharmacy_order_at || "" },
        { label: "Joined", value: (customer) => customer.created_at },
      ],
      filteredCustomers,
    );
  }

  return (
    <main className="page">
      <header className="dashboard-header">
        <div>
          <button className="text-nav-button" type="button" onClick={() => navigate("/dashboard")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Dashboard
          </button>
          <p className="eyebrow">Customer operations</p>
          <h1>Customer Dashboard</h1>
          <p>Search customers and open their sector-wise order details.</p>
        </div>
        <div className="header-actions">
          <button className="outline-button" type="button" onClick={loadCustomers}>
            <RefreshCw size={18} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="panel customer-filter-panel">
        <label>
          Search customer
          <div className="search-input-wrap">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, mobile, email, or default address"
            />
          </div>
        </label>
      </section>

      {isLoading ? (
        <section className="panel loading-panel">
          <RefreshCw size={20} aria-hidden="true" />
          Loading customers
        </section>
      ) : null}

      {!isLoading ? (
        <section className="table-panel">
          <div className="table-heading">
            <h2>{filteredCustomers.length} customers</h2>
            <button className="outline-button button-small" type="button" onClick={exportCustomers}>
              <Download size={16} aria-hidden="true" />
              Export Excel
            </button>
          </div>
          <div className="customer-table">
            {pagedCustomers.map((customer) => (
              <article className="customer-row" key={customer.user_id}>
                <div className="customer-main">
                  <span className="sector-icon">
                    <UserRound size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{customer.full_name || "Unnamed customer"}</h3>
                    <p>{customer.phone_number} {customer.email ? `• ${customer.email}` : ""}</p>
                  </div>
                </div>
                <div className="customer-stats">
                  <span>{customer.address_count} addresses</span>
                  <span>{customer.pharmacy_order_count} pharmacy orders</span>
                  <span>{customer.default_address_label || "No default address"}</span>
                </div>
                <Link className="button button-small" to={`/dashboard/customers/${customer.user_id}`}>
                  View details
                </Link>
              </article>
            ))}
          </div>
          <div className="pagination-bar">
            <span>{pageLabel(customerPage, filteredCustomers, DEFAULT_PAGE_SIZE)}</span>
            <div>
              <button
                className="outline-button button-small"
                type="button"
                disabled={customerPage <= 1}
                onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </button>
              <strong>Page {Math.min(customerPage, customerPageCount)} of {customerPageCount}</strong>
              <button
                className="outline-button button-small"
                type="button"
                disabled={customerPage >= customerPageCount}
                onClick={() => setCustomerPage((page) => Math.min(customerPageCount, page + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
