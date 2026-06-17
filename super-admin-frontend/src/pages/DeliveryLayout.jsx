import { Link, useLocation } from "react-router-dom";
import { Map, Users, Package, IndianRupee, ChevronLeft, Settings2, Zap } from "lucide-react";

const NAV = [
  { to: "/dashboard/delivery", icon: Map, label: "Live Map" },
  { to: "/dashboard/delivery/boys", icon: Users, label: "Delivery Boys" },
  { to: "/dashboard/delivery/orders", icon: Package, label: "Orders" },
  { to: "/dashboard/delivery/cod", icon: IndianRupee, label: "COD & Cash" },
  { to: "/dashboard/delivery/auto-assign", icon: Zap, label: "Auto-Assign" },
  { to: "/dashboard/delivery/rate", icon: Settings2, label: "KM Rate" },
];

export function DeliveryLayout({ children, title }) {
  const loc = useLocation();
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f6f8f7" }}>
      <aside style={{
        width: 200, flexShrink: 0,
        background: "#ffffff",
        borderRight: "1px solid #dce6e3",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #eef3f1" }}>
          <Link to="/dashboard" style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: "0.78rem", color: "#94a3a0", textDecoration: "none", marginBottom: 8,
          }}>
            <ChevronLeft size={14} /> Dashboard
          </Link>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#13201e" }}>Delivery</h2>
        </div>
        <nav style={{ padding: "8px 0" }}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = loc.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "8px 16px 8px 18px",
                  textDecoration: "none", fontSize: "0.83rem",
                  fontWeight: active ? 700 : 500,
                  color: active ? "#0f766e" : "#52625f",
                  background: active ? "rgba(15,118,110,0.08)" : "transparent",
                  borderLeft: active ? "2px solid #0f766e" : "2px solid transparent",
                  transition: "all 0.12s",
                }}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {title && (
          <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#13201e", borderBottom: "1px solid #dce6e3", paddingBottom: 12 }}>
            {title}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
