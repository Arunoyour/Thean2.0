import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Package,
  Truck,
  Wallet,
} from "lucide-react";
import { getDeliveryEarnings, getDeliveryRateConfig, requestDeliveryCashout } from "../lib/api.js";

export function EarningsPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [rateConfig, setRateConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCashout, setShowCashout] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [isCashing, setIsCashing] = useState(false);
  const [error, setError] = useState("");
  const [cashoutMsg, setCashoutMsg] = useState("");

  useEffect(() => { loadEarnings(); }, []);

  async function loadEarnings() {
    setIsLoading(true);
    try {
      const [data, rate] = await Promise.all([getDeliveryEarnings(), getDeliveryRateConfig()]);
      setSummary(data);
      setRateConfig(rate);
    } catch (e) { setError(e.message); } finally { setIsLoading(false); }
  }

  async function handleCashout(e) {
    e.preventDefault();
    const amt = Number(cashoutAmount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    if (!upiId.trim()) { setError("Enter your UPI ID."); return; }
    setIsCashing(true); setError("");
    try {
      await requestDeliveryCashout(amt, upiId.trim());
      setCashoutMsg(`₹${amt.toFixed(2)} cashout requested to ${upiId.trim()}. Processed within 24h.`);
      setShowCashout(false);
      setCashoutAmount(""); setUpiId("");
      await loadEarnings();
    } catch (err) { setError(err.message); } finally { setIsCashing(false); }
  }

  if (isLoading) return <div className="dl-page dl-loading"><p>Loading…</p></div>;

  const w = summary?.wallet;

  return (
    <div className="dl-page dl-earnings-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h1>Earnings & Wallet</h1>
      </header>

      {error ? <div className="dl-error">{error}</div> : null}
      {cashoutMsg ? <div className="dl-success">{cashoutMsg}</div> : null}

      {/* Wallet card */}
      {w ? (
        <div className="dl-wallet-card">
          <div className="dl-wallet-header">
            <Wallet size={24} />
            <div>
              <p className="dl-wallet-label">Available Balance</p>
              <h2 className="dl-wallet-balance">₹{Number(w.balance).toFixed(2)}</h2>
            </div>
          </div>
          <div className="dl-wallet-stats">
            <div><span>Total Earned</span><strong>₹{Number(w.total_earned).toFixed(2)}</strong></div>
            <div><span>Withdrawn</span><strong>₹{Number(w.total_withdrawn).toFixed(2)}</strong></div>
          </div>
          <button
            className="dl-btn dl-btn-cashout"
            type="button"
            disabled={Number(w.balance) <= 0}
            onClick={() => setShowCashout(!showCashout)}
          >
            <IndianRupee size={16} /> Cash Out
          </button>
          {showCashout ? (
            <form className="dl-cashout-form" onSubmit={handleCashout}>
              <label>
                Amount (₹)
                <input type="number" min="1" step="0.01" placeholder="100.00" value={cashoutAmount} onChange={(e) => setCashoutAmount(e.target.value)} />
              </label>
              <label>
                UPI ID
                <input type="text" placeholder="name@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
              </label>
              <button className="dl-btn" type="submit" disabled={isCashing}>{isCashing ? "Processing…" : "Request Cashout"}</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Live rate badge */}
      {rateConfig && (
        <div className="dl-rate-badge">
          <Truck size={16} />
          Current rate: <strong>₹{parseFloat(rateConfig.rate_per_km).toFixed(2)}/km</strong>
        </div>
      )}

      {/* Period summaries */}
      {summary ? (
        <div className="dl-period-grid">
          <div className="dl-period-card">
            <p>Today</p>
            <strong>₹{Number(summary.today).toFixed(2)}</strong>
          </div>
          <div className="dl-period-card">
            <p>This Week</p>
            <strong>₹{Number(summary.this_week).toFixed(2)}</strong>
          </div>
          <div className="dl-period-card">
            <p>This Month</p>
            <strong>₹{Number(summary.this_month).toFixed(2)}</strong>
          </div>
          <div className="dl-period-card">
            <p>All Time</p>
            <strong>₹{Number(summary.total).toFixed(2)}</strong>
          </div>
        </div>
      ) : null}

      {/* Recent earnings */}
      <h3 className="dl-section-title">Recent Earnings</h3>
      {summary?.recent?.length ? (
        <div className="dl-earnings-list">
          {summary.recent.map((e) => (
            <div key={e.earning_id} className="dl-earning-item">
              <div className="dl-earning-icon">
                <Package size={18} />
              </div>
              <div className="dl-earning-info">
                <p>Delivery completed</p>
                <time>{new Date(e.earned_at).toLocaleString()}</time>
              </div>
              <div className={`dl-earning-amount ${e.status === "withdrawn" ? "dl-earning-withdrawn" : ""}`}>
                ₹{Number(e.amount).toFixed(2)}
                {e.status === "withdrawn" ? <span>(withdrawn)</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="dl-empty-hint">No earnings yet. Complete your first delivery!</p>
      )}

      {/* Bottom nav */}
      <nav className="dl-bottom-nav">
        <Link to="/home" className="dl-nav-item"><Truck size={22} /><span>Home</span></Link>
        <Link to="/orders" className="dl-nav-item"><Package size={22} /><span>Orders</span></Link>
        <Link to="/earnings" className="dl-nav-item dl-nav-active"><IndianRupee size={22} /><span>Earnings</span></Link>
      </nav>
    </div>
  );
}
