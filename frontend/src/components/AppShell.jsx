import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCircle2, Home, ShieldCheck, X } from "lucide-react";

import { getCustomerToken, recreateCustomerPharmacyOrderAnyNearby } from "../lib/api.js";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = Boolean(window.localStorage.getItem("thean_access_token"));
  const [cancelledOrder, setCancelledOrder] = useState(null);
  const [popupError, setPopupError] = useState("");
  const [priceEstimateNotice, setPriceEstimateNotice] = useState(null);

  useEffect(() => {
    const token = getCustomerToken();
    if (!token) return undefined;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host.replace("5173", "8000")}/api/v1/ws/customer?token=${encodeURIComponent(token)}`,
    );
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "order_cancelled") {
        setCancelledOrder(payload);
        setPopupError("");
      } else if (payload.type === "price_estimate_submitted") {
        setPriceEstimateNotice(payload);
      }
    };
    return () => socket.close();
  }, [isAuthenticated]);

  async function recreateOrder() {
    if (!cancelledOrder?.order_id) return;
    try {
      const newOrder = await recreateCustomerPharmacyOrderAnyNearby(cancelledOrder.order_id);
      setCancelledOrder(null);
      navigate(`/home/pharmacy/orders?order_id=${newOrder.order_id}`);
    } catch (error) {
      setPopupError(error.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Thean home">
          <span className="brand-mark">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <span>Thean</span>
        </NavLink>
        <nav className="nav-links" aria-label="Primary navigation">
          {isAuthenticated ? (
            <NavLink to="/home" className="home-link" aria-label="Customer home">
              <Home size={18} aria-hidden="true" />
              <span>Home</span>
            </NavLink>
          ) : (
            <>
              {location.pathname !== "/login" && <NavLink to="/login">Login</NavLink>}
              {location.pathname !== "/register" && (
                <NavLink to="/register" className="button button-small">
                  Register
                </NavLink>
              )}
            </>
          )}
        </nav>
      </header>

      {/* Price estimate notification banner */}
      {priceEstimateNotice ? (
        <div className="price-estimate-notice-bar">
          <Bell size={18} aria-hidden="true" />
          <span>
            {priceEstimateNotice.message || "The pharmacy has sent an estimated price for your order."}{" "}
            <button
              type="button"
              className="notice-link"
              onClick={() => {
                setPriceEstimateNotice(null);
                navigate("/home/pharmacy/orders");
              }}
            >
              Review now
            </button>
          </span>
          <button
            className="notice-close"
            type="button"
            aria-label="Dismiss"
            onClick={() => setPriceEstimateNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <main>
        <Outlet />
      </main>

      {cancelledOrder ? (
        <div className="customer-takeover">
          <section className="customer-alert-modal" role="alertdialog" aria-modal="true">
            <AlertTriangle size={34} aria-hidden="true" />
            <p className="eyebrow">Order cancelled</p>
            <h2>{cancelledOrder.message}</h2>
            <p>Would you like to recreate this order and search any nearby pharmacy with fulfilment protection enabled?</p>
            {popupError ? <p className="form-message form-message-error">{popupError}</p> : null}
            <div className="alert-modal-actions">
              <button className="button" type="button" onClick={recreateOrder}>
                <CheckCircle2 size={16} />
                Yes, Recreate and search nearby
              </button>
              <button
                className="outline-button"
                type="button"
                onClick={() => { setCancelledOrder(null); setPopupError(""); }}
              >
                <X size={16} />
                No, dismiss
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
