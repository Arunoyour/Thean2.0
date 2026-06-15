import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, IndianRupee, Package, Phone, Star, Truck, Users } from "lucide-react";
import { getTeamMemberDetail } from "../lib/api.js";

const STATUS_COLORS = {
  active: "#10b981",
  pending: "#f59e0b",
  suspended: "#ef4444",
  rejected: "#6b7280",
};

export function TeamMemberDetailPage() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getTeamMemberDetail(memberId)
      .then(setMember)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [memberId]);

  if (isLoading) return <div className="dl-page dl-loading"><p>Loading…</p></div>;
  if (error) return <div className="dl-page"><div className="dl-error">{error}</div></div>;
  if (!member) return null;

  const statCards = [
    { label: "Assigned", value: member.total_assigned },
    { label: "Accepted", value: member.total_accepted },
    { label: "Cancelled", value: member.total_cancelled },
    { label: "Acceptance %", value: member.total_assigned > 0 ? `${Math.round(member.total_accepted / member.total_assigned * 100)}%` : "—" },
  ];

  return (
    <div className="dl-page" style={{ paddingBottom: 90 }}>
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Member Detail</h1>
      </header>

      {/* Profile card */}
      <div style={{ margin: "16px 16px 0", background: "#fff", borderRadius: 14, padding: "20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{member.full_name}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Phone size={13} color="#6b7280" />
              <span style={{ fontSize: 13, color: "#6b7280" }}>{member.phone_number}</span>
            </div>
            {member.email && (
              <p style={{ fontSize: 13, color: "#6b7280", margin: "3px 0 0" }}>{member.email}</p>
            )}
            <p style={{ fontSize: 13, color: "#374151", margin: "6px 0 0" }}>
              {member.vehicle_type}{member.vehicle_number ? ` · ${member.vehicle_number}` : ""}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: STATUS_COLORS[member.account_status] || "#6b7280",
              background: `${STATUS_COLORS[member.account_status]}15`,
              padding: "4px 10px",
              borderRadius: 10,
              display: "block",
            }}>
              {member.account_status?.toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: member.is_online ? "#16a34a" : "#9ca3af", marginTop: 6, display: "block" }}>
              {member.is_online ? "● Online" : "○ Offline"}
            </span>
          </div>
        </div>

        {/* Rating */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
          <Star size={16} color="#f59e0b" fill="#f59e0b" />
          <span style={{ fontWeight: 600, fontSize: 15 }}>{Number(member.avg_rating).toFixed(1)}</span>
          <span style={{ color: "#9ca3af", fontSize: 13 }}>({member.rating_count} ratings)</span>
        </div>
      </div>

      {/* COD section */}
      {(member.cod_balance > 0 || member.cod_blocked) && (
        <div style={{ margin: "12px 16px 0", background: member.cod_blocked ? "#fef2f2" : "#fffbeb", border: `1px solid ${member.cod_blocked ? "#fca5a5" : "#fde68a"}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontWeight: 600, color: member.cod_blocked ? "#dc2626" : "#d97706", margin: 0 }}>
                {member.cod_blocked ? "⚠ COD Blocked" : "COD Pending"}
              </p>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0" }}>Balance owed to company</p>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: member.cod_blocked ? "#dc2626" : "#d97706", margin: 0 }}>
              ₹{Number(member.cod_balance).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 16px 0" }}>
        {statCards.map((c) => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>{c.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0", color: "#111827" }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Location */}
      {member.current_lat && (
        <div style={{ margin: "12px 16px 0", background: "#eff6ff", borderRadius: 10, padding: "12px 16px" }}>
          <p style={{ fontWeight: 600, color: "#1d4ed8", margin: 0 }}>📍 Last Known Location</p>
          <p style={{ fontSize: 13, color: "#374151", margin: "4px 0 0" }}>
            {Number(member.current_lat).toFixed(5)}, {Number(member.current_lng).toFixed(5)}
          </p>
          {member.location_updated_at && (
            <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
              Updated {new Date(member.location_updated_at).toLocaleString()}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.open(`https://maps.google.com/?q=${member.current_lat},${member.current_lng}`, "_blank")}
            style={{ marginTop: 8, padding: "7px 14px", background: "#1d4ed8", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Open in Maps
          </button>
        </div>
      )}

      {/* Documents */}
      {member.documents?.length > 0 && (
        <div style={{ padding: "12px 16px 0" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>Documents</h3>
          {member.documents.map((d, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, margin: 0, textTransform: "capitalize" }}>{d.doc_type.replace("_", " ")}</p>
                <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0" }}>{new Date(d.uploaded_at).toLocaleDateString()}</p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: d.verified ? "#16a34a" : "#f59e0b", background: d.verified ? "#f0fdf4" : "#fffbeb", padding: "3px 8px", borderRadius: 8 }}>
                {d.verified ? "Verified" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Joined */}
      <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>
        Joined {new Date(member.created_at).toLocaleDateString()}
      </p>

      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/team" className="dl-nav-item dl-nav-active"><Users size={22} /><span>Team</span></Link>
        <Link to="/earnings" className="dl-nav-item"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
