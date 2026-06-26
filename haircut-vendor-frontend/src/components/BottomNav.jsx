import { NavLink } from "react-router-dom";
import { getShopActive } from "../lib/api.js";

const NAV = [
  { to: "/home", icon: "📅", label: "Today", requiresActive: false },
  { to: "/services", icon: "✂️", label: "Services", requiresActive: true },
  { to: "/reviews", icon: "★", label: "Reviews", requiresActive: true },
  { to: "/settings", icon: "⚙️", label: "Settings", requiresActive: true },
];

export function BottomNav() {
  const isActive = getShopActive();
  const items = NAV.filter(n => !n.requiresActive || isActive);

  return (
    <nav className="hc-bottom-nav">
      {items.map(n => (
        <NavLink
          key={n.to}
          to={n.to}
          className={({ isActive }) => `hc-nav-item${isActive ? " active" : ""}`}
        >
          <span className="hc-nav-icon">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}
