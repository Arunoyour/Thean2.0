import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  haircutNearbyShops,
  haircutSearchShops,
  haircutTokenBalance,
  haircutListFavorites,
  haircutAddFavorite,
  haircutRemoveFavorite,
} from "../lib/api.js";
import { HaircutSubNav } from "../components/HaircutSubNav.jsx";

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

function ShopCard({ shop, onOpen, onToggleFavorite }) {
  const imgUrl = shopImageUrl(shop.shop_image_url);
  return (
    <button
      onClick={onOpen}
      style={{
        background: "#ffffff", border: "1px solid #dce6e3", borderRadius: 14,
        padding: 12, textAlign: "left", cursor: "pointer", width: "100%", position: "relative",
        display: "flex", gap: 12, alignItems: "stretch",
      }}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={shop.shop_name}
          style={{ width: 84, height: 84, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
          onError={e => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <div style={{ width: 84, height: 84, borderRadius: 10, background: "#eef3f1", display: "grid", placeItems: "center", fontSize: "1.6rem", flexShrink: 0 }}>✂️</div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#13201e", marginBottom: 2 }}>{shop.shop_name}</div>
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
            aria-label={shop.is_favorite ? "Remove favorite" : "Add favorite"}
            style={{ background: "none", border: "none", fontSize: "1.15rem", cursor: "pointer", color: shop.is_favorite ? "#dc2626" : "#c9d8d4", flexShrink: 0 }}
          >
            {shop.is_favorite ? "♥" : "♡"}
          </button>
        </div>
        <div style={{ fontSize: "0.8rem", color: "#52625f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shop.address_line || "Address not listed"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.76rem", color: "#94a3a0" }}>
            {shop.total_chairs} chair{shop.total_chairs !== 1 ? "s" : ""}
          </span>
          {shop.rating_count > 0 ? (
            <span style={{ fontSize: "0.76rem", color: "#b45309", fontWeight: 600 }}>
              ★ {shop.rating_avg} ({shop.rating_count})
            </span>
          ) : (
            <span style={{ fontSize: "0.76rem", color: "#94a3a0" }}>No reviews yet</span>
          )}
          {shop.distance_km != null && (
            <span style={{ background: "#f8fbfa", border: "1px solid #eef3f1", borderRadius: 6, padding: "2px 8px", fontSize: "0.74rem", color: "#52625f", fontWeight: 600 }}>
              {shop.distance_km < 1 ? `${Math.round(shop.distance_km * 1000)}m` : `${shop.distance_km}km`}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function HaircutDiscoveryPage() {
  const navigate = useNavigate();
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationUsed, setLocationUsed] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [tab, setTab] = useState("nearby"); // "nearby" | "favorites"
  const debounceRef = useRef(null);

  useEffect(() => {
    haircutTokenBalance().then(d => setTokenBalance(d.balance)).catch(() => {});
  }, []);

  function loadNearby() {
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async pos => {
        setLocating(false);
        setLoading(true);
        try {
          const results = await haircutNearbyShops(pos.coords.latitude, pos.coords.longitude);
          setShops(results);
          setLocationUsed(true);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
      },
      () => {
        setLocating(false);
        setError("Location access denied. Use the search box to find shops.");
      },
      { timeout: 10000 }
    );
  }

  function loadFavorites() {
    setLoading(true); setError("");
    haircutListFavorites()
      .then(setShops)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (tab === "favorites") loadFavorites();
    else loadNearby();
  }, [tab]);

  useEffect(() => {
    if (tab !== "nearby" || !query.trim()) {
      if (locationUsed) return; // don't re-trigger nearby if user clears search
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true); setError("");
      try { setShops(await haircutSearchShops(query)); }
      catch (err) { setError(err.message); }
      finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, tab]);

  async function toggleFavorite(shop) {
    setShops(current => current.map(s => s.shop_id === shop.shop_id ? { ...s, is_favorite: !s.is_favorite } : s));
    try {
      if (shop.is_favorite) await haircutRemoveFavorite(shop.shop_id);
      else await haircutAddFavorite(shop.shop_id);
      if (tab === "favorites") loadFavorites();
    } catch (err) {
      setError(err.message);
      setShops(current => current.map(s => s.shop_id === shop.shop_id ? { ...s, is_favorite: shop.is_favorite } : s));
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#f6f8f7", paddingBottom: 80 }}>
      {/* Top bar */}
      <div style={{ position: "sticky", top: 0, background: "#ffffff", borderBottom: "1px solid #dce6e3", padding: "14px 16px", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#52625f", fontSize: "1.3rem", cursor: "pointer" }}>←</button>
          <h1 style={{ fontWeight: 800, fontSize: "1.1rem", color: "#13201e" }}>✂️ Haircut Shops</h1>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[{ key: "nearby", label: "Nearby" }, { key: "favorites", label: "♥ Favorites" }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "6px 14px", borderRadius: 100, border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: "0.82rem",
                background: tab === t.key ? "#0f766e" : "#eef3f1",
                color: tab === t.key ? "#fff" : "#52625f",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "nearby" && (
          <input
            type="search"
            placeholder="Search by shop name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: "100%", background: "#ffffff", border: "1.5px solid #c9d8d4", borderRadius: 10,
              padding: "10px 14px", color: "#13201e", fontSize: "0.95rem",
            }}
          />
        )}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {tokenBalance != null && (
          <div
            onClick={() => navigate("/haircut/history")}
            style={{
              background: "#d9f0ec", border: "1px solid #bfe6e0", borderRadius: 12,
              padding: "10px 14px", fontSize: "0.85rem", color: "#0f3f3a", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <span>🎟️ {tokenBalance} booking token{tokenBalance !== 1 ? "s" : ""} available — every new customer starts with 3 free.</span>
            <span style={{ fontWeight: 700 }}>Details ›</span>
          </div>
        )}

        {(locating || loading) && (
          <div style={{ textAlign: "center", color: "#52625f", padding: 32 }}>
            {locating ? "📍 Finding your location…" : "Loading shops…"}
          </div>
        )}

        {error && (
          <div style={{ background: "#fde8e4", border: "1px solid #f2c2b8", borderRadius: 10, padding: "12px 16px", color: "#8a1f11", fontSize: "0.88rem" }}>
            {error}
          </div>
        )}

        {!loading && !locating && shops.length === 0 && !error && (
          <div style={{ textAlign: "center", color: "#94a3a0", padding: 48 }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>{tab === "favorites" ? "♡" : "✂️"}</div>
            <p>{tab === "favorites" ? "No favorite shops yet." : `No shops found${query ? " for your search" : " nearby"}.`}</p>
          </div>
        )}

        {!loading && shops.map(shop => (
          <ShopCard
            key={shop.shop_id}
            shop={shop}
            onOpen={() => navigate(`/haircut/shop/${shop.shop_id}`)}
            onToggleFavorite={() => toggleFavorite(shop)}
          />
        ))}
      </div>
      <HaircutSubNav />
    </div>
  );
}
