import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/home", icon: "📅", label: "Today" },
  { to: "/services", icon: "✂️", label: "Services" },
  { to: "/reviews", icon: "★", label: "Reviews" },
  { to: "/settings", icon: "⚙️", label: "Settings" },
];

export function BottomNav() {
  return (
    <nav className="hc-bottom-nav">
      {NAV.map(n => (
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
