import { useNavigate, Link } from "react-router-dom";
import { clearToken } from "../lib/api.js";

export function SettingsPage() {
  const navigate = useNavigate();

  function handleLogout() {
    if (!confirm("Log out?")) return;
    clearToken();
    navigate("/login");
  }

  const links = [
    { to: "/settings/shop", label: "✂️  Edit Shop Details" },
    { to: "/settings/hours", label: "🕐  Opening Hours" },
    { to: "/settings/holiday", label: "🏖️  Holiday / Closure Mode" },
  ];

  return (
    <div className="hc-page">
      <div className="hc-topbar">
        <h2>Settings</h2>
      </div>

      <div className="hc-content">
        <div className="hc-card">
          {links.map(l => (
            <Link key={l.to} to={l.to} style={{ display: "block", padding: "14px 0", borderBottom: "1px solid #dce6e3", color: "#13201e", fontSize: "0.95rem" }}>
              {l.label}
            </Link>
          ))}
        </div>

        <button className="hc-btn hc-btn-danger" onClick={handleLogout} style={{ width: "100%" }}>
          Log Out
        </button>
      </div>
    </div>
  );
}
