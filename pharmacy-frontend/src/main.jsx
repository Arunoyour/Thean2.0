import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { AddProductPage } from "./pages/AddProductPage.jsx";
import { ListedProductsPage } from "./pages/ListedProductsPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { BillGenerationPage } from "./pages/BillGenerationPage.jsx";
import { OrderManagementPage } from "./pages/OrderManagementPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { SettlementHistoryPage } from "./pages/SettlementHistoryPage.jsx";
import { SettlementDetailPage } from "./pages/SettlementDetailPage.jsx";
import { AttentionPage } from "./pages/AttentionPage.jsx";
import { DisputeListPage } from "./pages/DisputeListPage.jsx";
import { RaiseDisputePage } from "./pages/RaiseDisputePage.jsx";
import { DisputeDetailPage } from "./pages/DisputeDetailPage.jsx";
import "./styles/global.css";
import { getVapidPublicKey, savePushSubscription } from "./lib/api.js";

// ── Web Push registration ─────────────────────────────────────────────────────
// Registers the service worker and subscribes to Web Push if the pharmacy is
// logged in. Runs once on app load; safe to call multiple times (idempotent).
async function registerPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Already subscribed — ensure the backend has it
      await savePushSubscription(existing).catch(() => {});
      return;
    }

    const vapidKey = await getVapidPublicKey();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });
    await savePushSubscription(sub);
  } catch (e) {
    console.warn("[Push] registration failed:", e);
  }
}

// Listen for SPEAK messages from the service worker and speak them aloud
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "SPEAK") return;
    const text = event.data.text;
    if (!text || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-IN";
    utter.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

/** Redirects unauthenticated users to /login before they can reach a protected page. */
function RequireAuth({ children }) {
  const token = window.localStorage.getItem("thean_pharmacy_access_token");
  useEffect(() => {
    if (token) registerPushNotifications();
  }, [token]);
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
        <Route path="/orders" element={<RequireAuth><OrderManagementPage /></RequireAuth>} />
        <Route path="/orders/:orderId/bill" element={<RequireAuth><BillGenerationPage /></RequireAuth>} />
        <Route path="/products/add" element={<RequireAuth><AddProductPage /></RequireAuth>} />
        <Route path="/products" element={<RequireAuth><ListedProductsPage /></RequireAuth>} />
        {/* Settlement */}
        <Route path="/settlement" element={<RequireAuth><SettlementHistoryPage /></RequireAuth>} />
        <Route path="/settlement/:batchId" element={<RequireAuth><SettlementDetailPage /></RequireAuth>} />
        {/* Disputes */}
        <Route path="/attention" element={<RequireAuth><AttentionPage /></RequireAuth>} />
        <Route path="/disputes" element={<RequireAuth><DisputeListPage /></RequireAuth>} />
        <Route path="/disputes/raise" element={<RequireAuth><RaiseDisputePage /></RequireAuth>} />
        <Route path="/disputes/:disputeId" element={<RequireAuth><DisputeDetailPage /></RequireAuth>} />
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
