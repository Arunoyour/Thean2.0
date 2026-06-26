import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight,
  Info, Leaf, PackagePlus, RefreshCw,
} from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { getPharmacyProduct } from "../lib/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1").replace(
  /\/api\/v1$/,
  "",
);

function resolveImage(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_ORIGIN}${url}`;
}

function ImageGallery({ images, productName }) {
  const [idx, setIdx] = useState(0);
  const urls = (images || []).map(resolveImage).filter(Boolean);
  if (!urls.length) return <div className="pd-image-placeholder">No photos</div>;
  return (
    <div className="pd-gallery">
      <div className="pd-gallery-stage">
        <img src={urls[idx]} alt={`${productName} photo ${idx + 1}`} />
        {urls.length > 1 && (
          <>
            <button className="pd-gallery-nav pd-gallery-prev" type="button"
              onClick={() => setIdx((i) => (i - 1 + urls.length) % urls.length)}>
              <ChevronLeft size={20} />
            </button>
            <button className="pd-gallery-nav pd-gallery-next" type="button"
              onClick={() => setIdx((i) => (i + 1) % urls.length)}>
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
      {urls.length > 1 && (
        <div className="pd-gallery-thumbs">
          {urls.map((u, i) => (
            <button key={u} type="button" className={`pd-gallery-thumb${i === idx ? " active" : ""}`}
              onClick={() => setIdx(i)}>
              <img src={u} alt={`Thumbnail ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="pd-info-row">
      <span className="pd-info-label">{label}</span>
      <span className="pd-info-value">{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="pd-section">
      <h3 className="pd-section-title">{title}</h3>
      {children}
    </div>
  );
}

export function PharmacyProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    getPharmacyProduct(productId)
      .then(setProduct)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [productId]);

  function addToBucket() {
    if (!product) return;
    const draftItem = {
      source: "product",
      product_id: product.product_id,
      name: product.product_name,
      metric: product.unit_label || "Box",
      quantity: 1,
      account_id: product.account_id,
      pharmacy_name: product.pharmacy_name,
      customer_price: product.customer_price,
      offer_price: product.offer_price,
      price: product.price,
    };
    window.localStorage.setItem(
      "thean_pharmacy_order_draft",
      JSON.stringify({
        locked_pharmacy: { account_id: product.account_id, store_name: product.pharmacy_name },
        items: [draftItem],
      }),
    );
    setToast(product.product_name);
    setTimeout(() => navigate("/home/pharmacy/order?draft=1"), 900);
  }

  if (isLoading) return (
    <section className="home-layout">
      <div className="home-loading"><RefreshCw size={20} /> Loading product details</div>
    </section>
  );

  if (error) return (
    <section className="home-layout">
      <Link className="icon-text-button" to="/home/pharmacy"><ArrowLeft size={18} /> Back</Link>
      <FormMessage kind="error">{error}</FormMessage>
    </section>
  );

  if (!product) return null;

  const inStock = product.stock_quantity > 0;

  return (
    <section className="home-layout">
      {toast && (
        <div className="bucket-toast" role="status" aria-live="polite">
          <CheckCircle2 size={18} />
          <span><strong>{toast}</strong> added to bucket</span>
        </div>
      )}

      <Link className="icon-text-button" to="/home/pharmacy">
        <ArrowLeft size={18} /> All products
      </Link>

      <div className="pd-layout">
        {/* ── Left: gallery ── */}
        <div className="pd-gallery-col">
          <ImageGallery images={product.image_urls} productName={product.product_name} />
        </div>

        {/* ── Right: details ── */}
        <div className="pd-detail-col">
          <p className="product-pharmacy-name">{product.pharmacy_name}</p>

          {!inStock && <span className="stock-badge">Out of stock</span>}
          {product.discount_percent && (
            <span className="offer-badge">{Math.round(Number(product.discount_percent))}% off</span>
          )}

          <h1 className="pd-title">{product.product_name}</h1>

          {/* sub-line: brand · unit · net_weight */}
          {[product.brand, product.unit_label, product.net_weight].filter(Boolean).length > 0 && (
            <p className="pd-subtitle">
              {[product.brand, product.unit_label, product.net_weight].filter(Boolean).join(" · ")}
            </p>
          )}

          {/* price block */}
          <div className="pd-price-block">
            <strong className="pd-price">₹{product.customer_price}</strong>
            {product.offer_price && <del className="pd-original-price">₹{product.price}</del>}
            {product.discount_amount && (
              <span className="save-text">Save ₹{product.discount_amount}</span>
            )}
          </div>

          <button
            className="button button-full pd-add-btn"
            type="button"
            disabled={!inStock}
            onClick={addToBucket}
          >
            <PackagePlus size={18} />
            {inStock ? "Add to bucket" : "Out of stock"}
          </button>

          {/* ── Quick facts ── */}
          <div className="pd-quick-facts">
            {product.dietary_preference && product.dietary_preference !== "NA" && (
              <span className={`pd-diet-badge pd-diet-${product.dietary_preference === "Veg" ? "veg" : "nonveg"}`}>
                <Leaf size={12} /> {product.dietary_preference}
              </span>
            )}
            {product.pack_of && <span className="pd-fact-chip">Pack of {product.pack_of}</span>}
            {product.calorie_count && <span className="pd-fact-chip">{product.calorie_count}</span>}
            {product.shelf_life && <span className="pd-fact-chip">Shelf life: {product.shelf_life}</span>}
            {product.country_of_origin && (
              <span className="pd-fact-chip">Made in {product.country_of_origin}</span>
            )}
          </div>

          {/* ── About ── */}
          {product.about && (
            <Section title="About this product">
              <p className="pd-prose">{product.about}</p>
            </Section>
          )}

          {/* ── Ingredients ── */}
          {product.ingredients && (
            <Section title="Ingredients">
              <p className="pd-prose">{product.ingredients}</p>
            </Section>
          )}

          {/* ── Health benefits ── */}
          {product.health_benefits && (
            <Section title="Health benefits">
              <p className="pd-prose">{product.health_benefits}</p>
            </Section>
          )}

          {/* ── Other info ── */}
          {product.other_info && (
            <Section title="Product information">
              <p className="pd-prose">{product.other_info}</p>
            </Section>
          )}

          {/* ── Product specs table ── */}
          {[product.brand, product.category, product.unit_label, product.net_weight,
            product.pack_of, product.calorie_count, product.dietary_preference,
            product.country_of_origin, product.shelf_life].some(Boolean) && (
            <Section title="Product details">
              <div className="pd-info-table">
                <Row label="Brand"              value={product.brand} />
                <Row label="Category"           value={product.category} />
                <Row label="Unit"               value={product.unit_label} />
                <Row label="Net weight / Volume" value={product.net_weight} />
                <Row label="Pack of"            value={product.pack_of} />
                <Row label="Calorie count"      value={product.calorie_count} />
                <Row label="Dietary preference" value={
                  product.dietary_preference && product.dietary_preference !== "NA"
                    ? product.dietary_preference : null
                } />
                <Row label="Country of origin"  value={product.country_of_origin} />
                <Row label="Shelf life"         value={product.shelf_life} />
              </div>
            </Section>
          )}

          {/* ── Disclaimer ── */}
          {product.disclaimer && (
            <div className="pd-disclaimer">
              <Info size={13} />
              <p>{product.disclaimer}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
