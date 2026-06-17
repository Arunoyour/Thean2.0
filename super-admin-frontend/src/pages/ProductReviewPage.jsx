import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bell, CheckCircle2, Download, MessageSquare, RefreshCw } from "lucide-react";

import {
  approvePharmacyProduct,
  getAdminToken,
  listPharmacyProductsForReview,
  requestPharmacyProductRevision,
} from "../lib/api.js";
import { DEFAULT_PAGE_SIZE, exportRowsToExcel, getPageCount, pageLabel, paginate } from "../lib/listingUtils.js";
import { BackButton } from "../components/BackButton.jsx";

export function ProductReviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(searchParams.get("product_id") || "");
  const [comment, setComment] = useState("");
  const [notification, setNotification] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [productPage, setProductPage] = useState(1);
  const [commentPage, setCommentPage] = useState(1);

  const selectedProduct = useMemo(
    () => products.find((product) => product.product_id === selectedProductId) || products[0],
    [products, selectedProductId],
  );
  const pagedProducts = useMemo(
    () => paginate(products, productPage, DEFAULT_PAGE_SIZE),
    [products, productPage],
  );
  const productPageCount = getPageCount(products, DEFAULT_PAGE_SIZE);
  const selectedComments = selectedProduct?.comments || [];
  const pagedComments = useMemo(
    () => paginate(selectedComments, commentPage, DEFAULT_PAGE_SIZE),
    [selectedComments, commentPage],
  );
  const commentPageCount = getPageCount(selectedComments, DEFAULT_PAGE_SIZE);

  async function loadProducts() {
    setError("");
    setIsLoading(true);
    try {
      const response = await listPharmacyProductsForReview();
      setProducts(response);
      if (!selectedProductId && response.length) {
        setSelectedProductId(response[0].product_id);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      return undefined;
    }
    const apiOrigin = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(
      /\/api\/v1$/,
      "",
    );
    const wsOrigin = apiOrigin.replace(/^http/, "ws");
    const socket = new WebSocket(`${wsOrigin}/api/v1/ws/super-admin?token=${encodeURIComponent(token)}`);
    socket.onopen = () => setWsStatus("live");
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setNotification(payload);
      if (payload?.payload?.product_id) {
        loadProducts();
      }
    };
    socket.onerror = () => setWsStatus("reconnecting");
    socket.onclose = () => setWsStatus("offline");
    return () => socket.close();
  }, []);

  async function approveProduct() {
    if (!selectedProduct) {
      return;
    }
    try {
      await approvePharmacyProduct(selectedProduct.product_id);
      await loadProducts();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function sendRevision() {
    if (!selectedProduct || comment.trim().length < 3) {
      setError("Revision comment is required.");
      return;
    }
    try {
      await requestPharmacyProductRevision(selectedProduct.product_id, comment.trim());
      setComment("");
      await loadProducts();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function openNotification() {
    const productId = notification?.payload?.product_id;
    if (productId) {
      setSelectedProductId(productId);
      navigate(`/dashboard/pharmacy/products?product_id=${productId}`);
    }
  }

  function exportProducts() {
    exportRowsToExcel(
      "thean-product-review.xls",
      "Product Review",
      [
        { label: "Product", value: (product) => product.product_name },
        { label: "Pharmacy", value: (product) => product.pharmacy_name || "" },
        { label: "Brand", value: (product) => product.brand || "" },
        { label: "Category", value: (product) => product.category || "" },
        { label: "Status", value: (product) => product.approval_status },
        { label: "Price", value: (product) => product.price },
        { label: "Offer price", value: (product) => product.offer_price || "" },
        { label: "Customer price", value: (product) => product.customer_price },
        { label: "Commission %", value: (product) => product.product_commission_percent },
        { label: "Platform earning", value: (product) => product.platform_earning_amount },
        { label: "Pharmacy payable", value: (product) => product.pharmacy_payable_amount },
        { label: "Stock quantity", value: (product) => product.stock_quantity },
        { label: "Created", value: (product) => product.created_at },
      ],
      products,
    );
  }

  function exportComments() {
    if (!selectedProduct) return;
    exportRowsToExcel(
      "thean-product-comment-audit.xls",
      "Product Comments",
      [
        { label: "Product", value: () => selectedProduct.product_name },
        { label: "Pharmacy", value: () => selectedProduct.pharmacy_name || "" },
        { label: "Actor type", value: (commentItem) => commentItem.actor_type },
        { label: "Action", value: (commentItem) => commentItem.action },
        { label: "Comment", value: (commentItem) => commentItem.comment },
        { label: "Created", value: (commentItem) => commentItem.created_at },
      ],
      selectedComments,
    );
  }

  return (
    <main className="page">
      <BackButton />
      <header className="dashboard-header">
        <div>
          <button className="text-nav-button" type="button" onClick={() => navigate("/dashboard/pharmacy")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Pharmacy Dashboard
          </button>
          <p className="eyebrow">Product approval</p>
          <h1>Product Review</h1>
          <p>Review merchant submissions, earnings, and revision comments.</p>
        </div>
        <div className="header-actions">
          <button className="outline-button" type="button" onClick={exportProducts}>
            <Download size={18} aria-hidden="true" />
            Export Excel
          </button>
          <button className="outline-button" type="button" onClick={loadProducts}>
            <RefreshCw size={18} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {notification ? (
        <button className="notification-banner" type="button" onClick={openNotification}>
          <Bell size={18} aria-hidden="true" />
          <span>
            <strong>{notification.title}</strong>
            {notification.message}
          </span>
        </button>
      ) : null}

      {error && <div className="error">{error}</div>}
      <div className={`connection-state connection-${wsStatus}`}>
        Realtime notifications: {wsStatus}
      </div>

      {isLoading ? (
        <section className="panel loading-panel">Loading product approvals</section>
      ) : (
        <section className="approval-layout product-review-layout">
          <div className="pharmacy-list">
            {products.length ? (
              pagedProducts.map((product) => (
                <button
                  className={`pharmacy-row row-main-button ${
                    selectedProduct?.product_id === product.product_id ? "pharmacy-row-selected" : ""
                  }`}
                  type="button"
                  key={product.product_id}
                  onClick={() => {
                    setSelectedProductId(product.product_id);
                    setCommentPage(1);
                  }}
                >
                  <h3>{product.product_name}</h3>
                  <p>{product.pharmacy_name}</p>
                  <span className={`badge status-${product.approval_status.toLowerCase()}`}>
                    {product.approval_status.replaceAll("_", " ")}
                  </span>
                </button>
              ))
            ) : (
              <article className="panel">No products need review.</article>
            )}
            <div className="pagination-bar">
              <span>{pageLabel(productPage, products, DEFAULT_PAGE_SIZE)}</span>
              <div>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={productPage <= 1}
                  onClick={() => setProductPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <strong>Page {Math.min(productPage, productPageCount)} of {productPageCount}</strong>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={productPage >= productPageCount}
                  onClick={() => setProductPage((page) => Math.min(productPageCount, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {selectedProduct ? (
            <aside className="timeline-panel product-review-panel">
              <div className="timeline-header">
                <div>
                  <p className="eyebrow">{selectedProduct.pharmacy_name}</p>
                  <h2>{selectedProduct.product_name}</h2>
                </div>
                <span className={`badge status-${selectedProduct.approval_status.toLowerCase()}`}>
                  {selectedProduct.approval_status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="review-detail-grid">
                <div>
                  <p>Customer price</p>
                  <strong>₹{selectedProduct.customer_price}</strong>
                </div>
                <div>
                  <p>Commission %</p>
                  <strong>{selectedProduct.product_commission_percent}%</strong>
                </div>
                <div>
                  <p>Commission earning</p>
                  <strong>₹{selectedProduct.platform_commission_amount}</strong>
                </div>
                <div>
                  <p>Platform fee</p>
                  <strong>₹{selectedProduct.platform_fee_amount}</strong>
                </div>
                <div>
                  <p>Total platform earning</p>
                  <strong>₹{selectedProduct.platform_earning_amount}</strong>
                </div>
                <div>
                  <p>Pharmacy payable</p>
                  <strong>₹{selectedProduct.pharmacy_payable_amount}</strong>
                </div>
              </div>

              <label>
                Comment to merchant
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="a typo on product name, please correct it."
                />
              </label>
              <div className="review-actions">
                <button className="button" type="button" onClick={approveProduct}>
                  <CheckCircle2 size={18} aria-hidden="true" />
                  Approve
                </button>
                <button className="outline-button" type="button" onClick={sendRevision}>
                  <MessageSquare size={18} aria-hidden="true" />
                  Needs revision
                </button>
              </div>

              <div className="timeline-list">
                <div className="list-section-heading">
                  <h3>Comment audit</h3>
                  <button className="outline-button button-small" type="button" onClick={exportComments}>
                    <Download size={16} aria-hidden="true" />
                    Export Excel
                  </button>
                </div>
                {selectedProduct.comments.length ? (
                  pagedComments.map((item) => (
                    <article className="timeline-event" key={item.comment_id}>
                      <span className="badge badge-pending">{item.action}</span>
                      <p>{item.comment}</p>
                      <time>{new Date(item.created_at).toLocaleString()}</time>
                    </article>
                  ))
                ) : (
                  <p>No comments yet.</p>
                )}
                <div className="pagination-bar">
                  <span>{pageLabel(commentPage, selectedComments, DEFAULT_PAGE_SIZE)}</span>
                  <div>
                    <button
                      className="outline-button button-small"
                      type="button"
                      disabled={commentPage <= 1}
                      onClick={() => setCommentPage((page) => Math.max(1, page - 1))}
                    >
                      Previous
                    </button>
                    <strong>Page {Math.min(commentPage, commentPageCount)} of {commentPageCount}</strong>
                    <button
                      className="outline-button button-small"
                      type="button"
                      disabled={commentPage >= commentPageCount}
                      onClick={() => setCommentPage((page) => Math.min(commentPageCount, page + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </section>
      )}
    </main>
  );
}
