import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { HomePage } from "./pages/HomePage.jsx";
import { AddProductPage } from "./pages/AddProductPage.jsx";
import { ListedProductsPage } from "./pages/ListedProductsPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { BillGenerationPage } from "./pages/BillGenerationPage.jsx";
import { OrderManagementPage } from "./pages/OrderManagementPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </React.StrictMode>,
);
