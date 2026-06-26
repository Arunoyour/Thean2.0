import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ImagePlus, PackagePlus, RefreshCw, ShieldAlert } from "lucide-react";

import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { addProduct, getCurrentPharmacy, listProducts } from "../lib/api.js";
import { validatePositiveNumber, validateNonNegativeNumber, validateOfferPrice, validateRequired, validateFileSize, inputClass, touch } from "../lib/validation.js";

const reqProductName = validateRequired("Product name");

// ── Fuzzy match ──────────────────────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
function meaningfulWords(str) {
  return normalize(str).split(" ").filter((w) => w.length > 2);
}
function fuzzyMatch(typed, existing) {
  if (!typed || typed.length < 3) return [];
  const typedWords = meaningfulWords(typed);
  if (!typedWords.length) return [];
  return existing.filter((p) => {
    const existingWords = meaningfulWords(p.product_name);
    return typedWords.some((w) => existingWords.some((e) => e.includes(w) || w.includes(e)));
  });
}

const sampleProducts = ["Boost", "NAN", "Horlicks", "Pediasure"];

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read product photo."));
    reader.readAsDataURL(file);
  });
}

function PhotoPreviewSlideshow({ previewUrls }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [previewUrls]);

  if (!previewUrls.length) {
    return (
      <div className="photo-empty">
        <ImagePlus size={20} aria-hidden="true" />
        Add at least 2 photos
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, previewUrls.length - 1);

  return (
    <div className="photo-preview-slideshow">
      <div className="photo-preview-slideshow-stage">
        {previewUrls.length > 1 && (
          <button
            type="button"
            className="photo-preview-slideshow-nav photo-preview-slideshow-prev"
            aria-label="Previous photo"
            onClick={() => setActiveIndex((i) => (i - 1 + previewUrls.length) % previewUrls.length)}
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <img src={previewUrls[safeIndex]} alt={`Product preview ${safeIndex + 1} of ${previewUrls.length}`} />
        {previewUrls.length > 1 && (
          <button
            type="button"
            className="photo-preview-slideshow-nav photo-preview-slideshow-next"
            aria-label="Next photo"
            onClick={() => setActiveIndex((i) => (i + 1) % previewUrls.length)}
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      {previewUrls.length > 1 && (
        <div className="photo-preview-slideshow-dots">
          {previewUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              className={`photo-preview-slideshow-dot${index === safeIndex ? " active" : ""}`}
              aria-label={`Show photo ${index + 1}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_DISCLAIMER = "All images are for representational purposes only. It is advised that you read the batch and manufacturing details, directions for use, allergen information, health and nutritional claims (wherever applicable), and other details mentioned on the label before consuming the product. For combo items, individual prices can be viewed on the page.";

export function AddProductPage() {
  const [pharmacy, setPharmacy] = useState(null);
  const [ownProducts, setOwnProducts] = useState([]);
  const [inlineSuggestions, setInlineSuggestions] = useState([]);
  const [submitWarning, setSubmitWarning] = useState(null); // null | array of matches
  const debounceRef = useRef(null);

  const [productForm, setProductForm] = useState({
    product_name: "",
    brand: "",
    category: "Nutrition",
    unit_label: "",
    about: "",
    ingredients: "",
    health_benefits: "",
    other_info: "",
    disclaimer: DEFAULT_DISCLAIMER,
    pack_of: "",
    net_weight: "",
    calorie_count: "",
    dietary_preference: "Veg",
    country_of_origin: "India",
    shelf_life: "",
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
    // Load own products once for fuzzy duplicate detection
    listProducts().then(setOwnProducts).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [loadKey]);

  function updateProductField(event) {
    const { name, value } = event.target;
    setProductForm((current) => ({ ...current, [name]: value }));
    if (name === "product_name") {
      clearTimeout(debounceRef.current);
      setSubmitWarning(null);
      debounceRef.current = setTimeout(() => {
        setInlineSuggestions(fuzzyMatch(value, ownProducts).slice(0, 3));
      }, 300);
    }
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
    for (const f of files) {
      const err = validateFileSize(f);
      if (err) { setError(err); event.target.value = ""; return; }
    }
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

  async function doSubmit() {
    setSubmitWarning(null);
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
        about: productForm.about || null,
        ingredients: productForm.ingredients || null,
        health_benefits: productForm.health_benefits || null,
        other_info: productForm.other_info || null,
        disclaimer: productForm.disclaimer || DEFAULT_DISCLAIMER,
        pack_of: productForm.pack_of ? Number(productForm.pack_of) : null,
        net_weight: productForm.net_weight || null,
        calorie_count: productForm.calorie_count || null,
        dietary_preference: productForm.dietary_preference || null,
        country_of_origin: productForm.country_of_origin || "India",
        shelf_life: productForm.shelf_life || null,
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
        about: "",
        ingredients: "",
        health_benefits: "",
        other_info: "",
        disclaimer: DEFAULT_DISCLAIMER,
        pack_of: "",
        net_weight: "",
        calorie_count: "",
        dietary_preference: "Veg",
        country_of_origin: "India",
        shelf_life: "",
        price: "",
        offer_price: "",
        stock_quantity: "",
      });
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setTouched({});
      setInlineSuggestions([]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsAddingProduct(false);
    }
  }

  function submitProduct(event) {
    event.preventDefault();
    setTouched({ product_name: true, price: true, offer_price: true, stock_quantity: true });
    if (
      reqProductName(productForm.product_name) ||
      priceValidator(productForm.price) ||
      offerValidator(productForm.offer_price) ||
      stockValidator(productForm.stock_quantity)
    ) return;
    // Duplicate check before submitting
    const matches = fuzzyMatch(productForm.product_name, ownProducts).slice(0, 3);
    if (matches.length > 0 && submitWarning === null) {
      setSubmitWarning(matches);
      return;
    }
    doSubmit();
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
          <PhotoPreviewSlideshow previewUrls={photoPreviews} />
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
            {inlineSuggestions.length > 0 && (
              <div className="duplicate-inline-hint">
                <AlertTriangle size={13} />
                <span>You already have similar product{inlineSuggestions.length > 1 ? "s" : ""}:</span>
                <ul className="duplicate-inline-list">
                  {inlineSuggestions.map((p) => (
                    <li key={p.product_id}>
                      <strong>{p.product_name}</strong>
                      {" — "}
                      {p.offer_price
                        ? <><span className="dup-offer">₹{p.offer_price}</span> <del>₹{p.price}</del></>
                        : <>₹{p.price}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
              Unit label
              <input
                name="unit_label"
                value={productForm.unit_label}
                onChange={updateProductField}
                placeholder="500g tin, 1L bottle"
              />
            </label>
          </div>

          <label>
            About the product
            <textarea
              name="about"
              value={productForm.about}
              onChange={updateProductField}
              rows={3}
              placeholder="Short description of the product"
            />
          </label>
          <label>
            Ingredients
            <textarea
              name="ingredients"
              value={productForm.ingredients}
              onChange={updateProductField}
              rows={3}
              placeholder="List all ingredients"
            />
          </label>
          <label>
            Health benefits
            <textarea
              name="health_benefits"
              value={productForm.health_benefits}
              onChange={updateProductField}
              rows={2}
              placeholder="Key health benefits"
            />
          </label>
          <label>
            Other product info
            <textarea
              name="other_info"
              value={productForm.other_info}
              onChange={updateProductField}
              rows={2}
              placeholder="Usage instructions, storage notes, etc."
            />
          </label>
          <label>
            Disclaimer
            <textarea
              name="disclaimer"
              value={productForm.disclaimer}
              onChange={updateProductField}
              rows={3}
            />
          </label>

          <div className="inline-fields">
            <label>
              Pack of
              <input
                name="pack_of"
                value={productForm.pack_of}
                onChange={updateProductField}
                type="number"
                min="1"
                placeholder="e.g. 6"
              />
            </label>
            <label>
              Weight / Volume
              <input
                name="net_weight"
                value={productForm.net_weight}
                onChange={updateProductField}
                placeholder="e.g. 500g, 1L"
              />
            </label>
            <label>
              Calorie count
              <input
                name="calorie_count"
                value={productForm.calorie_count}
                onChange={updateProductField}
                placeholder="e.g. 200 kcal per 100g"
              />
            </label>
          </div>

          <div className="inline-fields">
            <label>
              Dietary preference
              <select name="dietary_preference" value={productForm.dietary_preference} onChange={updateProductField}>
                <option value="Veg">Veg</option>
                <option value="Non-veg">Non-veg</option>
                <option value="NA">N/A</option>
              </select>
            </label>
            <label>
              Country of origin
              <input
                name="country_of_origin"
                value={productForm.country_of_origin}
                onChange={updateProductField}
              />
            </label>
            <label>
              Shelf life
              <input
                name="shelf_life"
                value={productForm.shelf_life}
                onChange={updateProductField}
                placeholder="e.g. 12 months"
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

          {submitWarning && (
            <div className="duplicate-submit-warning">
              <div className="duplicate-warning-header">
                <AlertTriangle size={16} />
                <strong>Possible duplicate — already listed by you</strong>
              </div>
              <ul className="duplicate-warning-list">
                {submitWarning.map((p) => (
                  <li key={p.product_id}>
                    <span className="dup-name">{p.product_name}</span>
                    <span className="dup-price">
                      {p.offer_price
                        ? <><span className="dup-offer">₹{p.offer_price}</span> <del>₹{p.price}</del></>
                        : <>₹{p.price}</>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="duplicate-warning-note">This could be a different variant — confirm if you want to list it anyway.</p>
              <div className="duplicate-warning-actions">
                <button className="button" type="button" onClick={doSubmit} disabled={isAddingProduct}>
                  <PackagePlus size={16} /> {isAddingProduct ? "Adding…" : "Submit anyway"}
                </button>
                <button className="outline-button" type="button" onClick={() => setSubmitWarning(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!submitWarning && (
            <button className="button" type="submit" disabled={isAddingProduct}>
              <PackagePlus size={18} aria-hidden="true" />
              {isAddingProduct ? "Adding…" : "Add product"}
            </button>
          )}
        </form>
      )}
    </PharmacyPageShell>
  );
}
