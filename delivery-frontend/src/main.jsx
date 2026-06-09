import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { ChatPage } from "./pages/ChatPage.jsx";
import { EarningsPage } from "./pages/EarningsPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NavigationPage } from "./pages/NavigationPage.jsx";
import { OrderDetailPage } from "./pages/OrderDetailPage.jsx";
import { OrdersListPage } from "./pages/OrdersListPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
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
