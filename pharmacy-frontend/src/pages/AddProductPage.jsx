import { useEffect, useState } from "react";
import { ImagePlus, PackagePlus, RefreshCw, ShieldAlert } from "lucide-react";

import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { addProduct, getCurrentPharmacy } from "../lib/api.js";
import { validatePositiveNumber, validateNonNegativeNumber, validateOfferPrice, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqProductName = validateRequired("Product name");

const sampleProducts = ["Boost", "NAN", "Horlicks", "Pediasure"];

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read product photo."));
    reader.readAsDataURL(file);
  });
}

export function AddProductPage() {
  const [pharmacy, setPharmacy] = useState(null);
  const [productForm, setProductForm] = useState({
    product_name: "",
    brand: "",
    category: "Nutrition",
    unit_label: "",
    price: "",
    offer_price: "",
    stock_quantity: "",
  });
  const [error, setError] = useState("");
  const [productMessage, setProductMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [touched, setTouched] = useState({});
  // Incrementing this triggers a re-load after a failed pharmacy fetch
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadPharmacy() {
      setIsLoading(true);
      setError("");
      try {
        const profile = await getCurrentPharmacy();
        if (isMounted) {
          setPharmacy(profile);
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

    loadPharmacy();
    return () => {
      isMounted = false;
    };
  }, [loadKey]);

  function updateProductField(event) {
    setProductForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function applySampleProduct(productName) {
    setProductForm((current) => ({
      ...current,
      product_name: productName,
      brand: productName,
      category: "Nutrition",
    }));
  }

  function updateProductPhotos(event) {
    const files = Array.from(event.target.files || []).slice(0, 6);
    setPhotoFiles(files);
    setPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
  }

  const priceValidator   = validatePositiveNumber("Price");
  const stockValidator   = validateNonNegativeNumber("Stock");
  const offerValidator   = validateOfferPrice(() => productForm.price);

  const fieldErrors = {
    product_name:  touched.product_name  ? reqProductName(productForm.product_name) : null,
    price:         touched.price         ? priceValidator(productForm.price)         : null,
    offer_price:   touched.offer_price   ? offerValidator(productForm.offer_price)   : null,
    stock_quantity: touched.stock_quantity ? stockValidator(productForm.stock_quantity) : null,
  };

  async function submitProduct(event) {
    event.preventDefault();
    setTouched({ product_name: true, price: true, offer_price: true, stock_quantity: true });
    if (
      reqProductName(productForm.product_name) ||
      priceValidator(productForm.price) ||
      offerValidator(productForm.offer_price) ||
      stockValidator(productForm.stock_quantity)
    ) return;
    setError("");
    setProductMessage("");
    setIsAddingProduct(true);

    try {
      if (photoFiles.length < 2) {
        throw new Error("Upload at least 2 product photos.");
      }

      const imageDataUrls = await Promise.all(photoFiles.map((file) => readImageFile(file)));
      const product = await addProduct({
        product_name: productForm.product_name,
        brand: productForm.brand || null,
        category: productForm.category || null,
        unit_label: productForm.unit_label || null,
        price: Number(productForm.price),
        offer_price: productForm.offer_price ? Number(productForm.offer_price) : null,
        image_data_urls: imageDataUrls,
        stock_quantity: Number(productForm.stock_quantity),
        is_available: true,
      });
      setProductMessage(`${product.product_name} submitted for super admin approval.`);
      setProductForm({
        product_name: "",
        brand: "",
        category: "Nutrition",
        unit_label: "",
        price: "",
        offer_price: "",
        stock_quantity: "",
      });
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setTouched({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsAddingProduct(false);
    }
  }

  if (isLoading) {
    return <PharmacyPageShell><section className="panel">Loading product controls</section></PharmacyPageShell>;
  }

  // If pharmacy failed to load, show error + retry — do not fall through to locked panel
  if (error && !pharmacy) {
    return (
      <PharmacyPageShell>
        <header className="portal-header">
          <div>
            <p className="eyebrow">Products</p>
            <h1>Add Product</h1>
          </div>
        </header>
        <article className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="error">{error}</div>
          <button
            className="outline-button"
            type="button"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setLoadKey((k) => k + 1)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </article>
      </PharmacyPageShell>
    );
  }

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <p className="eyebrow">Products</p>
          <h1>Add Product</h1>
          <p>Create customer-visible products with photos, stock, and offer price.</p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {!pharmacy?.is_active ? (
        <article className="panel locked-panel">
          <ShieldAlert size={22} aria-hidden="true" />
          <div>
            <h3>Product listing locked</h3>
            <p>Super admin approval is required before this pharmacy can add products.</p>
          </div>
        </article>
      ) : (
        <form className="panel product-form product-page-form" onSubmit={submitProduct}>
          <h2>Add product details</h2>
          <div className="sample-row">
            {sampleProducts.map((productName) => (
              <button
                className="sample-button"
                type="button"
                key={productName}
                onClick={() => applySampleProduct(productName)}
              >
                {productName}
              </button>
            ))}
          </div>
          <label>
            Product photos
            <span className="field-help">Minimum 2 photos, maximum 6.</span>
            <input
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={updateProductPhotos}
              type="file"
              required
            />
          </label>
          {/* overflow-x: auto so grid scrolls horizontally when 6 images are added */}
          <div className="photo-preview-grid" style={{ overflowX: "auto" }}>
            {photoPreviews.length ? (
              photoPreviews.map((previewUrl) => (
                <img src={previewUrl} alt="Selected product preview" key={previewUrl} />
              ))
            ) : (
              <div className="photo-empty">
                <ImagePlus size={20} aria-hidden="true" />
                Add at least 2 photos
              </div>
            )}
          </div>
          <label>
            Product name
            <input
              name="product_name"
              value={productForm.product_name}
              onChange={updateProductField}
              onBlur={touch(setTouched, "product_name")}
              className={inputClass(touched.product_name, fieldErrors.product_name)}
              required
            />
            {fieldErrors.product_name && <span className="field-error-msg">{fieldErrors.product_name}</span>}
          </label>
          <label>
            Brand
            <input name="brand" value={productForm.brand} onChange={updateProductField} />
          </label>
          <div className="inline-fields">
            <label>
              Category
              <input name="category" value={productForm.category} onChange={updateProductField} />
            </label>
            <label>
              Unit
              <input
                name="unit_label"
                value={productForm.unit_label}
                onChange={updateProductField}
                placeholder="500g, 400g tin"
              />
            </label>
          </div>
          <div className="inline-fields">
            <label>
              Price
              <input
                name="price"
                value={productForm.price}
                onChange={updateProductField}
                onBlur={touch(setTouched, "price")}
                className={inputClass(touched.price, fieldErrors.price)}
                type="number"
                min="1"
                step="0.01"
                required
              />
              {fieldErrors.price && <span className="field-error-msg">{fieldErrors.price}</span>}
            </label>
            <label>
              Offer price
              <input
                name="offer_price"
                value={productForm.offer_price}
                onChange={updateProductField}
                onBlur={touch(setTouched, "offer_price")}
                className={inputClass(touched.offer_price, fieldErrors.offer_price)}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Optional, must be less than price"
              />
              {fieldErrors.offer_price && <span className="field-error-msg">{fieldErrors.offer_price}</span>}
            </label>
            <label>
              Stock
              <input
                name="stock_quantity"
                value={productForm.stock_quantity}
                onChange={updateProductField}
                onBlur={touch(setTouched, "stock_quantity")}
                className={inputClass(touched.stock_quantity, fieldErrors.stock_quantity)}
                type="number"
                min="0"
                required
              />
              {fieldErrors.stock_quantity && <span className="field-error-msg">{fieldErrors.stock_quantity}</span>}
              {productForm.stock_quantity === "0" && (
                <span className="field-help" style={{ color: "#b45309" }}>
                  Stock is 0 — product will show as out of stock immediately after approval.
                </span>
              )}
            </label>
          </div>

          {productMessage && <div className="success">{productMessage}</div>}

          <button className="button" type="submit" disabled={isAddingProduct}>
            <PackagePlus size={18} aria-hidden="true" />
            {isAddingProduct ? "Adding" : "Add product"}
          </button>
        </form>
      )}
    </PharmacyPageShell>
  );
}
