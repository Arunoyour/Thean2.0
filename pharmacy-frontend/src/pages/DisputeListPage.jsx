import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { listPharmacyOrderDisputes } from "../lib/api.js";
import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";

const STATUS_COLOR = { OPEN:"#2563eb", IN_REVIEW:"#d97706", REOPENED:"#7c3aed", RESOLVED:"#16a34a", CLOSED:"#6b7280" };
const FILTERS = ["OPEN", "IN_REVIEW", "REOPENED", "CLOSED", "ALL"];

export function DisputeListPage() {
  const [disputes, setDisputes] = useState([]);
  const [filter, setFilter] = useState("OPEN");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(f = filter) {
    setIsLoading(true);
    setError("");
    try { setDisputes(await listPharmacyOrderDisputes(f === "ALL" ? undefined : f) || []); }
    catch (e) { setError(e.message); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { load(); }, [filter]);

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <p className="eyebrow">Support</p>
          <h1>Disputes</h1>
          <p>Track and manage your open disputes with the platform.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link to="/disputes/raise" className="outline-button button-small">
            <Plus size={15} /> New
          </Link>
          <button className="outline-button button-small" type="button" onClick={() => load()}>
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className="settlement-filter-chips">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`settlement-filter-chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {isLoading && <p className="field-help" style={{ textAlign: "center", padding: "2rem 0" }}>Loading disputes…</p>}

      {!isLoading && disputes.length === 0 && !error && (
        <div className="panel settlement-empty">
          <MessageSquare size={36} color="#9ca3af" />
          <p>No disputes found</p>
          <p>Open disputes will appear here. Use the New button to raise one.</p>
        </div>
      )}

      {!isLoading && disputes.length > 0 && (
        <div className="dispute-list">
          {disputes.map((d) => (
            <Link key={d.dispute_id} to={`/disputes/${d.dispute_id}`} className="dispute-list-item">
              <div className="dispute-item-top">
                <span className="dispute-status-badge" style={{ background: STATUS_COLOR[d.status]+"22", color: STATUS_COLOR[d.status] }}>{d.status.replace(/_/g, " ")}</span>
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
    </PharmacyPageShell>
  );
}
