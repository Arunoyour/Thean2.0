import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ChevronRight, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { listOrderDisputes } from "../lib/api.js";

const STATUS_COLOR = {
  OPEN:      { bg: "#eff6ff", text: "#1d4ed8" },
  IN_REVIEW: { bg: "#fffbeb", text: "#d97706" },
  REOPENED:  { bg: "#faf5ff", text: "#7c3aed" },
  RESOLVED:  { bg: "#f0fdf4", text: "#16a34a" },
  CLOSED:    { bg: "#f3f4f6", text: "#6b7280" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

export function CustomerDisputeListPage() {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [filter, setFilter] = useState("OPEN");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setIsLoading(true);
    try {
      const data = await listOrderDisputes(filter === "ALL" ? undefined : filter);
      setDisputes(data || []);
    } catch (e) { setError(e.message); }
    finally { setIsLoading(false); }
  }

  const filters = ["OPEN", "IN_REVIEW", "REOPENED", "CLOSED", "ALL"];

  return (
    <div className="ph-page">
      <header className="ph-inner-header">
        <button type="button" className="ph-back-btn" onClick={() => navigate(-1)}>←</button>
        <h1>My Disputes</h1>
        <button type="button" className="ph-icon-btn" onClick={load}><RefreshCw size={18} /></button>
      </header>

      <div className="dispute-filter-tabs">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            className={`dispute-filter-tab${filter === f ? " active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="dispute-list-actions">
        <Link to="/home/disputes/raise" className="dispute-raise-link">
          <Plus size={16} /> Raise New Dispute
        </Link>
      </div>

      {error && <div className="dispute-error">{error}</div>}
      {isLoading ? <p className="ph-loading">Loading…</p> : disputes.length === 0 ? (
        <div className="dispute-empty">
          <MessageSquare size={40} />
          <p>No disputes in this category.</p>
        </div>
      ) : (
        <div className="dispute-list">
          {disputes.map((d) => {
            const col = STATUS_COLOR[d.status] || STATUS_COLOR.CLOSED;
            return (
              <Link key={d.dispute_id} to={`/home/disputes/${d.dispute_id}`} className="dispute-list-item">
                <div className="dispute-item-top">
                  <span className="dispute-status-badge" style={{ background: col.bg, color: col.text }}>
                    {d.status.replace("_", " ")}
                  </span>
                  {d.unread_by_raiser && (
                    <span className="dispute-unread-dot" title="New reply from admin" />
                  )}
                  <span className="dispute-age">{d.age_days}d old</span>
                </div>
                <div className="dispute-item-sectors">
                  {(d.tagged_sectors || []).map((s) => (
                    <span key={s} className="dispute-sector-tag">{s}</span>
                  ))}
                </div>
                <div className="dispute-item-bottom">
                  <span className="dispute-item-date">Raised {fmtDate(d.created_at)}</span>
                  <span className="dispute-msg-count"><MessageSquare size={12} /> {d.message_count}</span>
                  <ChevronRight size={16} className="dispute-chevron" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
