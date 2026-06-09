import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell.jsx";
import { AddressListPage } from "./pages/AddressListPage.jsx";
import { AddressPage } from "./pages/AddressPage.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { MedicineOrderPage } from "./pages/MedicineOrderPage.jsx";
import { PharmacyOrdersPage } from "./pages/PharmacyOrdersPage.jsx";
import { PharmacyProductsPage } from "./pages/PharmacyProductsPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/home/addresses" element={<AddressListPage />} />
          <Route path="/home/address/new" element={<AddressPage />} />
          <Route path="/home/address/:addressId/edit" element={<AddressPage />} />
          <Route path="/home/pharmacy" element={<PharmacyProductsPage />} />
          <Route path="/home/pharmacy/order" element={<MedicineOrderPage />} />
          <Route path="/home/pharmacy/orders" element={<PharmacyOrdersPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
