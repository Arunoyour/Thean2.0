import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, IndianRupee, Truck, Users } from "lucide-react";
import { adminClearCod, getTeamCod } from "../lib/api.js";

export function TeamCODReconciliationPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(null); // account_id being cleared
  const [clearNote, setClearNote] = useState("");
  const [clearAmount, setClearAmount] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setIsLoading(true);
    try {
      const data = await getTeamCod();
      setMembers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleClear(e) {
    e.preventDefault();
    const amt = Number(clearAmount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    setError("");
    try {
      await adminClearCod(clearing, amt, clearNote.trim() || "Manual COD clearance");
      setSuccessMsg(`COD cleared for ₹${amt.toFixed(2)}`);
      setClearing(null);
      setClearAmount("");
      setClearNote("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const totalCod = members.reduce((s, m) => s + m.cod_balance, 0);
  const blockedCount = members.filter((m) => m.cod_blocked).length;

  return (
    <div className="dl-page" style={{ paddingBottom: 90 }}>
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>COD Reconciliation</h1>
      </header>

      {/* Summary */}
      {!isLoading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
          <div style={{ background: "#1d4ed8", borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "#bfdbfe", margin: 0 }}>Total COD Pending</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "4px 0 0" }}>₹{totalCod.toFixed(2)}</p>
          </div>
          <div style={{ background: blockedCount > 0 ? "#fef2f2" : "#f0fdf4", borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: blockedCount > 0 ? "#fca5a5" : "#86efac", margin: 0 }}>Blocked Accounts</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: blockedCount > 0 ? "#ef4444" : "#16a34a", margin: "4px 0 0" }}>{blockedCount}</p>
          </div>
        </div>
      )}

      {error && <div className="dl-error" style={{ margin: "12px 16px 0" }}>{error}</div>}
      {successMsg && <div className="dl-success" style={{ margin: "12px 16px 0" }}>{successMsg}</div>}
      {isLoading && <div className="dl-loading"><p>Loading…</p></div>}

      {!isLoading && members.length === 0 && !error && (
        <p className="dl-empty-hint">No pending COD balances.</p>
      )}

      <div style={{ padding: "12px 16px 0" }}>
        {members.map((m) => (
          <div key={m.account_id} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{m.full_name}</p>
                  {m.cod_blocked && (
                    <span style={{ fontSize: 11, color: "#ef4444", background: "#fef2f2", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>
                      BLOCKED
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "3px 0 0" }}>{m.phone_number}</p>
                <p style={{ fontSize: 12, color: m.is_online ? "#16a34a" : "#9ca3af", margin: "2px 0 0" }}>
                  {m.is_online ? "● Online" : "○ Offline"}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontWeight: 700, fontSize: 18, color: "#ef4444", margin: 0 }}>
                  ₹{m.cod_balance.toFixed(2)}
                </p>
                <button
                  type="button"
                  onClick={() => { setClearing(m.account_id); setSuccessMsg(""); setError(""); }}
                  style={{ marginTop: 6, padding: "6px 14px", background: "#1d4ed8", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Clear COD
                </button>
              </div>
            </div>

            {/* Clear form inline */}
            {clearing === m.account_id && (
              <form onSubmit={handleClear} style={{ marginTop: 12, borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Amount (₹)"
                    value={clearAmount}
                    onChange={(e) => setClearAmount(e.target.value)}
                    style={{ flex: 1, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }}
                  />
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={clearNote}
                    onChange={(e) => setClearNote(e.target.value)}
                    style={{ flex: 2, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setClearing(null)} style={{ flex: 1, padding: "9px", background: "#e5e7eb", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button type="submit" style={{ flex: 1, padding: "9px", background: "#16a34a", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Confirm</button>
                </div>
              </form>
            )}
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
