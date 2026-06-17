import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  getAdminAttention,
  listCustomers,
  listPharmacies,
  listDeliveryAccounts,
  listDeliveryOrders,
  getDisputeSummary,
  adminListHaircutShops,
  adminListHaircutVendors,
} from "../lib/api.js";

function KpiCard({ label, value, sub, accent = "#0f766e", onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14,
        padding: "18px 20px", cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = accent)}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = "#dce6e3")}
    >
      <div style={{ fontSize: "0.72rem", color: "#52625f", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: "1.9rem", fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: "#94a3a0", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <h2 style={{ fontSize: "0.72rem", fontWeight: 700, color: "#52625f", textTransform: "uppercase", letterSpacing: "0.08em", margin: "28px 0 12px" }}>
      {children}
    </h2>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load(silent = false) {
    if (silent) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [customers, pharmacies, deliveryAccounts, deliveryOrders, attention, disputes, haircutShops, haircutVendors] = await Promise.all([
        listCustomers().catch(() => []),
        listPharmacies().catch(() => []),
        listDeliveryAccounts().catch(() => ({ accounts: [] })),
        listDeliveryOrders().catch(() => []),
        getAdminAttention().catch(() => ({ count: 0, items: [] })),
        getDisputeSummary().catch(() => ({})),
        adminListHaircutShops("").catch(() => []),
        adminListHaircutVendors("").catch(() => []),
      ]);
      const drivers = Array.isArray(deliveryAccounts) ? deliveryAccounts : (deliveryAccounts.accounts ?? []);
      const orders = Array.isArray(deliveryOrders) ? deliveryOrders : [];
      setData({ customers, pharmacies, drivers, orders, attention, disputes, haircutShops, haircutVendors });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ background: "#eef3f1", borderRadius: 14, height: 90 }} className="skeleton" />
          ))}
        </div>
      </div>
    );
  }

  const pendingPharmacies = data?.pharmacies.filter(p => p.activation_status === "PENDING_SUPER_ADMIN_APPROVAL").length ?? 0;
  const activeDrivers = data?.drivers.filter(d => d.is_online).length ?? 0;
  const liveOrders = data?.orders.filter(o => !["DELIVERED", "FAILED", "CANCELLED"].includes(o.status)).length ?? 0;
  const openDisputes = data?.disputes?.open ?? 0;
  const attentionCount = data?.attention?.count ?? 0;
  const activeShops = data?.haircutShops.filter(s => s.shop_status === "active").length ?? 0;
  const pendingVendors = data?.haircutVendors.filter(v => v.account_status === "pending").length ?? 0;

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, color: "#13201e" }}>Dashboard</h1>
          <p style={{ margin: "4px 0 0", color: "#52625f", fontSize: "0.85rem" }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <button
          onClick={() => load(true)} disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #c9d8d4", background: "#ffffff", color: "#52625f", cursor: "pointer", fontSize: "0.82rem" }}
        >
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Attention banner */}
      {attentionCount > 0 && (
        <div
          onClick={() => navigate("/dashboard/attention")}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
            background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 12,
            cursor: "pointer", marginBottom: 24, marginTop: 16,
          }}
        >
          <AlertTriangle size={18} color="#8a1f11" />
          <span style={{ color: "#8a1f11", fontWeight: 700, fontSize: "0.88rem" }}>
            {attentionCount} item{attentionCount !== 1 ? "s" : ""} need immediate attention
          </span>
          <span style={{ color: "#b91c1c", marginLeft: "auto", fontSize: "0.82rem" }}>View →</span>
        </div>
      )}

      {/* Customers */}
      <SectionHeading>Customers</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
        <KpiCard label="Total Customers" value={data?.customers.length ?? 0} accent="#0f766e"
          onClick={() => navigate("/dashboard/customers")} />
      </div>

      {/* Pharmacy */}
      <SectionHeading>Pharmacy</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
        <KpiCard label="Total Pharmacies" value={data?.pharmacies.length ?? 0} accent="#15803d"
          onClick={() => navigate("/dashboard/pharmacy")} />
        <KpiCard label="Pending Approval" value={pendingPharmacies} accent="#b45309"
          sub="Awaiting activation"
          onClick={() => navigate("/dashboard/pharmacy")} />
      </div>

      {/* Delivery */}
      <SectionHeading>Delivery</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
        <KpiCard label="Total Drivers" value={data?.drivers.length ?? 0} accent="#2563eb"
          onClick={() => navigate("/dashboard/delivery/boys")} />
        <KpiCard label="Online Now" value={activeDrivers} accent="#15803d"
          onClick={() => navigate("/dashboard/delivery")} />
        <KpiCard label="Live Orders" value={liveOrders} accent="#0f766e"
          onClick={() => navigate("/dashboard/delivery/orders")} />
      </div>

      {/* Haircut */}
      <SectionHeading>Haircut</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
        <KpiCard label="Total Shops" value={data?.haircutShops.length ?? 0} accent="#0f766e"
          onClick={() => navigate("/haircut/shops")} />
        <KpiCard label="Active Shops" value={activeShops} accent="#15803d"
          onClick={() => navigate("/haircut/shops")} />
        <KpiCard label="Pending Vendor Approval" value={pendingVendors} accent="#b45309"
          sub="Awaiting approval"
          onClick={() => navigate("/haircut/shops")} />
      </div>

      {/* Disputes */}
      <SectionHeading>Disputes</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
        <KpiCard label="Open" value={openDisputes} accent="#b91c1c"
          onClick={() => navigate("/dashboard/disputes")} />
        <KpiCard label="Reopened" value={data?.disputes?.reopened ?? 0} accent="#b45309"
          onClick={() => navigate("/dashboard/disputes")} />
        <KpiCard label="Resolved" value={data?.disputes?.resolved ?? 0} accent="#15803d"
          onClick={() => navigate("/dashboard/disputes")} />
      </div>

      {/* Attention detail */}
      {attentionCount > 0 && data?.attention?.items?.length > 0 && (
        <>
          <SectionHeading>Attention Items</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.attention.items.slice(0, 5).map((item, i) => (
              <div
                key={i}
                onClick={() => item.link && navigate(item.link)}
                style={{
                  background: "#ffffff", border: `1px solid ${item.severity === "HIGH" ? "#f2c2b8" : "#dce6e3"}`,
                  borderRadius: 12, padding: "12px 16px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: item.severity === "HIGH" ? "#b91c1c" : "#b45309",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#13201e" }}>{item.title}</div>
                  <div style={{ fontSize: "0.78rem", color: "#52625f", marginTop: 2 }}>{item.detail}</div>
                </div>
                <span style={{ color: "#94a3a0", fontSize: "0.78rem" }}>{item.age_minutes}m ago →</span>
              </div>
            ))}
            {data.attention.items.length > 5 && (
              <button onClick={() => navigate("/dashboard/attention")}
                style={{ background: "none", border: "1px solid #c9d8d4", borderRadius: 10, padding: "8px", color: "#52625f", cursor: "pointer", fontSize: "0.82rem" }}>
                View all {data.attention.items.length} items →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
