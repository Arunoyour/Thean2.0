const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(
  /\/api\/v1$/,
  "",
);

export function ProductImageSlideshow({ images, productName }) {
  if (!images?.length) {
    return <div className="product-image-placeholder">No photos</div>;
  }

  return (
    <div className="product-image-slideshow" aria-label={`${productName} photos`}>
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
