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
    <div className="dl-admin-layout">
      <aside className="dl-admin-sidebar">
        <div className="dl-admin-sidebar-header">
          <Link to="/dashboard" className="dl-admin-back">
            <ChevronLeft size={16} /> Dashboard
          </Link>
          <h2>Delivery</h2>
        </div>
        <nav className="dl-admin-nav">
          {NAV.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`dl-admin-nav-item ${loc.pathname === to ? "dl-admin-nav-active" : ""}`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="dl-admin-main">
        {title && <div className="dl-admin-page-title">{title}</div>}
        {children}
      </main>
    </div>
  );
}
