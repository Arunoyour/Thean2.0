import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </React.StrictMode>,
);
