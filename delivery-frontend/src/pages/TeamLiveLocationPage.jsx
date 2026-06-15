import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, IndianRupee, RefreshCw, Truck, Users } from "lucide-react";
import { getTeamMembers } from "../lib/api.js";

export function TeamLiveLocationPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    load();
    // Auto-refresh every 30 seconds
    intervalRef.current = setInterval(load, 30_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  async function load() {
    try {
      const data = await getTeamMembers();
      setMembers(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  const online = members.filter((m) => m.is_online);
  const withLocation = members.filter((m) => m.current_lat && m.current_lng);

  function openMaps(lat, lng, name) {
    window.open(`https://maps.google.com/?q=${lat},${lng}&z=16&query=${encodeURIComponent(name)}`, "_blank");
  }

  return (
    <div className="dl-page" style={{ paddingBottom: 90 }}>
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Live Locations</h1>
        <button type="button" onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
          <RefreshCw size={18} />
        </button>
      </header>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "#16a34a", margin: 0 }}>Online</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#16a34a", margin: "2px 0 0" }}>{online.length}</p>
        </div>
        <div style={{ background: "#f3f4f6", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Total</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#374151", margin: "2px 0 0" }}>{members.length}</p>
        </div>
        <div style={{ background: "#eff6ff", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "#3b82f6", margin: 0 }}>With GPS</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6", margin: "2px 0 0" }}>{withLocation.length}</p>
        </div>
      </div>

      {lastUpdated && (
        <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: "8px 0 0" }}>
          Updated {lastUpdated.toLocaleTimeString()} · auto-refreshes every 30s
        </p>
      )}

      {error && <div className="dl-error">{error}</div>}
      {isLoading && <div className="dl-loading"><p>Loading…</p></div>}

      <div style={{ padding: "12px 16px 0" }}>
        {members.map((m) => (
          <div
            key={m.account_id}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 10,
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: m.is_online ? "#16a34a" : "#9ca3af",
                    flexShrink: 0,
                  }} />
                  <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{m.full_name}</p>
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>
                  {m.vehicle_type}
                  {m.current_lat ? (
                    <span style={{ marginLeft: 8, color: "#3b82f6" }}>
                      📍 {Number(m.current_lat).toFixed(4)}, {Number(m.current_lng).toFixed(4)}
                    </span>
                  ) : (
                    <span style={{ marginLeft: 8, color: "#9ca3af" }}>No GPS</span>
                  )}
                </p>
                {m.location_updated_at && (
                  <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
                    Last seen: {new Date(m.location_updated_at).toLocaleTimeString()}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                {m.current_lat && (
                  <button
                    type="button"
                    onClick={() => openMaps(m.current_lat, m.current_lng, m.full_name)}
                    style={{ padding: "6px 12px", background: "#3b82f6", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Map
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/team/members/${m.account_id}`)}
                  style={{ padding: "6px 12px", background: "#e5e7eb", border: "none", borderRadius: 8, color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Details
                </button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && members.length === 0 && !error && (
          <p className="dl-empty-hint">No team members found.</p>
        )}
      </div>

      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/team" className="dl-nav-item dl-nav-active"><Users size={22} /><span>Team</span></Link>
        <Link to="/earnings" className="dl-nav-item"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
