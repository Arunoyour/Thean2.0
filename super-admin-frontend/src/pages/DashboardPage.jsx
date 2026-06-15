import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, BookOpen, Building2, ClipboardList, CreditCard, GitMerge, LogOut, MessageSquare, Percent, Pill, RefreshCw, ScrollText, ShieldCheck, Users } from "lucide-react";

import { getAdminAttention, getCurrentAdmin, listCustomers, listPharmacies, logoutAdmin } from "../lib/api.js";
import { canManageAdmins, canSeeAuditLog, canApprove } from "../lib/role.js";

export function DashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [attentionCount, setAttentionCount] = useState(0);

  async function loadData({ silent = false } = {}) {
    setError("");
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [adminProfile, pharmacyList, customerList, attentionData] = await Promise.all([
        getCurrentAdmin(),
        listPharmacies(),
        listCustomers(),
        getAdminAttention().catch(() => ({ count: 0 })),
      ]);
      setAdmin(adminProfile);
      setPharmacies(pharmacyList);
      setCustomers(customerList);
      setAttentionCount(attentionData?.count || 0);
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
      <main className="page" aria-busy="true" aria-label="Loading dashboard">
        <div className="dashboard-skeleton-header">
          <span className="skeleton skeleton-text-sm" style={{ width: "80px", display: "inline-block" }} />
          <span className="skeleton skeleton-text-lg" style={{ width: "220px", marginTop: "0.4rem" }} />
          <span className="skeleton skeleton-text" style={{ width: "340px", marginTop: "0.4rem" }} />
        </div>
        <div className="dashboard-skeleton-grid">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="skeleton skeleton-card" />
          ))}
        </div>
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
      {attentionCount > 0 && (
        <a href="/dashboard/attention" className="attention-banner">
          ⚠️ Immediate attention needed ({attentionCount} item{attentionCount > 1 ? "s" : ""}) — click to view
        </a>
      )}
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
          <button className="outline-button" type="button" onClick={() => navigate("/dashboard/pharmacy/order-status")}>
            Live Order Status Board
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

        {/* Settlement */}
        <article className="sector-card">
          <header className="sector-card-header">
            <CreditCard size={26} aria-hidden="true" />
            <div>
              <h2>Settlement</h2>
              <p className="eyebrow">Cycles, batches & ledger</p>
            </div>
          </header>
          <div className="sector-card-actions">
            <button className="button" type="button" onClick={() => navigate("/dashboard/settlement")}>
              <CreditCard size={18} aria-hidden="true" />
              Open Settlement
            </button>
          </div>
        </article>

        {/* Stakeholder Ledger */}
        <article className="sector-card">
          <header className="sector-card-header">
            <BookOpen size={26} aria-hidden="true" />
            <div>
              <h2>Ledger</h2>
              <p className="eyebrow">Running balance per stakeholder</p>
            </div>
          </header>
          <div className="sector-card-actions">
            <button className="button" type="button" onClick={() => navigate("/dashboard/ledger")}>
              <BookOpen size={18} aria-hidden="true" />
              View Ledger
            </button>
          </div>
        </article>

        {/* Disputes */}
        <article className="sector-card">
          <header className="sector-card-header">
            <MessageSquare size={26} aria-hidden="true" />
            <div>
              <h2>Disputes</h2>
              <p className="eyebrow">All apps — raise, review, resolve</p>
            </div>
          </header>
          <div className="sector-card-actions">
            <button className="button" type="button" onClick={() => navigate("/dashboard/disputes")}>
              <MessageSquare size={18} aria-hidden="true" />
              Open Dispute Management
            </button>
          </div>
        </article>

        {/* Reconciliation */}
        <article className="sector-card">
          <header className="sector-card-header">
            <GitMerge size={26} aria-hidden="true" />
            <div>
              <h2>Reconciliation</h2>
              <p className="eyebrow">Three-way match & exceptions</p>
            </div>
          </header>
          <div className="sector-card-actions">
            <button className="button" type="button" onClick={() => navigate("/dashboard/reconciliation")}>
              <GitMerge size={18} aria-hidden="true" />
              Open Reconciliation
            </button>
          </div>
        </article>

        {/* Approval queue — all roles that can approve/view */}
        {canApprove() && (
          <article className="sector-card">
            <header className="sector-card-header">
              <ClipboardList size={26} aria-hidden="true" />
              <div>
                <h2>Approvals</h2>
                <p className="eyebrow">Maker-Checker queue</p>
              </div>
            </header>
            <div className="sector-card-actions">
              <button className="button" type="button" onClick={() => navigate("/dashboard/approvals")}>
                <ClipboardList size={18} aria-hidden="true" />
                Open Approval Queue
              </button>
            </div>
          </article>
        )}

        {/* Audit log — SUPER + SUPERVISOR only */}
        {canSeeAuditLog() && (
          <article className="sector-card">
            <header className="sector-card-header">
              <ScrollText size={26} aria-hidden="true" />
              <div>
                <h2>Audit Log</h2>
                <p className="eyebrow">All admin activity</p>
              </div>
            </header>
            <div className="sector-card-actions">
              <button className="button" type="button" onClick={() => navigate("/dashboard/audit-log")}>
                <ScrollText size={18} aria-hidden="true" />
                View Audit Log
              </button>
            </div>
          </article>
        )}

        {/* Admin management — SUPER only */}
        {canManageAdmins() && (
          <article className="sector-card">
            <header className="sector-card-header">
              <ShieldCheck size={26} aria-hidden="true" />
              <div>
                <h2>Admin Management</h2>
                <p className="eyebrow">User accounts & roles</p>
              </div>
            </header>
            <div className="sector-card-actions">
              <button className="button" type="button" onClick={() => navigate("/dashboard/admins")}>
                <ShieldCheck size={18} aria-hidden="true" />
                Manage Admins
              </button>
            </div>
          </article>
        )}
      </section>
    </main>
  );
}
