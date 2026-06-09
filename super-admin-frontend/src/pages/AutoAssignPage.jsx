import { useEffect, useState } from "react";
import { listUnassignedOrders, triggerAutoAssign } from "../lib/api.js";

function ScoreBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: "#7c3aed", height: "100%", borderRadius: 4, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: "0.78rem", color: "#6b7280", minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

function VehicleIcon({ type }) {
  const icons = { bike: "🛵", car: "🚗", cycle: "🚲" };
  return <span>{icons[type?.toLowerCase()] || "🚚"}</span>;
}

export function AutoAssignPage() {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState("");

  // { [source_order_id]: { loading, result, error } }
  const [assignState, setAssignState] = useState({});

  async function fetchOrders() {
    setLoadingOrders(true);
    setOrdersError("");
    try {
      const data = await listUnassignedOrders();
      setOrders(data);
    } catch (e) {
      setOrdersError(e.message);
    } finally {
      setLoadingOrders(false);
    }
  }

  useEffect(() => { fetchOrders(); }, []);

  async function handleAssign(order) {
    const id = order.source_order_id;
    setAssignState((prev) => ({ ...prev, [id]: { loading: true, result: null, error: "" } }));
    try {
      const result = await triggerAutoAssign({
        sector: order.sector,
        source_order_id: id,
        pickup_lat: order.pickup_lat,
        pickup_lng: order.pickup_lng,
        dropoff_lat: order.dropoff_lat,
        dropoff_lng: order.dropoff_lng,
        cod_amount: order.cod_amount || 0,
        order_value: order.order_value || 0,
        distance_km: null,
      });
      setAssignState((prev) => ({ ...prev, [id]: { loading: false, result, error: "" } }));
      // Remove from unassigned list if assigned
      if (result.assigned) {
        setOrders((prev) => prev.filter((o) => o.source_order_id !== id));
      }
    } catch (e) {
      setAssignState((prev) => ({ ...prev, [id]: { loading: false, result: null, error: e.message } }));
    }
  }

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h1>Auto-Assign Deliveries</h1>
        <button className="sa-btn sa-btn-secondary" type="button" onClick={fetchOrders} disabled={loadingOrders}>
          {loadingOrders ? "Loading…" : "↺ Refresh"}
        </button>
      </div>

      {ordersError ? <div className="sa-error-banner">{ordersError}</div> : null}

      {!loadingOrders && orders.length === 0 ? (
        <div className="sa-empty-state">
          <p>✅ No orders waiting for a delivery partner.</p>
        </div>
      ) : null}

      <div className="aa-order-list">
        {orders.map((order) => {
          const state = assignState[order.source_order_id] || {};
          const result = state.result;

          return (
            <div key={order.source_order_id} className="aa-order-card">
              {/* Order header */}
              <div className="aa-order-header">
                <div>
                  <span className="aa-sector-badge">{order.sector}</span>
                  <span className="aa-order-id">{order.source_order_id.slice(0, 8)}…</span>
                  {order.pharmacy_name ? <span className="aa-pharmacy-name">· {order.pharmacy_name}</span> : null}
                </div>
                <div className="aa-order-meta">
                  {order.order_value > 0 ? <span>₹{order.order_value.toFixed(2)}</span> : null}
                  {order.cod_amount > 0 ? <span className="aa-cod-tag">COD ₹{order.cod_amount.toFixed(2)}</span> : null}
                  {order.ready_since ? (
                    <span className="aa-ready-since">
                      Since {new Date(order.ready_since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Assign button */}
              {!result ? (
                <button
                  className="sa-btn sa-btn-primary aa-assign-btn"
                  type="button"
                  disabled={state.loading}
                  onClick={() => handleAssign(order)}
                >
                  {state.loading ? "Finding best driver…" : "🎯 Auto-Assign"}
                </button>
              ) : null}

              {state.error ? <div className="aa-error">{state.error}</div> : null}

              {/* Result */}
              {result ? (
                <div className="aa-result">
                  {result.assigned ? (
                    <div className="aa-result-success">
                      <span>✅ Assigned to</span>
                      <strong>{result.assigned_driver?.full_name}</strong>
                      <VehicleIcon type={result.assigned_driver?.vehicle_type} />
                      <span>{result.assigned_driver?.vehicle_type}</span>
                      <span className="aa-dist">{result.assigned_driver?.distance_km?.toFixed(1)} km away</span>
                      <span className="aa-score">Score: {(result.assigned_driver?.final_score * 100).toFixed(0)}%</span>
                    </div>
                  ) : (
                    <div className="aa-result-fail">
                      ❌ Could not assign — {result.reason || "no eligible drivers"}
                    </div>
                  )}

                  {/* Full scoring table */}
                  {result.all_candidates?.length > 0 ? (
                    <div className="aa-candidates">
                      <h4>All Candidates ({result.all_candidates.length})</h4>
                      <div className="aa-table-wrap">
                        <table className="aa-table">
                          <thead>
                            <tr>
                              <th>Driver</th>
                              <th>Vehicle</th>
                              <th>Dist (km)</th>
                              <th>Proximity</th>
                              <th>Rating</th>
                              <th>Vehicle Score</th>
                              <th>Final</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.all_candidates.map((c) => (
                              <tr
                                key={c.account_id}
                                className={
                                  result.assigned_driver?.account_id === c.account_id
                                    ? "aa-row-winner"
                                    : c.exclusion_reason
                                    ? "aa-row-excluded"
                                    : ""
                                }
                              >
                                <td>{c.full_name}</td>
                                <td><VehicleIcon type={c.vehicle_type} /> {c.vehicle_type}</td>
                                <td>{c.distance_km?.toFixed(2)}</td>
                                <td><ScoreBar value={c.proximity_score} /></td>
                                <td>
                                  <ScoreBar value={c.rating_score} />
                                  <small>★ {c.avg_rating?.toFixed(1)}</small>
                                </td>
                                <td><ScoreBar value={c.vehicle_score} /></td>
                                <td>
                                  <strong>{(c.final_score * 100).toFixed(0)}%</strong>
                                </td>
                                <td>
                                  {c.exclusion_reason ? (
                                    <span className="aa-excluded-reason">{c.exclusion_reason.replaceAll("_", " ")}</span>
                                  ) : result.assigned_driver?.account_id === c.account_id ? (
                                    <span className="aa-assigned-tag">✅ Assigned</span>
                                  ) : (
                                    <span className="aa-eligible-tag">Eligible</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
