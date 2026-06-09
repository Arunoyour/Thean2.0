import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, Edit3, PackageX, RefreshCw, Save, Send, X } from "lucide-react";

import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { ProductImageSlideshow } from "../components/ProductImageSlideshow.jsx";
import { getPharmacyToken, listProducts, resubmitProduct, updateProduct } from "../lib/api.js";

function createEditForm(product) {
  return {
    product_name: product.product_name || "",
    brand: product.brand || "",
    category: product.category || "",
    unit_label: product.unit_label || "",
    price: product.price || "",
    offer_price: product.offer_price || "",
    stock_quantity: String(product.stock_quantity ?? 0),
    is_available: product.is_available,
  };
}

export function ListedProductsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [revisionComment, setRevisionComment] = useState("");
  const [notification, setNotification] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [filters, setFilters] = useState({
    name: "",
    stock: "all",
    dateFrom: "",
    dateTo: "",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        const productList = await listProducts();
        if (isMounted) {
          setProducts(productList);
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

  useEffect(() => {
    const token = getPharmacyToken();
    if (!token) {
      return undefined;
    }

    const apiOrigin = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(
      /\/api\/v1$/,
      "",
    );
    const wsOrigin = apiOrigin.replace(/^http/, "ws");
    const socket = new WebSocket(`${wsOrigin}/api/v1/ws/pharmacy?token=${encodeURIComponent(token)}`);
    socket.onopen = () => setWsStatus("live");
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setNotification(payload);
    };
    socket.onerror = () => setWsStatus("reconnecting");
    socket.onclose = () => setWsStatus("offline");
    return () => socket.close();
  }, []);

  useEffect(() => {
    const productId = searchParams.get("product_id");
    const shouldEdit = searchParams.get("edit") === "1";
    if (!productId || !products.length) {
      return;
    }
    const product = products.find((item) => item.product_id === productId);
    if (product && shouldEdit) {
      startEdit(product);
    }
  }, [products, searchParams]);

  const filteredProducts = products.filter((product) => {
    const nameMatch = `${product.product_name} ${product.brand || ""}`
      .toLowerCase()
      .includes(filters.name.trim().toLowerCase());
    const stockMatch =
      filters.stock === "all" ||
      (filters.stock === "out" && product.stock_quantity === 0) ||
      (filters.stock === "in" && product.stock_quantity > 0);
    const createdDate = new Date(product.created_at);
    const fromMatch = filters.dateFrom ? createdDate >= new Date(`${filters.dateFrom}T00:00:00`) : true;
    const toMatch = filters.dateTo ? createdDate <= new Date(`${filters.dateTo}T23:59:59`) : true;
    return nameMatch && stockMatch && fromMatch && toMatch;
  });

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function startEdit(product) {
    setError("");
    setSuccess("");
    setEditingProduct(product);
    setEditForm(createEditForm(product));
  }

  function updateEditField(event) {
    const { name, type, checked, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function saveProduct(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const updated = await updateProduct(editingProduct.product_id, {
        product_name: editForm.product_name,
        brand: editForm.brand || null,
        category: editForm.category || null,
        unit_label: editForm.unit_label || null,
        price: Number(editForm.price),
        offer_price: editForm.offer_price ? Number(editForm.offer_price) : null,
        stock_quantity: Number(editForm.stock_quantity),
        is_available: editForm.is_available,
      });
      setProducts((current) =>
        current.map((product) => (product.product_id === updated.product_id ? updated : product)),
      );
      setEditingProduct(null);
      setEditForm(null);
      setSuccess(`${updated.product_name} updated.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function markOutOfStock(product) {
    setError("");
    setSuccess("");
    try {
      const updated = await updateProduct(product.product_id, {
        product_name: product.product_name,
        brand: product.brand || null,
        category: product.category || null,
        unit_label: product.unit_label || null,
        price: Number(product.price),
        offer_price: product.offer_price ? Number(product.offer_price) : null,
        stock_quantity: 0,
        is_available: product.is_available,
      });
      setProducts((current) =>
        current.map((item) => (item.product_id === updated.product_id ? updated : item)),
      );
      setSuccess(`${updated.product_name} marked out of stock.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function submitRevisionResponse(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!editingProduct) {
      return;
    }
    try {
      const updated = await resubmitProduct(editingProduct.product_id, revisionComment.trim() || "Done");
      setProducts((current) =>
        current.map((item) => (item.product_id === updated.product_id ? updated : item)),
      );
      setRevisionComment("");
      setSuccess(`${updated.product_name} resubmitted for approval.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function openNotification() {
    const redirectUrl = notification?.payload?.redirect_url;
    if (redirectUrl) {
      navigate(redirectUrl);
    }
  }

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <p className="eyebrow">Products</p>
          <h1>Listed Products</h1>
          <p>Products shown to customers after pharmacy approval and stock availability.</p>
        </div>
      </header>

      {isLoading ? (
        <section className="panel loading-row">
          <RefreshCw size={18} aria-hidden="true" />
          Loading listed products
        </section>
      ) : null}

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
      <div className={`connection-state connection-${wsStatus}`}>
        Realtime notifications: {wsStatus}
      </div>
      {notification ? (
        <button className="notification-banner" type="button" onClick={openNotification}>
          <Bell size={18} aria-hidden="true" />
          <span>
            <strong>{notification.title}</strong>
            {notification.message}
          </span>
        </button>
      ) : null}

      {!isLoading && !error ? (
        <section className="panel product-list-panel product-page-list">
          <div className="product-filter-bar">
            <label>
              Product name
              <input
                name="name"
                value={filters.name}
                onChange={updateFilter}
                placeholder="Search product or brand"
              />
            </label>
            <label>
              Stock
              <select name="stock" value={filters.stock} onChange={updateFilter}>
                <option value="all">All stock</option>
                <option value="in">In stock</option>
                <option value="out">Out of stock</option>
              </select>
            </label>
            <label>
              Added from
              <input name="dateFrom" value={filters.dateFrom} onChange={updateFilter} type="date" />
            </label>
            <label>
              Added to
              <input name="dateTo" value={filters.dateTo} onChange={updateFilter} type="date" />
            </label>
          </div>

          {editingProduct && editForm ? (
            <form className="product-edit-form" onSubmit={saveProduct}>
              <div className="product-edit-header">
                <h2>Edit product</h2>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    setEditForm(null);
                  }}
                  aria-label="Close edit product"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <label>
                Product name
                <input
                  name="product_name"
                  value={editForm.product_name}
                  onChange={updateEditField}
                  required
                />
              </label>
              <div className="inline-fields">
                <label>
                  Brand
                  <input name="brand" value={editForm.brand} onChange={updateEditField} />
                </label>
                <label>
                  Category
                  <input name="category" value={editForm.category} onChange={updateEditField} />
                </label>
                <label>
                  Unit
                  <input name="unit_label" value={editForm.unit_label} onChange={updateEditField} />
                </label>
              </div>
              <div className="inline-fields">
                <label>
                  Price
                  <input
                    name="price"
                    value={editForm.price}
                    onChange={updateEditField}
                    type="number"
                    min="1"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Offer price
                  <input
                    name="offer_price"
                    value={editForm.offer_price}
                    onChange={updateEditField}
                    type="number"
                    min="1"
                    step="0.01"
                  />
                </label>
                <label>
                  Stock
                  <input
                    name="stock_quantity"
                    value={editForm.stock_quantity}
                    onChange={updateEditField}
                    type="number"
                    min="0"
                    required
                  />
                </label>
              </div>
              <label className="checkbox-row">
                <input
                  name="is_available"
                  checked={editForm.is_available}
                  onChange={updateEditField}
                  type="checkbox"
                />
                Visible to customers
              </label>
              <button className="button" type="submit" disabled={isSaving}>
                <Save size={18} aria-hidden="true" />
                {isSaving ? "Saving" : "Save changes"}
              </button>
              {editingProduct.approval_status === "NEEDS_REVISION" ? (
                <div className="revision-box">
                  <h3>Revision response</h3>
                  <p>Reply to the admin comment and resubmit this product for approval.</p>
                  <label>
                    Comment
                    <textarea
                      value={revisionComment}
                      onChange={(event) => setRevisionComment(event.target.value)}
                      placeholder="Done"
                    />
                  </label>
                  <button className="button" type="button" onClick={submitRevisionResponse}>
                    <Send size={18} aria-hidden="true" />
                    Resubmit
                  </button>
                </div>
              ) : null}
            </form>
          ) : null}

          {filteredProducts.length ? (
            <div className="product-list">
              {filteredProducts.map((product) => (
                <article
                  className={`product-row ${product.stock_quantity === 0 ? "product-row-out" : ""}`}
                  key={product.product_id}
                >
                  <ProductImageSlideshow images={product.image_urls} productName={product.product_name} />
                  <div>
                    <strong>{product.product_name}</strong>
                    <span className={`status-pill status-${product.approval_status.toLowerCase()}`}>
                      {product.approval_status.replaceAll("_", " ")}
                    </span>
                    <p>
                      {product.brand || "No brand"} {product.unit_label ? `- ${product.unit_label}` : ""}
                    </p>
                    <p>{product.category || "Uncategorised"}</p>
                    <time>Added {new Date(product.created_at).toLocaleDateString()}</time>
                  </div>
                  <div className="product-price">
                    {product.offer_price ? (
                      <>
                        <strong>₹{product.offer_price}</strong>
                        <del>₹{product.price}</del>
                      </>
                    ) : (
                      <strong>₹{product.price}</strong>
                    )}
                    <span>{product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : "Out of stock"}</span>
                    <div className="product-row-actions">
                      <button className="outline-button button-small" type="button" onClick={() => startEdit(product)}>
                        <Edit3 size={16} aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        className="outline-button button-small"
                        type="button"
                        onClick={() => markOutOfStock(product)}
                        disabled={product.stock_quantity === 0}
                      >
                        <PackageX size={16} aria-hidden="true" />
                        Out of stock
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p>No products match the selected filters.</p>
          )}
        </section>
      ) : null}
    </PharmacyPageShell>
  );
}
