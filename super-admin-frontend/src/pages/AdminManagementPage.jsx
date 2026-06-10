import { useEffect, useState } from "react";
import { Plus, RefreshCw, Shield, Trash2, UserCheck } from "lucide-react";
import { createAdmin, changeAdminRole, deactivateAdmin, listAdmins } from "../lib/api.js";

const ASSIGNABLE_ROLES = ["SUPERVISOR", "CHECKER", "AUDITOR", "TEAM_LEAD"];
const ROLE_LABELS = {
  SUPER: "Super",
  SUPERVISOR: "Supervisor",
  CHECKER: "Checker",
  AUDITOR: "Auditor",
  TEAM_LEAD: "Team Lead",
};
const ROLE_COLORS = {
  SUPER: "#dc2626",
  SUPERVISOR: "#7c3aed",
  CHECKER: "#2563eb",
  AUDITOR: "#059669",
  TEAM_LEAD: "#d97706",
};

function RoleBadge({ role }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 99,
      fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.03em",
      background: ROLE_COLORS[role] + "18", color: ROLE_COLORS[role],
      border: `1px solid ${ROLE_COLORS[role]}40`,
    }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export function AdminManagementPage() {
  const [admins, setAdmins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone_number: "", role: "CHECKER" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // admin object
  const [deactivateReason, setDeactivateReason] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const data = await listAdmins();
      setAdmins(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    if (!form.full_name.trim() || !form.email.trim() || !form.phone_number.trim()) {
      setFormError("All fields are required.");
      return;
    }
    setSubmitting(true);
    try {
      const newAdmin = await createAdmin(form);
      setAdmins(prev => [...prev, newAdmin]);
      setShowCreate(false);
      setForm({ full_name: "", email: "", phone_number: "", role: "CHECKER" });
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(adminId, newRole) {
    try {
      const updated = await changeAdminRole(adminId, newRole);
      setAdmins(prev => prev.map(a => a.admin_id === adminId ? updated : a));
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleDeactivate() {
    if (!deactivateReason.trim()) return;
    setDeactivating(true);
    try {
      await deactivateAdmin(confirmDeactivate.admin_id, deactivateReason);
      setAdmins(prev => prev.map(a =>
        a.admin_id === confirmDeactivate.admin_id ? { ...a, is_active: false } : a
      ));
      setConfirmDeactivate(null);
      setDeactivateReason("");
    } catch (e) {
      alert(e.message);
    } finally {
      setDeactivating(false);
    }
  }

  if (isLoading) return <main className="page"><p>Loading admins…</p></main>;

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow">Super admin</p>
          <h1 style={{ margin: 0 }}>Admin Management</h1>
          <p style={{ color: "#6b7280", marginTop: "0.25rem" }}>Only the SUPER account can manage admin users.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="outline-button" onClick={load}><RefreshCw size={15} /> Refresh</button>
          <button className="button" onClick={() => setShowCreate(true)}><Plus size={15} /> Add Admin</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 460, padding: "2rem" }}>
            <h2 style={{ marginTop: 0 }}>Add Admin Account</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label>Full name<input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required /></label>
              <label>Email<input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></label>
              <label>Phone number<input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="+919876543210" required /></label>
              <label>Role
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </label>
              {formError && <div className="error" style={{ margin: 0 }}>{formError}</div>}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button type="button" className="outline-button" onClick={() => { setShowCreate(false); setFormError(""); }}>Cancel</button>
                <button type="submit" className="button" disabled={submitting}>{submitting ? "Creating…" : "Create Admin"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {confirmDeactivate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="panel" style={{ width: "100%", maxWidth: 420, padding: "2rem" }}>
            <h2 style={{ marginTop: 0, color: "#dc2626" }}>Deactivate Admin</h2>
            <p>You are about to deactivate <strong>{confirmDeactivate.full_name}</strong> ({confirmDeactivate.role}). They will immediately lose access.</p>
            <label style={{ display: "block", marginBottom: "1rem" }}>
              Reason (required)
              <textarea value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)} rows={3} style={{ width: "100%", marginTop: "0.35rem" }} />
            </label>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button className="outline-button" onClick={() => { setConfirmDeactivate(null); setDeactivateReason(""); }}>Cancel</button>
              <button className="button" style={{ background: "#dc2626" }} disabled={!deactivateReason.trim() || deactivating} onClick={handleDeactivate}>
                {deactivating ? "Deactivating…" : "Confirm Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admins table */}
      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {["Name", "Email", "Phone", "Role", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.map(admin => (
              <tr key={admin.admin_id} style={{ borderBottom: "1px solid #f3f4f6", opacity: admin.is_active ? 1 : 0.5 }}>
                <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>
                  <Shield size={14} style={{ marginRight: 6, color: ROLE_COLORS[admin.role] }} />
                  {admin.full_name}
                </td>
                <td style={{ padding: "0.75rem 1rem", color: "#6b7280" }}>{admin.email}</td>
                <td style={{ padding: "0.75rem 1rem", color: "#6b7280" }}>{admin.phone_number}</td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  {admin.role === "SUPER" ? (
                    <RoleBadge role="SUPER" />
                  ) : (
                    <select
                      value={admin.role}
                      disabled={!admin.is_active}
                      onChange={e => handleRoleChange(admin.admin_id, e.target.value)}
                      style={{ fontSize: "0.85rem", padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                    >
                      {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  )}
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  <span style={{ color: admin.is_active ? "#16a34a" : "#dc2626", fontWeight: 500, fontSize: "0.82rem" }}>
                    {admin.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  {admin.role !== "SUPER" && admin.is_active && (
                    <button
                      className="outline-button"
                      style={{ fontSize: "0.8rem", padding: "3px 10px", color: "#dc2626", borderColor: "#dc2626" }}
                      onClick={() => setConfirmDeactivate(admin)}
                    >
                      <Trash2 size={13} /> Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
