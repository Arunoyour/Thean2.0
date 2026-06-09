import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
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
import { SubstitutionAuditPage } from "./pages/SubstitutionAuditPage.jsx";
import "./styles/global.css";

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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/customers" element={<CustomerDashboardPage />} />
        <Route path="/dashboard/customers/:userId" element={<CustomerDetailPage />} />
        <Route path="/dashboard/pharmacy" element={<PharmacyDashboardPage />} />
        <Route path="/dashboard/pharmacy/products" element={<ProductReviewPage />} />
        <Route path="/dashboard/pharmacy/orders" element={<PharmacyOrderManagementPage />} />
        <Route path="/dashboard/pharmacy/substitution-audit" element={<SubstitutionAuditPage />} />

        {/* Delivery */}
        <Route path="/dashboard/delivery" element={<DeliveryMapPage />} />
        <Route path="/dashboard/delivery/boys" element={<DeliveryBoysPage />} />
        <Route path="/dashboard/delivery/boys/:accountId" element={<DeliveryBoyDetailPage />} />
        <Route path="/dashboard/delivery/orders" element={<DeliveryOrdersPage />} />
        <Route path="/dashboard/delivery/cod" element={<DeliveryCodPage />} />
        <Route path="/dashboard/delivery/rate" element={<DeliveryRateConfigPage />} />
        <Route path="/dashboard/delivery/auto-assign" element={<AutoAssignPage />} />
        <Route path="/dashboard/fee-config" element={<FeeConfigPage />} />
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
