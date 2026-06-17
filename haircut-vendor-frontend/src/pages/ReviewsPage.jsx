import { useEffect, useState } from "react";
import { getMyShop, getShopReviews } from "../lib/api.js";

export function ReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyShop()
      .then(shop => getShopReviews(shop.shop_id))
      .then(setReviews)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const avg = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null;

  return (
    <div className="hc-page">
      <div className="hc-topbar">
        <h2>Customer Reviews</h2>
      </div>
      <div className="hc-content">
        {error && <div className="hc-error">{error}</div>}

        {!loading && reviews.length > 0 && (
          <div className="hc-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: "#b45309" }}>★ {avg}</div>
            <div style={{ fontSize: "0.8rem", color: "#52625f" }}>{reviews.length} review{reviews.length !== 1 ? "s" : ""}</div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", color: "#52625f", padding: 24 }}>Loading…</div>
        ) : reviews.length === 0 ? (
          <div className="hc-empty">
            <div className="hc-empty-icon">★</div>
            <p>No reviews yet.</p>
          </div>
        ) : (
          reviews.map(r => (
            <div key={r.review_id} className="hc-card">
              <div style={{ color: "#b45309", fontWeight: 700, marginBottom: 4 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
              {r.comment && <div style={{ fontSize: "0.88rem", color: "#13201e" }}>{r.comment}</div>}
              <div style={{ fontSize: "0.75rem", color: "#94a3a0", marginTop: 4 }}>
                {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
