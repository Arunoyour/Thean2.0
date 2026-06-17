import { useState } from "react";
import { getHolidayWarning, createClosure, deleteClosure } from "../lib/api.js";

export function HolidayModePage() {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [warning, setWarning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Delete a closure
  const [deleteDate, setDeleteDate] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleCheck() {
    if (!date) { setError("Select a date."); return; }
    setError(""); setWarning(null); setSuccess("");
    setLoading(true);
    try { setWarning(await getHolidayWarning(date)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleConfirm() {
    setError(""); setConfirming(true);
    try {
      await createClosure({ closure_date: date, reason: reason.trim() || null });
      setSuccess(`Shop marked as closed on ${date}. Affected bookings have been cancelled.`);
      setWarning(null);
    } catch (err) { setError(err.message); }
    finally { setConfirming(false); }
  }

  async function handleDelete() {
    if (!deleteDate) { setError("Enter a date to reopen."); return; }
    if (!confirm(`Remove the closure for ${deleteDate}?`)) return;
    setDeleting(true);
    try {
      await deleteClosure(deleteDate);
      setSuccess(`Closure for ${deleteDate} removed. Shop is open again.`);
      setDeleteDate("");
    } catch (err) { setError(err.message); }
    finally { setDeleting(false); }
  }

  return (
    <div className="hc-page">
      <div className="hc-topbar">
        <h2>Holiday / Closure Mode</h2>
      </div>

      <div className="hc-content">
        {error && <div className="hc-error">{error}</div>}
        {success && <div className="hc-success">{success}</div>}

        {/* Mark closed */}
        <div className="hc-card">
          <div className="hc-card-title">Mark a Day as Closed</div>
          <div className="hc-form">
            <label>Date *<input type="date" value={date} onChange={e => { setDate(e.target.value); setWarning(null); }} /></label>
            <label>Reason (optional)<input value={reason} onChange={e => setReason(e.target.value)} placeholder="Holiday, maintenance…" /></label>
            <button className="hc-btn hc-btn-secondary" onClick={handleCheck} disabled={loading}>
              {loading ? "Checking…" : "Check Existing Bookings"}
            </button>

            {warning && (
              <div style={{ background: "#f8fbfa", border: "1px solid #dce6e3", borderRadius: 12, padding: 16 }}>
                {warning.existing_booking_count === 0 ? (
                  <p style={{ color: "#115e36", fontSize: "0.9rem" }}>No bookings on this day. Safe to close.</p>
                ) : (
                  <p style={{ color: "#b45309", fontSize: "0.9rem", marginBottom: 12 }}>
                    ⚠ {warning.existing_booking_count} booking{warning.existing_booking_count !== 1 ? "s" : ""} will be cancelled and tokens refunded.
                  </p>
                )}
                <button className="hc-btn hc-btn-danger" onClick={handleConfirm} disabled={confirming} style={{ width: "100%" }}>
                  {confirming ? "Closing…" : `Confirm — Close ${date}`}
                </button>
              </div>
            )}
          </div>
        </div>

        <hr className="hc-divider" />

        {/* Reopen */}
        <div className="hc-card">
          <div className="hc-card-title">Reopen a Previously Closed Day</div>
          <div className="hc-form">
            <label>Date to Reopen<input type="date" value={deleteDate} onChange={e => setDeleteDate(e.target.value)} /></label>
            <button className="hc-btn hc-btn-success" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removing…" : "Remove Closure"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
