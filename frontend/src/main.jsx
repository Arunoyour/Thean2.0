import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell.jsx";
import { RequireAuth } from "./components/RequireAuth.jsx";
import { AddressListPage } from "./pages/AddressListPage.jsx";
import { AddressPage } from "./pages/AddressPage.jsx";
import { CustomerAttentionPage } from "./pages/CustomerAttentionPage.jsx";
import { CustomerDisputeDetailPage } from "./pages/CustomerDisputeDetailPage.jsx";
import { CustomerDisputeListPage } from "./pages/CustomerDisputeListPage.jsx";
import { CustomerRaiseDisputePage } from "./pages/CustomerRaiseDisputePage.jsx";
import { CustomerRefundStatusPage } from "./pages/CustomerRefundStatusPage.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { MedicineOrderPage } from "./pages/MedicineOrderPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { PharmacyOrdersPage } from "./pages/PharmacyOrdersPage.jsx";
import { PharmacyProductsPage } from "./pages/PharmacyProductsPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { HaircutDiscoveryPage } from "./pages/HaircutDiscoveryPage.jsx";
import { HaircutShopDetailPage } from "./pages/HaircutShopDetailPage.jsx";
import { HaircutBookingPage } from "./pages/HaircutBookingPage.jsx";
import { HaircutActiveBookingPage } from "./pages/HaircutActiveBookingPage.jsx";
import { HaircutHistoryPage } from "./pages/HaircutHistoryPage.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes — redirect to /login?next=<path> if unauthenticated */}
          <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/home/addresses" element={<RequireAuth><AddressListPage /></RequireAuth>} />
          <Route path="/home/address/new" element={<RequireAuth><AddressPage /></RequireAuth>} />
          <Route path="/home/address/:addressId/edit" element={<RequireAuth><AddressPage /></RequireAuth>} />
          <Route path="/home/pharmacy" element={<RequireAuth><PharmacyProductsPage /></RequireAuth>} />
          <Route path="/home/pharmacy/order" element={<RequireAuth><MedicineOrderPage /></RequireAuth>} />
          <Route path="/home/pharmacy/orders" element={<RequireAuth><PharmacyOrdersPage /></RequireAuth>} />

          {/* ── Customer Disputes & Refunds ── */}
          <Route path="/home/attention" element={<RequireAuth><CustomerAttentionPage /></RequireAuth>} />
          <Route path="/home/disputes" element={<RequireAuth><CustomerDisputeListPage /></RequireAuth>} />
          <Route path="/home/disputes/raise" element={<RequireAuth><CustomerRaiseDisputePage /></RequireAuth>} />
          <Route path="/home/disputes/:disputeId" element={<RequireAuth><CustomerDisputeDetailPage /></RequireAuth>} />
          <Route path="/home/refunds" element={<RequireAuth><CustomerRefundStatusPage /></RequireAuth>} />

          {/* ── Haircut ── */}
          <Route path="/haircut" element={<RequireAuth><HaircutDiscoveryPage /></RequireAuth>} />
          <Route path="/haircut/shop/:shopId" element={<RequireAuth><HaircutShopDetailPage /></RequireAuth>} />
          <Route path="/haircut/shop/:shopId/book" element={<RequireAuth><HaircutBookingPage /></RequireAuth>} />
          <Route path="/haircut/booking" element={<RequireAuth><HaircutActiveBookingPage /></RequireAuth>} />
          <Route path="/haircut/history" element={<RequireAuth><HaircutHistoryPage /></RequireAuth>} />

          {/* 404 catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
