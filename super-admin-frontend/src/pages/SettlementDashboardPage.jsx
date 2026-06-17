import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { createSettlementCycle, listSettlementCycles } from "../lib/api.js";
import { canWriteConfig } from "../lib/role.js";
import { BackButton } from "../components/BackButton.jsx";

const STATUS_COLORS = {
  OPEN:             "#d97706",
  GENERATING:       "#7c3aed",
  PENDING_APPROVAL: "#2563eb",
  APPROVED:         "#059669",
  EXECUTED:         "#16a34a",
  CANCELLED:        "#6b7280",
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 99,
      fontSize: "0.75rem", fontWeight: 600,
      background: color + "18", color, border: `1px solid ${color}40`,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "EXECUTED", label: "Executed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function SettlementDashboardPage() {
  const navigate = useNavigate();
  const [cycles,    setCycles]    = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ cycle_date: "", cycle_type: "DAILY", notes: "" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const data = await listSettlementCycles({ status: statusFilter || undefined });
      setCycles(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    if (!form.cycle_date) { setFormError("Cycle date is required."); return; }
    setCreating(true);
    try {
      await createSettlementCycle(form);
      setShowCreate(false);
      setForm({ cycle_date: "", cycle_type: "DAILY", notes: "" });
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page">
      <BackButton />
      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 440, padding: "2rem" }}>
            <h2 style={{ marginTop: 0 }}>New Settlement Cycle</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label>
                Cycle date <span style={{ color: "#dc2626" }}>*</span>
                <input type="date" value={form.cycle_date} onChange={e => setForm(f => ({ ...f, cycle_date: e.target.value }))} required />
              </label>
              <label>
                Cycle type
                <select value={form.cycle_type} onChange={e => setForm(f => ({ ...f, cycle_type: e.target.value }))}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </label>
              <label>
                Notes (optional)
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </label>
              {formError && <div className="error" style={{ margin: 0 }}>{formError}</div>}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="outline-button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="button" disabled={creating}>{creating ? "Creating…" : "Create Cycle"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <p className="eyebrow">Finance</p>
          <h1 style={{ margin: 0 }}>Settlement Cycles</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="outline-button" onClick={load}><RefreshCw size={15} /> Refresh</button>
          {canWriteConfig() && (
            <button className="button" onClick={() => setShowCreate(true)}><Plus size={15} /> New Cycle</button>
          )}
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        {STATUS_FILTERS.map(f => (
          <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
            padding: "4px 14px", borderRadius: 99, fontSize: "0.82rem", fontWeight: 500, cursor: "pointer",
            border: "1px solid",
            borderColor: statusFilter === f.value ? "#2563eb" : "#d1d5db",
            background:  statusFilter === f.value ? "#eff6ff" : "white",
            color:        statusFilter === f.value ? "#2563eb" : "#374151",
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      {!isLoading && cycles.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          No settlement cycles found.
        </div>
      )}

      {/* Cycles table */}
      {cycles.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Date", "Type", "Batches", "Total Payable", "Status", "Created", ""].map(h => (
                  <th key={h} style={{ padding: "0.7rem 1rem", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycles.map(c => (
                <tr key={c.cycle_id} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                  onClick={() => navigate(`/dashboard/settlement/${c.cycle_id}`)}>
                  <td style={{ padding: "0.7rem 1rem", fontWeight: 600 }}>{c.cycle_date}</td>
                  <td style={{ padding: "0.7rem 1rem", color: "#6b7280" }}>{c.cycle_type}</td>
                  <td style={{ padding: "0.7rem 1rem" }}>{c.batch_count}</td>
                  <td style={{ padding: "0.7rem 1rem", fontWeight: 600 }}>
                    ₹{Number(c.total_payable).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.7rem 1rem" }}><StatusBadge status={c.status} /></td>
                  <td style={{ padding: "0.7rem 1rem", color: "#6b7280", fontSize: "0.8rem" }}>
                    {new Date(c.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td style={{ padding: "0.7rem 1rem" }}>
                    <button className="outline-button" style={{ fontSize: "0.78rem", padding: "3px 10px" }}
                      onClick={e => { e.stopPropagation(); navigate(`/dashboard/settlement/${c.cycle_id}`); }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
