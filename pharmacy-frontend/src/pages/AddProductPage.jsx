import { useEffect, useState } from "react";
import { ImagePlus, PackagePlus, ShieldAlert } from "lucide-react";

import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { addProduct, getCurrentPharmacy } from "../lib/api.js";

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

  useEffect(() => {
    let isMounted = true;

    async function loadPharmacy() {
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
  }, []);

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

  async function submitProduct(event) {
    event.preventDefault();
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
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsAddingProduct(false);
    }
  }

  if (isLoading) {
    return <PharmacyPageShell><section className="panel">Loading product controls</section></PharmacyPageShell>;
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
          <div className="photo-preview-grid">
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
              required
            />
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
                value={productForm.offer_price}
                onChange={updateProductField}
                type="number"
                min="1"
                step="0.01"
                placeholder="Optional"
              />
            </label>
            <label>
              Stock
              <input
                name="stock_quantity"
                value={productForm.stock_quantity}
                onChange={updateProductField}
                type="number"
                min="0"
                required
              />
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
