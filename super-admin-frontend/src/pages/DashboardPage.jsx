import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, Building2, LogOut, Percent, Pill, RefreshCw, Users } from "lucide-react";

import { getCurrentAdmin, listCustomers, listPharmacies, logoutAdmin } from "../lib/api.js";

export function DashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadData({ silent = false } = {}) {
    setError("");
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [adminProfile, pharmacyList, customerList] = await Promise.all([
        getCurrentAdmin(),
        listPharmacies(),
        listCustomers(),
      ]);
      setAdmin(adminProfile);
      setPharmacies(pharmacyList);
      setCustomers(customerList);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function logout() {
    logoutAdmin();
    navigate("/login");
  }

  // Memoised so it doesn't recompute on every render unrelated to customers
  const totalPharmacyOrders = useMemo(
    () => customers.reduce((sum, customer) => sum + customer.pharmacy_order_count, 0),
    [customers],
  );

  if (isLoading) {
    return (
      <main className="page">
        <section className="panel loading-panel">
          <RefreshCw size={20} aria-hidden="true" />
          Loading sectors
        </section>
      </main>
    );
  }

  if (error && !admin) {
    return (
      <main className="page">
        <section className="panel">
          <div className="error">{error}</div>
          <button className="button" type="button" onClick={() => loadData()}>
            Retry
          </button>
          <button className="outline-button" type="button" onClick={() => navigate("/login")}>
            Login again
          </button>
        </section>
      </main>
    );
  }

  const pendingPharmacies = pharmacies.filter(
    (pharmacy) => pharmacy.activation_status === "PENDING_SUPER_ADMIN_APPROVAL",
  ).length;
  const inactivePharmacies = pharmacies.filter(
    (pharmacy) => pharmacy.activation_status === "INACTIVE",
  ).length;

  return (
    <main className="page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Super admin</p>
          <h1>Hi, {admin?.full_name}</h1>
          <p>Choose a sector to manage approvals, listings, and operational controls.</p>
        </div>
        <div className="header-actions">
          <button
            className="outline-button"
            type="button"
            onClick={() => loadData({ silent: true })}
            disabled={isRefreshing}
          >
            <RefreshCw size={18} aria-hidden="true" className={isRefreshing ? "spin" : undefined} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button className="outline-button" type="button" onClick={logout}>
            <LogOut size={18} aria-hidden="true" />
            Logout
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="sector-hub">
        <article className="sector-card">
          <span className="sector-icon">
            <Users size={26} aria-hidden="true" />
          </span>
          <div className="sector-copy">
            <p className="eyebrow">Operations</p>
            <h2>Customers</h2>
            <p>View customer profiles, saved addresses, and sector-wise order history.</p>
          </div>
          <div className="sector-metrics">
            <div>
              <span>{customers.length}</span>
              <p>Total</p>
            </div>
            <div>
              <span>{totalPharmacyOrders}</span>
              <p>Pharmacy orders</p>
            </div>
          </div>
          <button className="button" type="button" onClick={() => navigate("/dashboard/customers")}>
            <Users size={18} aria-hidden="true" />
            Open Customer Dashboard
          </button>
        </article>

        <article className="sector-card">
          <span className="sector-icon">
            <Pill size={26} aria-hidden="true" />
          </span>
          <div className="sector-copy">
            <p className="eyebrow">Sector</p>
            <h2>Pharmacy</h2>
            <p>Manage pharmacy approvals, activation status, and customer listing readiness.</p>
          </div>
          <div className="sector-metrics">
            <div>
              <span>{pendingPharmacies}</span>
              <p>Pending approval</p>
            </div>
            <div>
              <span>{inactivePharmacies}</span>
              <p>Inactive</p>
            </div>
            <div>
              <span>{pharmacies.length}</span>
              <p>Total</p>
            </div>
          </div>
          <button className="button" type="button" onClick={() => navigate("/dashboard/pharmacy")}>
            <Building2 size={18} aria-hidden="true" />
            Open Pharmacy Dashboard
          </button>
          <button className="outline-button" type="button" onClick={() => navigate("/dashboard/pharmacy/products")}>
            <Pill size={18} aria-hidden="true" />
            Review Pharmacy Products
          </button>
        </article>

        {/* Fee & Tax Config */}
        <article className="sector-card">
          <header className="sector-card-header">
            <Percent size={26} aria-hidden="true" />
            <div>
              <h2>Fee &amp; Tax</h2>
              <p className="eyebrow">Platform fee &amp; GST per sector</p>
            </div>
          </header>
          <div className="sector-card-actions">
            <button className="button" type="button" onClick={() => navigate("/dashboard/fee-config")}>
              <Percent size={18} aria-hidden="true" />
              Configure Fees &amp; GST
            </button>
          </div>
        </article>

        {/* Delivery sector */}
        <article className="sector-card">
          <header className="sector-card-header">
            <Bike size={26} aria-hidden="true" />
            <div>
              <h2>Delivery</h2>
              <p className="eyebrow">Driver management & COD</p>
            </div>
          </header>
          <div className="sector-card-actions">
            <button className="button" type="button" onClick={() => navigate("/dashboard/delivery")}>
              <Bike size={18} aria-hidden="true" />
              Live Map & Overview
            </button>
            <button className="outline-button" type="button" onClick={() => navigate("/dashboard/delivery/boys")}>
              <Users size={18} aria-hidden="true" />
              Manage Drivers
            </button>
            <button className="outline-button" type="button" onClick={() => navigate("/dashboard/delivery/cod")}>
              COD & Cash
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
