import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  haircutShopDetail,
  haircutShopReviews,
  haircutAddFavorite,
  haircutRemoveFavorite,
} from "../lib/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1").replace(/\/api\/v1$/, "");

// Older rows store a raw filesystem path (e.g. "storage/haircut/..."); newer ones
// store a proper "/media/..." URL. Handle both until existing data is backfilled.
function shopImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/media")) return `${API_ORIGIN}${path}`;
  const clean = path.replace(/^storage\/?/, "");
  return `${API_ORIGIN}/media/${clean}`;
}

export function HaircutShopDetailPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favoriting, setFavoriting] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([haircutShopDetail(shopId), haircutShopReviews(shopId).catch(() => [])])
      .then(([s, r]) => { setShop(s); setReviews(r); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [shopId]);

  async function toggleFavorite() {
    if (!shop) return;
    setFavoriting(true);
    try {
      if (shop.is_favorite) await haircutRemoveFavorite(shop.shop_id);
      else await haircutAddFavorite(shop.shop_id);
      setShop(s => ({ ...s, is_favorite: !s.is_favorite }));
    } catch (err) { setError(err.message); }
    finally { setFavoriting(false); }
  }

  if (loading) return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", display: "flex", alignItems: "center", justifyContent: "center", color: "#52625f" }}>
      Loading…
    </div>
  );

  if (!shop) return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", padding: 24, color: "#8a1f11" }}>{error || "Shop not found."}</div>
  );

  const imgUrl = shopImageUrl(shop.shop_image_url);

  return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", paddingBottom: 32 }}>
      <div style={{ position: "sticky", top: 0, background: "#ffffff", borderBottom: "1px solid #dce6e3", padding: "14px 16px", zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#52625f", fontSize: "1.3rem", cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 800, fontSize: "1.1rem", color: "#13201e", flex: 1 }}>{shop.shop_name}</h1>
        <button
          onClick={toggleFavorite}
          disabled={favoriting}
          aria-label={shop.is_favorite ? "Remove favorite" : "Add favorite"}
          style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: shop.is_favorite ? "#dc2626" : "#c9d8d4" }}
        >
          {shop.is_favorite ? "♥" : "♡"}
        </button>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 10, padding: "12px 16px", color: "#8a1f11", fontSize: "0.88rem" }}>{error}</div>}

        {imgUrl ? (
          <img
            src={imgUrl}
            alt={shop.shop_name}
            style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 14, border: "1px solid #dce6e3" }}
            onError={e => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 14, background: "#eef3f1", display: "grid", placeItems: "center", fontSize: "2.5rem" }}>✂️</div>
        )}

        <div style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: "0.88rem", color: "#52625f", marginBottom: 6 }}>{shop.address_line || "Address not listed"}</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", color: "#94a3a0" }}>{shop.total_chairs} chair{shop.total_chairs !== 1 ? "s" : ""}</span>
            {shop.rating_count > 0 ? (
              <span style={{ fontSize: "0.85rem", color: "#b45309", fontWeight: 700 }}>★ {shop.rating_avg} ({shop.rating_count} review{shop.rating_count !== 1 ? "s" : ""})</span>
            ) : (
              <span style={{ fontSize: "0.85rem", color: "#94a3a0" }}>No reviews yet</span>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate(`/haircut/shop/${shopId}/book`)}
          style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "1rem" }}
        >
          Book Now
        </button>

        <div>
          <div style={{ fontWeight: 700, color: "#13201e", marginBottom: 10, fontSize: "0.95rem" }}>Reviews</div>
          {reviews.length === 0 ? (
            <div style={{ color: "#94a3a0", fontSize: "0.85rem" }}>No reviews yet. Be the first to book and review!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviews.map(r => (
                <div key={r.review_id} style={{ background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "#b45309", fontWeight: 700, marginBottom: 4 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
                  {r.comment && <div style={{ fontSize: "0.88rem", color: "#13201e" }}>{r.comment}</div>}
                  <div style={{ fontSize: "0.75rem", color: "#94a3a0", marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
