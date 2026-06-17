import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/haircut", label: "Browse", icon: "✂️" },
  { to: "/haircut/booking", label: "My Booking", icon: "📅" },
  { to: "/haircut/history", label: "History", icon: "🕘" },
];

export function HaircutSubNav() {
  return (
    <nav
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60,
        background: "#ffffff", borderTop: "1px solid #dce6e3",
        display: "flex",
      }}
    >
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/haircut"}
          style={({ isActive }) => ({
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 4, padding: "10px 4px", fontSize: "0.7rem",
            fontWeight: 600, color: isActive ? "#0f766e" : "#52625f", textDecoration: "none",
          })}
        >
          <span style={{ fontSize: "1.2rem" }}>{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
