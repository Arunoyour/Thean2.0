import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, IndianRupee, MessageSquare, Package, Plus, RefreshCw, Truck } from "lucide-react";
import { listDeliveryOrderDisputes } from "../lib/api.js";

const STATUS_COLOR = { OPEN:"#3b82f6", IN_REVIEW:"#f59e0b", REOPENED:"#8b5cf6", RESOLVED:"#10b981", CLOSED:"#6b7280" };

export function DeliveryDisputeListPage() {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [filter, setFilter] = useState("OPEN");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setIsLoading(true);
    try { setDisputes(await listDeliveryOrderDisputes(filter==="ALL"?undefined:filter)||[]); }
    catch (e) { setError(e.message); }
    finally { setIsLoading(false); }
  }

  return (
    <div className="dl-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}>←</button>
        <h1>My Disputes</h1>
        <button type="button" onClick={load}><RefreshCw size={18}/></button>
      </header>
      <div className="dispute-filter-tabs">
        {["OPEN","IN_REVIEW","REOPENED","CLOSED","ALL"].map((f) => (
          <button key={f} type="button" className={`dispute-filter-tab${filter===f?" active":""}`} onClick={()=>setFilter(f)}>{f.replace("_"," ")}</button>
        ))}
      </div>
      <div className="dispute-list-actions">
        <Link to="/disputes/raise" className="dispute-raise-link"><Plus size={16}/> Raise New Dispute</Link>
      </div>
      {error && <div className="dispute-error">{error}</div>}
      {isLoading ? <p className="dl-loading">Loading…</p> : disputes.length===0 ? (
        <div className="dispute-empty"><MessageSquare size={40}/><p>No disputes found.</p></div>
      ) : (
        <div className="dispute-list">
          {disputes.map((d) => (
            <Link key={d.dispute_id} to={`/disputes/${d.dispute_id}`} className="dispute-list-item">
              <div className="dispute-item-top">
                <span className="dispute-status-badge" style={{background:STATUS_COLOR[d.status]+"22",color:STATUS_COLOR[d.status]}}>{d.status.replace("_"," ")}</span>
                {d.unread_by_raiser && <span className="dispute-unread-dot"/>}
                <span className="dispute-age">{d.age_days}d old</span>
              </div>
              <div className="dispute-item-sectors">{(d.tagged_sectors||[]).map((s)=><span key={s} className="dispute-sector-tag">{s}</span>)}</div>
              <div className="dispute-item-bottom">
                <span>{new Date(d.created_at).toLocaleDateString()}</span>
                <span className="dispute-msg-count"><MessageSquare size={12}/> {d.message_count}</span>
                <ChevronRight size={16}/>
              </div>
            </Link>
          ))}
        </div>
      )}
      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22}/><span>Home</span></Link>
        <Link to="/orders" className="dl-nav-item"><Package size={22}/><span>Orders</span></Link>
        <Link to="/earnings" className="dl-nav-item"><IndianRupee size={22}/><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
