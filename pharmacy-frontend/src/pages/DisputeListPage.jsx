import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, MessageSquare, RefreshCw } from "lucide-react";
import { listPharmacyOrderDisputes } from "../lib/api.js";

const STATUS_COLOR = { OPEN:"#2563eb", IN_REVIEW:"#d97706", REOPENED:"#7c3aed", RESOLVED:"#16a34a", CLOSED:"#6b7280" };

export function DisputeListPage() {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [filter, setFilter] = useState("OPEN");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setIsLoading(true);
    try { setDisputes(await listPharmacyOrderDisputes(filter === "ALL" ? undefined : filter) || []); }
    catch (e) { setError(e.message); }
    finally { setIsLoading(false); }
  }

  return (
    <div className="ph-page">
      <header className="ph-inner-header">
        <button type="button" className="ph-back-btn" onClick={() => navigate(-1)}>←</button>
        <h1>Disputes</h1>
        <button type="button" className="ph-icon-btn" onClick={load}><RefreshCw size={18} /></button>
      </header>
      <div className="dispute-filter-tabs">
        {["OPEN","IN_REVIEW","REOPENED","CLOSED","ALL"].map((f) => (
          <button key={f} type="button" className={`dispute-filter-tab${filter===f?" active":""}`} onClick={() => setFilter(f)}>{f.replace("_"," ")}</button>
        ))}
      </div>
      {error && <div className="dispute-error">{error}</div>}
      {isLoading ? <p className="ph-loading">Loading…</p> : disputes.length === 0 ? (
        <div className="dispute-empty"><MessageSquare size={40} /><p>No disputes found.</p></div>
      ) : (
        <div className="dispute-list">
          {disputes.map((d) => (
            <Link key={d.dispute_id} to={`/disputes/${d.dispute_id}`} className="dispute-list-item">
              <div className="dispute-item-top">
                <span className="dispute-status-badge" style={{ background: STATUS_COLOR[d.status]+"22", color: STATUS_COLOR[d.status] }}>{d.status.replace("_"," ")}</span>
                {d.unread_by_raiser && <span className="dispute-unread-dot" />}
                <span className="dispute-age">{d.age_days}d old</span>
              </div>
              <div className="dispute-item-sectors">{(d.tagged_sectors||[]).map((s) => <span key={s} className="dispute-sector-tag">{s}</span>)}</div>
              <div className="dispute-item-bottom">
                <span className="dispute-item-date">{new Date(d.created_at).toLocaleDateString()}</span>
                <span className="dispute-msg-count"><MessageSquare size={12}/> {d.message_count}</span>
                <ChevronRight size={16} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
