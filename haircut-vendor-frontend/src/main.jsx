import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { BottomNav } from "./components/BottomNav.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { HolidayModePage } from "./pages/HolidayModePage.jsx";
import { HoursSetupPage } from "./pages/HoursSetupPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { ReviewsPage } from "./pages/ReviewsPage.jsx";
import { ServicesPage } from "./pages/ServicesPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { ShopSetupPage } from "./pages/ShopSetupPage.jsx";
import "./styles/global.css";

const TOKEN_KEY = "thean_hc_vendor_token";

function RequireAuth({ children }) {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? children : <Navigate to="/login" replace />;
}

function WithNav({ children }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Onboarding flow */}
      <Route path="/setup" element={<RequireAuth><ShopSetupPage mode="create" /></RequireAuth>} />
      <Route path="/hours/setup" element={<RequireAuth><HoursSetupPage isSetup /></RequireAuth>} />
      <Route path="/services/setup" element={<RequireAuth><ServicesPage isSetup /></RequireAuth>} />

      {/* Main app */}
      <Route path="/home" element={<RequireAuth><WithNav><HomePage /></WithNav></RequireAuth>} />
      <Route path="/services" element={<RequireAuth><WithNav><ServicesPage /></WithNav></RequireAuth>} />
      <Route path="/reviews" element={<RequireAuth><WithNav><ReviewsPage /></WithNav></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><WithNav><SettingsPage /></WithNav></RequireAuth>} />
      <Route path="/settings/shop" element={<RequireAuth><ShopSetupPage mode="edit" /></RequireAuth>} />
      <Route path="/settings/hours" element={<RequireAuth><HoursSetupPage /></RequireAuth>} />
      <Route path="/settings/holiday" element={<RequireAuth><HolidayModePage /></RequireAuth>} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
