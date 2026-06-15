import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { ChatPage } from "./pages/ChatPage.jsx";
import { DeliveryAttentionPage } from "./pages/DeliveryAttentionPage.jsx";
import { DeliveryDisputeDetailPage } from "./pages/DeliveryDisputeDetailPage.jsx";
import { DeliveryDisputeListPage } from "./pages/DeliveryDisputeListPage.jsx";
import { DeliveryRaiseDisputePage } from "./pages/DeliveryRaiseDisputePage.jsx";
import { DeliverySettlementDetailPage } from "./pages/DeliverySettlementDetailPage.jsx";
import { DeliverySettlementHistoryPage } from "./pages/DeliverySettlementHistoryPage.jsx";
import { EarningsPage } from "./pages/EarningsPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NavigationPage } from "./pages/NavigationPage.jsx";
import { OrderDetailPage } from "./pages/OrderDetailPage.jsx";
import { OrdersListPage } from "./pages/OrdersListPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { TeamCODReconciliationPage } from "./pages/TeamCODReconciliationPage.jsx";
import { TeamEarningsPage } from "./pages/TeamEarningsPage.jsx";
import { TeamLiveLocationPage } from "./pages/TeamLiveLocationPage.jsx";
import { TeamMemberDetailPage } from "./pages/TeamMemberDetailPage.jsx";
import "./styles/global.css";

function RequireAuth({ children }) {
  const token = window.localStorage.getItem("thean_delivery_access_token");
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
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/orders" element={<RequireAuth><OrdersListPage /></RequireAuth>} />
        <Route path="/order/:deliveryOrderId" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="/navigate/:deliveryOrderId" element={<RequireAuth><NavigationPage /></RequireAuth>} />
        <Route path="/chat/:deliveryOrderId" element={<RequireAuth><ChatPage /></RequireAuth>} />
        <Route path="/earnings" element={<RequireAuth><EarningsPage /></RequireAuth>} />

        {/* ── Delivery Boy: Settlement & Disputes ── */}
        <Route path="/settlement" element={<RequireAuth><DeliverySettlementHistoryPage /></RequireAuth>} />
        <Route path="/settlement/:batchId" element={<RequireAuth><DeliverySettlementDetailPage /></RequireAuth>} />
        <Route path="/attention" element={<RequireAuth><DeliveryAttentionPage /></RequireAuth>} />
        <Route path="/disputes" element={<RequireAuth><DeliveryDisputeListPage /></RequireAuth>} />
        <Route path="/disputes/raise" element={<RequireAuth><DeliveryRaiseDisputePage /></RequireAuth>} />
        <Route path="/disputes/:disputeId" element={<RequireAuth><DeliveryDisputeDetailPage /></RequireAuth>} />

        {/* ── Team Lead ── */}
        <Route path="/team/earnings" element={<RequireAuth><TeamEarningsPage /></RequireAuth>} />
        <Route path="/team/cod" element={<RequireAuth><TeamCODReconciliationPage /></RequireAuth>} />
        <Route path="/team/locations" element={<RequireAuth><TeamLiveLocationPage /></RequireAuth>} />
        <Route path="/team/members/:memberId" element={<RequireAuth><TeamMemberDetailPage /></RequireAuth>} />
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
