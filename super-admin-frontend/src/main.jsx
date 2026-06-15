import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { AdminManagementPage } from "./pages/AdminManagementPage.jsx";
import { ApprovalsPage } from "./pages/ApprovalsPage.jsx";
import { AuditLogPage } from "./pages/AuditLogPage.jsx";
import { PaymentProofsPage } from "./pages/PaymentProofsPage.jsx";
import { DisputeDetailPage } from "./pages/DisputeDetailPage.jsx";
import { StakeholderLedgerPage } from "./pages/StakeholderLedgerPage.jsx";
import { DisputeManagementPage } from "./pages/DisputeManagementPage.jsx";
import { ReconciliationExceptionDetailPage } from "./pages/ReconciliationExceptionDetailPage.jsx";
import { ReconciliationOverviewPage } from "./pages/ReconciliationOverviewPage.jsx";
import { SettlementBatchDetailPage } from "./pages/SettlementBatchDetailPage.jsx";
import { SettlementCycleDetailPage } from "./pages/SettlementCycleDetailPage.jsx";
import { SettlementDashboardPage } from "./pages/SettlementDashboardPage.jsx";
import { AutoAssignPage } from "./pages/AutoAssignPage.jsx";
import { CustomerDashboardPage } from "./pages/CustomerDashboardPage.jsx";
import { CustomerDetailPage } from "./pages/CustomerDetailPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { DeliveryBoysPage } from "./pages/DeliveryBoysPage.jsx";
import { DeliveryBoyDetailPage } from "./pages/DeliveryBoyDetailPage.jsx";
import { DeliveryCodPage } from "./pages/DeliveryCodPage.jsx";
import DeliveryRateConfigPage from "./pages/DeliveryRateConfigPage.jsx";
import FeeConfigPage from "./pages/FeeConfigPage.jsx";
import { DeliveryMapPage } from "./pages/DeliveryMapPage.jsx";
import { DeliveryOrdersPage } from "./pages/DeliveryOrdersPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { PharmacyDashboardPage } from "./pages/PharmacyDashboardPage.jsx";
import { ProductReviewPage } from "./pages/ProductReviewPage.jsx";
import { PharmacyOrderManagementPage } from "./pages/PharmacyOrderManagementPage.jsx";
import { PharmacyOrderStatusPage } from "./pages/PharmacyOrderStatusPage.jsx";
import { SubstitutionAuditPage } from "./pages/SubstitutionAuditPage.jsx";
import { canManageAdmins, canSeeAuditLog } from "./lib/role.js";
import "./styles/global.css";

/** Redirects to /dashboard when the required role check fails. */
function RequireRole({ check, children }) {
  return check() ? children : <Navigate to="/dashboard" replace />;
}

/** Redirects unauthenticated users to /login before they can reach a protected page. */
function RequireAuth({ children }) {
  const token = window.localStorage.getItem("thean_super_admin_access_token");
  return token ? children : <Navigate to="/login" replace />;
}

/** Sticky bottom banner shown when the device loses network connectivity. */
function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOff = () => setOffline(true);
    const goOn  = () => setOffline(false);
    window.addEventListener("offline", goOff);
    window.addEventListener("online",  goOn);
    return () => {
      window.removeEventListener("offline", goOff);
      window.removeEventListener("online",  goOn);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-banner" role="alert" aria-live="polite">
      ⚠ You're offline — some features may not work until your connection is restored.
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/dashboard/customers" element={<RequireAuth><CustomerDashboardPage /></RequireAuth>} />
        <Route path="/dashboard/customers/:userId" element={<RequireAuth><CustomerDetailPage /></RequireAuth>} />
        <Route path="/dashboard/pharmacy" element={<RequireAuth><PharmacyDashboardPage /></RequireAuth>} />
        <Route path="/dashboard/pharmacy/products" element={<RequireAuth><ProductReviewPage /></RequireAuth>} />
        <Route path="/dashboard/pharmacy/orders" element={<RequireAuth><PharmacyOrderManagementPage /></RequireAuth>} />
        <Route path="/dashboard/pharmacy/order-status" element={<RequireAuth><PharmacyOrderStatusPage /></RequireAuth>} />
        <Route path="/dashboard/pharmacy/substitution-audit" element={<RequireAuth><SubstitutionAuditPage /></RequireAuth>} />

        {/* Delivery */}
        <Route path="/dashboard/delivery" element={<RequireAuth><DeliveryMapPage /></RequireAuth>} />
        <Route path="/dashboard/delivery/boys" element={<RequireAuth><DeliveryBoysPage /></RequireAuth>} />
        <Route path="/dashboard/delivery/boys/:accountId" element={<RequireAuth><DeliveryBoyDetailPage /></RequireAuth>} />
        <Route path="/dashboard/delivery/orders" element={<RequireAuth><DeliveryOrdersPage /></RequireAuth>} />
        <Route path="/dashboard/delivery/cod" element={<RequireAuth><DeliveryCodPage /></RequireAuth>} />
        <Route path="/dashboard/delivery/rate" element={<RequireAuth><DeliveryRateConfigPage /></RequireAuth>} />
        <Route path="/dashboard/delivery/auto-assign" element={<RequireAuth><AutoAssignPage /></RequireAuth>} />
        <Route path="/dashboard/fee-config" element={<RequireAuth><FeeConfigPage /></RequireAuth>} />

        {/* Settlement */}
        <Route path="/dashboard/settlement" element={<RequireAuth><SettlementDashboardPage /></RequireAuth>} />
        <Route path="/dashboard/settlement/:cycleId" element={<RequireAuth><SettlementCycleDetailPage /></RequireAuth>} />
        <Route path="/dashboard/settlement/:cycleId/batch/:batchId" element={<RequireAuth><SettlementBatchDetailPage /></RequireAuth>} />
        <Route path="/dashboard/settlement/batch/:batchId/proofs" element={<RequireAuth><PaymentProofsPage /></RequireAuth>} />

        {/* Stakeholder Ledger */}
        <Route path="/dashboard/ledger" element={<RequireAuth><StakeholderLedgerPage /></RequireAuth>} />

        {/* Disputes */}
        <Route path="/dashboard/disputes" element={<RequireAuth><DisputeManagementPage /></RequireAuth>} />
        <Route path="/dashboard/disputes/:disputeId" element={<RequireAuth><DisputeDetailPage /></RequireAuth>} />

        {/* Reconciliation */}
        <Route path="/dashboard/reconciliation" element={<RequireAuth><ReconciliationOverviewPage /></RequireAuth>} />
        <Route path="/dashboard/reconciliation/exceptions/:exceptionId" element={<RequireAuth><ReconciliationExceptionDetailPage /></RequireAuth>} />

        {/* Role-gated */}
        <Route path="/dashboard/admins" element={<RequireAuth><RequireRole check={canManageAdmins}><AdminManagementPage /></RequireRole></RequireAuth>} />
        <Route path="/dashboard/approvals" element={<RequireAuth><ApprovalsPage /></RequireAuth>} />
        <Route path="/dashboard/audit-log" element={<RequireAuth><RequireRole check={canSeeAuditLog}><AuditLogPage /></RequireRole></RequireAuth>} />
      </Routes>
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
