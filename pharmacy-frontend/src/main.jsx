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
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/orders" element={<OrderManagementPage />} />
        <Route path="/orders/:orderId/bill" element={<BillGenerationPage />} />
        <Route path="/products/add" element={<AddProductPage />} />
        <Route path="/products" element={<ListedProductsPage />} />
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
