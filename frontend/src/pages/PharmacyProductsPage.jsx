import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, PackagePlus, PackageSearch, RefreshCw } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { listCustomerAddresses, listNearbyPharmacies, listPharmacyProducts } from "../lib/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1").replace(
  /\/api\/v1$/,
  "",
);

function ProductImageSlideshow({ images, productName }) {
  if (!images?.length) {
    return <div className="customer-product-image-placeholder">No photos</div>;
  }

  return (
    <div className="customer-product-image-slideshow" aria-label={`${productName} photos`}>
      {images.slice(0, 6).map((imageUrl, index) => (
        <img
          src={`${API_ORIGIN}${imageUrl}`}
          alt={`${productName} photo ${index + 1}`}
          key={imageUrl}
          style={{ "--slide-index": index }}
        />
      ))}
    </div>
  );
}

export function PharmacyProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [nearbyPharmacyMap, setNearbyPharmacyMap] = useState(new Map());
  const [error, setError] = useState("");
  const [listingNote, setListingNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        const response = await listPharmacyProducts();
        let nearbyMap = new Map();
        let note = "Sorted by maximum offers.";
        try {
          const addresses = await listCustomerAddresses();
          const defaultAddress = addresses.find((address) => address.is_default) || addresses[0];
          if (defaultAddress) {
            const nearby = await listNearbyPharmacies(defaultAddress.latitude, defaultAddress.longitude, 15);
            nearbyMap = new Map(nearby.map((pharmacy) => [pharmacy.account_id, pharmacy]));
            note = `Sorted by nearest pharmacy around ${defaultAddress.label}, then maximum offers.`;
          }
        } catch {
          note = "Login and save an address to sort by nearest pharmacy. Showing maximum offers first.";
        }

        if (isMounted) {
          setNearbyPharmacyMap(nearbyMap);
          setProducts(sortProducts(response, nearbyMap));
          setListingNote(note);
          setError("");
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  function addProductToBucket(product) {
    const draftItem = {
      source: "product",
      product_id: product.product_id,
      name: product.product_name,
      metric: "Box",
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
        locked_pharmacy: {
          account_id: product.account_id,
          store_name: product.pharmacy_name,
        },
        items: [draftItem],
      }),
    );
    navigate("/home/pharmacy/order?draft=1");
  }

  return (
    <section className="home-layout">
      <div className="pharmacy-page-header">
        <Link className="icon-text-button" to="/home">
          <ArrowLeft size={18} aria-hidden="true" />
          Home
        </Link>
        <div className="pharmacy-sector-hero">
          <p className="eyebrow">Pharmacy order</p>
          <h1>Order medicine first</h1>
          <p>Start a medicine order by prescription, voice, text, or saved products. Product deals are here to help you add common items faster.</p>
          <div className="pharmacy-header-actions">
            <Link className="button order-medicine-link" to="/home/pharmacy/order">
              <ClipboardList size={18} />
              Order Medicine
            </Link>
            <Link className="button button-secondary order-medicine-link" to="/home/pharmacy/orders">
              My orders
            </Link>
          </div>
        </div>
      </div>

      <section className="pharmacy-primary-action">
        <div>
          <p className="eyebrow">Primary action</p>
          <h2>Upload or type your medicine need</h2>
          <p>Choose delivery address, pharmacy selection mode, prescription inputs, and approval rules in the order flow.</p>
        </div>
        <Link className="button" to="/home/pharmacy/order">
          <ClipboardList size={18} />
          Start medicine order
        </Link>
      </section>

      {isLoading ? (
        <div className="home-loading">
          <RefreshCw size={20} aria-hidden="true" />
          Loading pharmacy products
        </div>
      ) : null}

      {error ? (
        <div className="home-empty">
          <FormMessage kind="error">{error}</FormMessage>
        </div>
      ) : null}

      {!isLoading && !error && products.length === 0 ? (
        <div className="home-empty">
          <PackageSearch size={24} aria-hidden="true" />
          <p>No approved pharmacy products are available yet.</p>
        </div>
      ) : null}

      {!isLoading && !error && products.length > 0 ? (
        <>
          <div className="supplementary-product-header">
            <div>
              <p className="eyebrow">Supplementary products</p>
              <h2>Nearby deals and maximum offers</h2>
              <p>{listingNote}</p>
            </div>
          </div>
          <div className="customer-product-grid">
            {products.map((product) => (
              <article
                className={`customer-product-card ${
                  product.stock_quantity === 0 ? "customer-product-card-out" : ""
                }`}
                key={product.product_id}
              >
                <ProductImageSlideshow images={product.image_urls} productName={product.product_name} />
                <div>
                  <p className="product-pharmacy-name">{product.pharmacy_name}</p>
                  {nearbyPharmacyMap.get(product.account_id) ? (
                    <span className="nearby-badge">
                      {nearbyPharmacyMap.get(product.account_id).distance_km} KM nearby
                    </span>
                  ) : null}
                  {product.stock_quantity === 0 ? <span className="stock-badge">Out of stock</span> : null}
                  {product.discount_percent ? (
                    <span className="offer-badge">
                      {Math.round(Number(product.discount_percent))}% off
                    </span>
                  ) : null}
                  <h2>{product.product_name}</h2>
                  <p>
                    {[product.brand, product.unit_label].filter(Boolean).join(" - ") ||
                      product.category ||
                      "Pharmacy product"}
                  </p>
                </div>
                <div className="product-card-footer">
                  <div className="customer-price-stack">
                    <strong>₹{product.customer_price}</strong>
                    {product.offer_price ? <del>₹{product.price}</del> : null}
                  </div>
                  <div className="stock-stack">
                    {product.discount_amount ? (
                      <span className="save-text">Save ₹{product.discount_amount}</span>
                    ) : null}
                    <span>{product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : "Currently unavailable"}</span>
                  </div>
                </div>
                <button
                  className="button button-full"
                  disabled={product.stock_quantity === 0}
                  type="button"
                  onClick={() => addProductToBucket(product)}
                >
                  <PackagePlus size={18} />
                  Add to bucket
                </button>
              </article>
            ))}
              </div>
        </>
      ) : null}
    </section>
  );
}

function sortProducts(products, nearbyPharmacyMap) {
  return products.slice().sort((left, right) => {
    const leftNearby = nearbyPharmacyMap.get(left.account_id);
    const rightNearby = nearbyPharmacyMap.get(right.account_id);
    const leftDistance = leftNearby?.distance_km ?? Number.POSITIVE_INFINITY;
    const rightDistance = rightNearby?.distance_km ?? Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    const rightDiscount = Number(right.discount_percent || 0);
    const leftDiscount = Number(left.discount_percent || 0);
    if (rightDiscount !== leftDiscount) return rightDiscount - leftDiscount;

    return left.product_name.localeCompare(right.product_name);
  });
}
