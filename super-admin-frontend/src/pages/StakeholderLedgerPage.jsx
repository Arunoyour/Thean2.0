import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, RefreshCw, Search } from "lucide-react";
import { getStakeholderLedger } from "../lib/api.js";

const ENTRY_TYPE_COLORS = { CREDIT: "#16a34a", DEBIT: "#dc2626" };

const REFERENCE_TYPE_LABELS = {
  ORDER:              "Order",
  COD_COLLECTION:     "COD Collection",
  PLATFORM_FEE:       "Platform Fee",
  GST:                "GST",
  ADJUSTMENT:         "Adjustment",
  REFUND:             "Refund",
  PENALTY:            "Penalty",
  SETTLEMENT_PAYOUT:  "Settlement Payout",
};

function exportCSV(entries, stakeholderType, stakeholderId) {
  const header = ["Date", "Type", "Reference", "Description", "Amount", "Running Balance"];
  const rows = entries.map(e => [
    new Date(e.created_at).toLocaleString("en-IN"),
    e.entry_type,
    REFERENCE_TYPE_LABELS[e.reference_type] ?? e.reference_type,
    (e.description ?? "").replace(/,/g, ";"),
    e.entry_type === "CREDIT"
      ? `+${Number(e.amount).toFixed(2)}`
      : `-${Number(e.amount).toFixed(2)}`,
    Number(e.running_balance).toFixed(2),
  ]);
  const csv  = [header, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `ledger_${stakeholderType}_${stakeholderId}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StakeholderLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Pre-fill from URL params so this page can be linked from batch detail
  const [stakeholderType, setStakeholderType] = useState(searchParams.get("type") ?? "PHARMACY");
  const [stakeholderId,   setStakeholderId]   = useState(searchParams.get("id")   ?? "");
  const [dateFrom,        setDateFrom]        = useState(searchParams.get("from") ?? "");
  const [dateTo,          setDateTo]          = useState(searchParams.get("to")   ?? "");

  const [ledger,    setLedger]    = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState("");

  async function load() {
    if (!stakeholderId.trim()) { setError("Enter a stakeholder ID to view their ledger."); return; }
    setIsLoading(true);
    setError("");
    try {
      const data = await getStakeholderLedger(stakeholderType, stakeholderId.trim(), {
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
        limit: 200,
      });
      setLedger(data);
      // Sync URL params so the page is shareable
      setSearchParams({
        type: stakeholderType,
        id:   stakeholderId.trim(),
        ...(dateFrom ? { from: dateFrom } : {}),
        ...(dateTo   ? { to:   dateTo   } : {}),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  // Auto-load if URL already has params
  useEffect(() => {
    if (searchParams.get("id")) load();
  }, []);

  const entries = ledger?.entries ?? [];

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <p className="eyebrow">Finance</p>
          <h1 style={{ margin: 0 }}>Stakeholder Ledger</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {entries.length > 0 && (
            <button className="outline-button" onClick={() => exportCSV(entries, stakeholderType, stakeholderId)}>
              <Download size={15} /> Export CSV
            </button>
          )}
          <button className="outline-button" onClick={load}><RefreshCw size={15} /></button>
        </div>
      </div>

      {/* Search panel */}
      <div className="panel" style={{ padding: "1rem 1.25rem", marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          Stakeholder type
          <select value={stakeholderType} onChange={e => setStakeholderType(e.target.value)} style={{ padding: "5px 8px" }}>
            <option value="PHARMACY">Pharmacy</option>
            <option value="DELIVERY_BOY">Delivery Boy</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500, flex: 1, minWidth: 220 }}>
          Stakeholder ID <span style={{ color: "#dc2626" }}>*</span>
          <input
            value={stakeholderId}
            onChange={e => setStakeholderId(e.target.value)}
            placeholder="UUID"
            style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: "0.82rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          From
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: "5px 8px" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", fontWeight: 500 }}>
          To
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: "5px 8px" }} />
        </label>
        <button className="button" onClick={load} style={{ alignSelf: "flex-end" }}>
          <Search size={15} /> Search
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {isLoading && <p style={{ color: "#6b7280" }}>Loading ledger…</p>}

      {/* Current balance card */}
      {ledger && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <div className="panel" style={{ padding: "1rem 1.5rem", flex: "0 0 auto" }}>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Current Balance
            </p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "1.6rem", fontWeight: 700,
              color: ledger.current_balance >= 0 ? "#16a34a" : "#dc2626" }}>
              ₹{Number(ledger.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#9ca3af" }}>
              {ledger.stakeholder_type} · {ledger.stakeholder_id?.slice(0, 8)}…
            </p>
          </div>
          <div className="panel" style={{ padding: "1rem 1.5rem", flex: "0 0 auto" }}>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Entries shown</p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "1.6rem", fontWeight: 700 }}>{entries.length}</p>
          </div>
          {entries.length > 0 && (
            <>
              <div className="panel" style={{ padding: "1rem 1.5rem", flex: "0 0 auto" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Credits</p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "1.25rem", fontWeight: 700, color: "#16a34a" }}>
                  ₹{entries.filter(e => e.entry_type === "CREDIT")
                    .reduce((s, e) => s + e.amount, 0)
                    .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="panel" style={{ padding: "1rem 1.5rem", flex: "0 0 auto" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Debits</p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "1.25rem", fontWeight: 700, color: "#dc2626" }}>
                  ₹{entries.filter(e => e.entry_type === "DEBIT")
                    .reduce((s, e) => s + e.amount, 0)
                    .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Ledger table */}
      {ledger && entries.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          No ledger entries found for this period.
        </div>
      )}

      {entries.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Date", "Type", "Reference", "Description", "Amount", "Running Balance"].map(h => (
                  <th key={h} style={{ padding: "0.65rem 1rem", textAlign: h === "Amount" || h === "Running Balance" ? "right" : "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const isCredit = e.entry_type === "CREDIT";
                return (
                  <tr key={e.entry_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "0.6rem 1rem", color: "#6b7280", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                      {new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ padding: "0.6rem 1rem" }}>
                      <span style={{
                        display: "inline-block", padding: "1px 8px", borderRadius: 99,
                        fontSize: "0.72rem", fontWeight: 700,
                        background: ENTRY_TYPE_COLORS[e.entry_type] + "18",
                        color: ENTRY_TYPE_COLORS[e.entry_type],
                        border: `1px solid ${ENTRY_TYPE_COLORS[e.entry_type]}40`,
                      }}>
                        {e.entry_type}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 1rem", color: "#6b7280", fontSize: "0.8rem" }}>
                      {REFERENCE_TYPE_LABELS[e.reference_type] ?? e.reference_type}
                    </td>
                    <td style={{ padding: "0.6rem 1rem", maxWidth: 280 }}>
                      <span title={e.description} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.description}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontWeight: 600, color: ENTRY_TYPE_COLORS[e.entry_type], fontFamily: "monospace" }}>
                      {isCredit ? "+" : "−"}₹{Number(e.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontFamily: "monospace", fontWeight: 500,
                      color: e.running_balance >= 0 ? "#374151" : "#dc2626" }}>
                      ₹{Number(e.running_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "0.65rem 1rem", fontSize: "0.8rem", color: "#6b7280", borderTop: "1px solid #f3f4f6" }}>
            Showing {entries.length} entries (most recent first) — use date filters to narrow the range
          </div>
        </div>
      )}
    </main>
  );
}
