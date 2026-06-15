import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, IndianRupee, Package, Truck, Users } from "lucide-react";
import { getTeamEarnings } from "../lib/api.js";

export function TeamEarningsPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("today");

  useEffect(() => {
    getTeamEarnings()
      .then(setMembers)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const sorted = [...members].sort((a, b) => b[sortBy] - a[sortBy]);

  const totals = members.reduce(
    (acc, m) => ({
      today: acc.today + (m.today || 0),
      this_week: acc.this_week + (m.this_week || 0),
      all_time: acc.all_time + (m.all_time || 0),
    }),
    { today: 0, this_week: 0, all_time: 0 }
  );

  return (
    <div className="dl-page" style={{ paddingBottom: 90 }}>
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Team Earnings</h1>
      </header>

      {/* Totals summary */}
      {!isLoading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
          {[
            { label: "Team Today", value: totals.today },
            { label: "This Week", value: totals.this_week },
            { label: "All Time", value: totals.all_time },
          ].map((c) => (
            <div key={c.label} style={{ background: "#1d4ed8", borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#bfdbfe", margin: 0 }}>{c.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "4px 0 0" }}>
                ₹{c.value.toFixed(0)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Sort chips */}
      <div style={{ padding: "12px 16px 0", display: "flex", gap: 8 }}>
        {["today", "this_week", "all_time"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSortBy(s)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "none",
              background: sortBy === s ? "#1d4ed8" : "#e5e7eb",
              color: sortBy === s ? "#fff" : "#374151",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {s === "today" ? "Today" : s === "this_week" ? "This Week" : "All Time"}
          </button>
        ))}
      </div>

      {error && <div className="dl-error">{error}</div>}
      {isLoading && <div className="dl-loading"><p>Loading…</p></div>}

      <div style={{ padding: "12px 16px 0" }}>
        {sorted.map((m, i) => (
          <div
            key={m.account_id}
            onClick={() => navigate(`/team/members/${m.account_id}`)}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 10,
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#1d4ed8", fontSize: 14 }}>
                {i + 1}
              </div>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{m.full_name}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 11, color: m.is_online ? "#16a34a" : "#9ca3af", background: m.is_online ? "#f0fdf4" : "#f3f4f6", padding: "1px 6px", borderRadius: 8 }}>
                    {m.is_online ? "Online" : "Offline"}
                  </span>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    ⭐ {Number(m.avg_rating).toFixed(1)} · {m.total_assigned} orders
                  </span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontWeight: 700, fontSize: 16, margin: 0, color: "#111827" }}>
                ₹{Number(m[sortBy] || 0).toFixed(0)}
              </p>
              {m.cod_blocked && (
                <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>COD BLOCKED</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/team" className="dl-nav-item dl-nav-active"><Users size={22} /><span>Team</span></Link>
        <Link to="/earnings" className="dl-nav-item"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
