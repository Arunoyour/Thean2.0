const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "thean_hc_vendor_token";
const DEFAULT_TIMEOUT_MS = 15_000;

function detailToMessage(detail, fallback = "Request failed. Please try again.") {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map(e => {
        const field = Array.isArray(e.loc) ? e.loc.filter(s => s !== "body").join(" → ") : "";
        const msg = e.msg || String(e);
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" · ");
  }
  return fallback;
}

export function isAbortError(e) {
  return e?.name === "AbortError";
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { "x-vendor-token": token } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out.");
    throw new Error("Network error. Check your connection.");
  } finally {
    clearTimeout(timerId);
  }

  if (response.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Session expired.");
  }

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!response.ok) {
    throw new Error(detailToMessage(data?.detail, `Error ${response.status}`));
  }
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function vendorRegister(formData) {
  // formData is a FormData object (multipart) — do NOT set Content-Type header
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000); // 30s for uploads
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/haircut/vendor/register`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out.");
    throw new Error("Network error. Check your connection.");
  } finally {
    clearTimeout(timerId);
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(detailToMessage(data?.detail, `Error ${response.status}`));
  return data;
}

export function vendorRequestOtp(phone) {
  return request("/haircut/vendor/request-otp", { method: "POST", body: JSON.stringify({ phone }) });
}

export function vendorVerifyOtp(phone, otp) {
  return request("/haircut/vendor/verify-otp", { method: "POST", body: JSON.stringify({ phone, otp }) });
}

// ── Shop ──────────────────────────────────────────────────────────────────

export function getMyShop() {
  return request("/haircut/vendor/shop");
}

export function createShop(payload) {
  return request("/haircut/vendor/shop", { method: "POST", body: JSON.stringify(payload) });
}

export function updateShop(payload) {
  return request("/haircut/vendor/shop", { method: "PATCH", body: JSON.stringify(payload) });
}

export function getShopReviews(shopId) {
  return request(`/haircut/shops/${shopId}/reviews`);
}

// ── Hours ─────────────────────────────────────────────────────────────────

export function getShopHours() {
  return request("/haircut/vendor/shop/hours");
}

export function setShopHours(payload) {
  return request("/haircut/vendor/shop/hours", { method: "PUT", body: JSON.stringify(payload) });
}

// ── Closures ──────────────────────────────────────────────────────────────

export function getHolidayWarning(closureDate) {
  return request(`/haircut/vendor/shop/closure/warning?closure_date=${closureDate}`);
}

export function createClosure(payload) {
  return request("/haircut/vendor/shop/closure", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteClosure(closureDate) {
  return request(`/haircut/vendor/shop/closure/${closureDate}`, { method: "DELETE" });
}

// ── Services ──────────────────────────────────────────────────────────────

export function listServices() {
  return request("/haircut/vendor/services");
}

export function createService(payload) {
  return request("/haircut/vendor/services", { method: "POST", body: JSON.stringify(payload) });
}

export function updateService(serviceId, payload) {
  return request(`/haircut/vendor/services/${serviceId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function toggleService(serviceId) {
  return request(`/haircut/vendor/services/${serviceId}/toggle`, { method: "POST" });
}

export function deleteService(serviceId) {
  return request(`/haircut/vendor/services/${serviceId}`, { method: "DELETE" });
}

// ── Appointments ──────────────────────────────────────────────────────────

export function getTodayAppointments() {
  return request("/haircut/vendor/appointments/today");
}

export function otpCheckin(bookingId, otpCode) {
  return request(`/haircut/vendor/bookings/${bookingId}/otp-checkin`, {
    method: "POST",
    body: JSON.stringify({ otp_code: otpCode }),
  });
}

export function approveManualCheckin(bookingId) {
  return request(`/haircut/vendor/bookings/${bookingId}/approve-checkin`, { method: "POST" });
}
