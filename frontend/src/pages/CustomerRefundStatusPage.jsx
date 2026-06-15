import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCustomerPharmacyOrders } from "../lib/api.js";

// Statuses where a refund may be applicable
const REFUND_RELEVANT = ["CANCELLED", "REJECTED", "PRICE_REJECTED"];

const REFUND_STATUS_MAP = {
  CANCELLED: { label: "Refund Pending", color: "#f59e0b", bg: "#fffbeb" },
  REJECTED: { label: "Refund Pending", color: "#f59e0b", bg: "#fffbeb" },
  PRICE_REJECTED: { label: "Refund Pending", color: "#f59e0b", bg: "#fffbeb" },
};

export function CustomerRefundStatusPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listCustomerPharmacyOrders()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.orders ?? [];
        // Show all orders — customer can see which ones have refund pending
        setOrders(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const refundOrders = orders.filter((o) => REFUND_RELEVANT.includes(o.status));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 20 }}
        >
          ←
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Refund Status</h1>
      </div>

      {/* Info banner */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "14px 18px", marginBottom: 24 }}>
        <p style={{ fontWeight: 600, color: "#1d4ed8", margin: "0 0 4px" }}>About Refunds</p>
        <p style={{ fontSize: 13, color: "#1e40af", margin: 0 }}>
          Refunds for cancelled or rejected orders are processed within 3–5 business days to your original payment method.
          If you haven't received your refund, you can raise a dispute.
        </p>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {isLoading && <p style={{ color: "#6b7280" }}>Loading orders…</p>}

      {!isLoading && !error && refundOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>No pending refunds</p>
          <p style={{ fontSize: 14 }}>All your orders are in good standing.</p>
        </div>
      )}

      {!isLoading && refundOrders.length > 0 && (
        <>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
            {refundOrders.length} order{refundOrders.length !== 1 ? "s" : ""} with refund pending
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {refundOrders.map((order) => {
              const rs = REFUND_STATUS_MAP[order.status] || { label: "Pending", color: "#6b7280", bg: "#f3f4f6" };
              return (
                <div
                  key={order.order_id}
                  style={{
                    background: "#fff",
                    borderRadius: 10,
                    padding: "16px 20px",
                    border: "1px solid #f3f4f6",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 4px" }}>
                        Order #{String(order.order_id).slice(0, 8).toUpperCase()}
                      </p>
                      <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                        {order.pharmacy_name || "Pharmacy"}
                        {order.created_at ? ` · ${new Date(order.created_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: rs.color,
                      background: rs.bg,
                      padding: "4px 10px",
                      borderRadius: 10,
                    }}>
                      {rs.label}
                    </span>
                  </div>

                  {/* Order summary */}
                  <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#6b7280" }}>Order status</span>
                      <span style={{ fontWeight: 600 }}>{order.status?.replace(/_/g, " ")}</span>
                    </div>
                    {order.total_amount != null && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                        <span style={{ color: "#6b7280" }}>Amount</span>
                        <span style={{ fontWeight: 600 }}>₹{Number(order.total_amount).toFixed(2)}</span>
                      </div>
                    )}
                    {order.cancel_reason && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                        Reason: {order.cancel_reason}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/home/disputes/raise?reference_type=PHARMACY_ORDER&reference_id=${order.order_id}&dispute_type=REFUND_NOT_RECEIVED`)}
                      style={{
                        flex: 1,
                        padding: "10px",
                        background: "#fff",
                        border: "1.5px solid #e5e7eb",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#374151",
                        cursor: "pointer",
                      }}
                    >
                      Raise Dispute
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/home/pharmacy/orders")}
                      style={{
                        flex: 1,
                        padding: "10px",
                        background: "#f3f4f6",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#374151",
                        cursor: "pointer",
                      }}
                    >
                      View Order
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* If no refund-pending but there are recent orders, show a hint */}
      {!isLoading && refundOrders.length === 0 && orders.length > 0 && (
        <div style={{ marginTop: 24, padding: "16px 20px", background: "#fff", borderRadius: 10, border: "1px solid #f3f4f6" }}>
          <p style={{ fontSize: 14, color: "#374151", fontWeight: 600, margin: "0 0 8px" }}>
            Didn't receive a refund?
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
            If you were charged for an order and didn't receive a refund, you can raise a dispute.
          </p>
          <Link
            to="/home/disputes/raise?dispute_type=REFUND_NOT_RECEIVED"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              background: "#0f766e",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Raise Refund Dispute
          </Link>
        </div>
      )}
    </div>
  );
}
