const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds for all requests

// ── Token helpers ──────────────────────────────────────────────────────────

function getToken() {
  return window.localStorage.getItem("thean_access_token");
}

export function getCustomerToken() {
  return getToken();
}

/**
 * Decode the JWT exp claim (no crypto — just reading our own token).
 * If the token is expired, remove it from localStorage and throw so callers
 * never send a request that is guaranteed to 401.
 */
function assertTokenNotExpired(token) {
  if (!token) return; // missing token handled by each caller
  try {
    const payloadBase64 = token.split(".")[1];
    const decoded = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      window.localStorage.removeItem("thean_access_token");
      throw new Error("Session expired. Please log in again.");
    }
  } catch (parseError) {
    // Re-throw our own error; swallow malformed-token decode failures
    // (let the server reject them so we don't lock out edge cases).
    if (parseError.message === "Session expired. Please log in again.") {
      throw parseError;
    }
  }
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────

/**
 * Execute one fetch attempt inside the given AbortController, throw on error.
 * @returns {Promise<any>} parsed JSON payload
 */
async function fetchOnce(url, options, signal) {
  let response;
  try {
    response = await fetch(url, { ...options, signal });
  } catch (fetchError) {
    if (fetchError.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    throw fetchError; // genuine network failure
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.detail || "Request failed. Please try again.");
    err.status = response.status;
    throw err;
  }
  return payload;
}

/**
 * Send an API request with:
 *  - 10-second AbortController timeout
 *  - one automatic retry on network errors and 5xx responses (not on 4xx)
 *  - Content-Type: application/json header by default
 */
async function request(path, options = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const url = `${API_BASE_URL}${path}`;
  const mergedOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };

  try {
    // First attempt
    try {
      return await fetchOnce(url, mergedOptions, controller.signal);
    } catch (firstError) {
      // Only retry transient failures: network errors (no status) or 5xx.
      // Never retry 4xx (auth, validation) or timeouts (AbortError).
      const isTransient =
        firstError.name !== "AbortError" &&
        (firstError.status === undefined || firstError.status >= 500);

      if (!isTransient) throw firstError;

      // Wait 1 s then try once more
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return await fetchOnce(url, mergedOptions, controller.signal);
    }
  } finally {
    clearTimeout(timerId);
  }
}

// ── Public API functions ───────────────────────────────────────────────────

export async function fetchCustomerMedia(mediaPath) {
  const token = getToken();
  if (!token) throw new Error("Please login to continue.");
  assertTokenNotExpired(token);

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${mediaPath}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Could not load order attachment.");
    return response.blob();
  } catch (fetchError) {
    if (fetchError.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    throw fetchError;
  } finally {
    clearTimeout(timerId);
  }
}

export function registerCustomer(data) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function requestOtp(phoneNumber) {
  return request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
}

export function verifyOtp(phoneNumber, otp) {
  return request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone_number: phoneNumber, otp }),
  });
}

export function getCurrentUser() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listPharmacyProducts() {
  return request("/pharmacy/public/products");
}

export function listCustomerAddresses() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request("/customer/addresses", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function deleteCustomerAddress(addressId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/addresses/${addressId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getActiveOrderCount() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request("/customer/active-order-count", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createCustomerAddress(data) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request("/customer/addresses", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export function getCustomerAddress(addressId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/addresses/${addressId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateCustomerAddress(addressId, data) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/addresses/${addressId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export function listNearbyPharmacies(latitude, longitude, radiusKm = 5) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radius_km: String(radiusKm),
  });
  return request(`/pharmacy/public/nearby?${params.toString()}`);
}

export function getPharmacyStatus(accountId) {
  return request(`/pharmacy/public/${accountId}/status`);
}

export function createPharmacyOrder(data) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request("/customer/pharmacy-orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function createPharmacyOrderWithMedia(data, prescriptionFiles = [], voiceNote = null) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);

  const formData = new FormData();
  formData.append("payload", JSON.stringify(data));
  prescriptionFiles.forEach((file) => {
    formData.append("prescription_files", file);
  });
  if (voiceNote) {
    formData.append("voice_note", voiceNote, voiceNote.name || "voice-note.webm");
  }

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/customer/pharmacy-orders/with-media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Request failed. Please try again.");
    return payload;
  } catch (fetchError) {
    if (fetchError.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    throw fetchError;
  } finally {
    clearTimeout(timerId);
  }
}

export function listCustomerPharmacyOrders() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request("/customer/pharmacy-orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateCustomerPharmacyOrder(orderId, action, comment = "") {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/pharmacy-orders/${orderId}/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ comment }),
  });
}

export function reorderCustomerPharmacyOrder(orderId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/pharmacy-orders/${orderId}/reorder`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function recreateCustomerPharmacyOrderAnyNearby(orderId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/pharmacy-orders/${orderId}/recreate-any-nearby`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function setSubstitutionPermission(orderId, allowed) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/pharmacy-orders/${orderId}/substitution`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ allowed }),
  });
}

export function setPartialFulfillmentPermission(orderId, allowed) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/pharmacy-orders/${orderId}/partial-fulfillment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ allowed }),
  });
}

export function approvePriceEstimate(orderId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/pharmacy-orders/${orderId}/approve-price`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function rejectPriceEstimate(orderId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  assertTokenNotExpired(token);
  return request(`/customer/pharmacy-orders/${orderId}/reject-price`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Decode the JWT stored in localStorage and return the user_id (sub claim).
 * No crypto validation — just reading our own token's payload.
 */
export function getCustomerUserId() {
  const token = getToken();
  if (!token) return null;
  try {
    const payloadBase64 = token.split(".")[1];
    const decoded = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.sub || null;
  } catch {
    return null;
  }
}

/** Submit a 1-5 star rating + optional comment for a completed delivery. */
export function submitDeliveryRating(deliveryOrderId, rating, comment) {
  const token = getToken();
  const userId = getCustomerUserId();
  if (!token || !userId) return Promise.reject(new Error("Not logged in."));
  assertTokenNotExpired(token);
  return request(`/delivery/orders/${deliveryOrderId}/rate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Customer-Id": userId,
    },
    body: JSON.stringify({ rating, comment: comment || null }),
  });
}

/**
 * Poll the delivery tracking endpoint for a given pharmacy order_id.
 * Returns null when no active delivery exists yet (expected during order
 * preparation), re-throws for all other errors.
 *
 * The backend returns exactly "No active delivery found for this order." in
 * the detail field when the delivery hasn't been created yet — match that
 * exact phrase so we don't accidentally swallow real API errors.
 */
const NO_ACTIVE_DELIVERY_MSG = "No active delivery found for this order.";

export function getDeliveryTracking(orderId) {
  const token = getToken();
  const userId = getCustomerUserId();
  if (!token || !userId) return Promise.reject(new Error("Not logged in."));
  assertTokenNotExpired(token);
  return request(`/delivery/tracking/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Customer-Id": userId,
    },
  }).catch((err) => {
    // Exact match: "no delivery yet" is expected during order preparation
    if (err.message === NO_ACTIVE_DELIVERY_MSG) return null;
    // Everything else is a real error — re-throw
    throw err;
  });
}

export function logoutCustomer() {
  window.localStorage.removeItem("thean_access_token");
}

// ── Customer Disputes ─────────────────────────────────────────────────────

export function listCustomerDisputes() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Not logged in."));
  assertTokenNotExpired(token);
  return request("/customer/disputes", { headers: { Authorization: `Bearer ${token}` } });
}

export function getCustomerDispute(disputeId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Not logged in."));
  assertTokenNotExpired(token);
  return request(`/customer/disputes/${disputeId}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function raiseCustomerDispute(formData) {
  const token = getToken();
  if (!token) throw new Error("Not logged in.");
  assertTokenNotExpired(token);
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(`${API_BASE_URL}/customer/disputes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
    if (resp.status === 401) {
      window.localStorage.removeItem("thean_access_token");
      window.location.href = "/login";
      throw new Error("Session expired.");
    }
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.detail || "Failed to raise dispute.");
    return payload;
  } finally {
    clearTimeout(timerId);
  }
}

export async function reopenCustomerDispute(disputeId, formData) {
  const token = getToken();
  if (!token) throw new Error("Not logged in.");
  assertTokenNotExpired(token);
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(`${API_BASE_URL}/customer/disputes/${disputeId}/reopen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
    if (resp.status === 401) {
      window.localStorage.removeItem("thean_access_token");
      window.location.href = "/login";
      throw new Error("Session expired.");
    }
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.detail || "Failed to reopen dispute.");
    return payload;
  } finally {
    clearTimeout(timerId);
  }
}

// ── Order Disputes (customer) ─────────────────────────────────────────────
function _dAuthHdr() { return { Authorization: `Bearer ${getToken()}` }; }
async function _dUpload(path, formData) {
  const token = getToken();
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (resp.status === 401) { window.localStorage.removeItem("thean_access_token"); window.location.href = "/login"; throw new Error("Session expired."); }
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(payload.detail || "Request failed.");
  return payload;
}
export function getOrderDisputeUnreadCount() {
  return request("/customer/order-disputes/unread-count", { headers: _dAuthHdr() });
}
export function listOrderDisputes(status) {
  const p = status ? `?status=${status}` : "";
  return request(`/customer/order-disputes${p}`, { headers: _dAuthHdr() });
}
export function getOrderDispute(disputeId) {
  return request(`/customer/order-disputes/${disputeId}`, { headers: _dAuthHdr() });
}
export function raiseOrderDispute(formData) { return _dUpload("/customer/order-disputes", formData); }
export function replyOrderDispute(disputeId, formData) { return _dUpload(`/customer/order-disputes/${disputeId}/reply`, formData); }
export function closeOrderDispute(disputeId) {
  return request(`/customer/order-disputes/${disputeId}/close`, { method: "POST", headers: _dAuthHdr() });
}

export function getCustomerAttention() {
  return request("/customer/attention", { headers: _dAuthHdr() });
}

export function getDeliverySurgeConfig() {
  return request("/delivery/config/surge");
}

// ── Haircut API ────────────────────────────────────────────────────────────

function _hcAuthHdr() { return { Authorization: `Bearer ${getToken()}`, "x-customer-token": getToken() }; }

export function haircutNearbyShops(lat, lng, radiusKm = 10) {
  return request(`/haircut/shops/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`, { headers: _hcAuthHdr() });
}

export function haircutSearchShops(q) {
  return request(`/haircut/shops/search?q=${encodeURIComponent(q)}`, { headers: _hcAuthHdr() });
}

export function haircutShopDetail(shopId) {
  return request(`/haircut/shops/${shopId}`, { headers: _hcAuthHdr() });
}

export function haircutShopReviews(shopId) {
  return request(`/haircut/shops/${shopId}/reviews`);
}

export function haircutShopHours(shopId) {
  return request(`/haircut/shops/${shopId}/hours`);
}

export function haircutShopClosures(shopId) {
  return request(`/haircut/shops/${shopId}/closures`);
}

export function haircutShopServices(shopId) {
  return request(`/haircut/shops/${shopId}/services`);
}

export function haircutShopAvailability(shopId, date) {
  return request(`/haircut/shops/${shopId}/availability?target_date=${date}`);
}

export function haircutListFavorites() {
  return request("/haircut/favorites", { headers: _hcAuthHdr() });
}

export function haircutAddFavorite(shopId) {
  return request(`/haircut/favorites/${shopId}`, { method: "POST", headers: _hcAuthHdr() });
}

export function haircutRemoveFavorite(shopId) {
  return request(`/haircut/favorites/${shopId}`, { method: "DELETE", headers: _hcAuthHdr() });
}

export function haircutCreateBooking(payload) {
  return request("/haircut/bookings", { method: "POST", body: JSON.stringify(payload), headers: _hcAuthHdr() });
}

export function haircutActiveBooking() {
  return request("/haircut/bookings/active", { headers: _hcAuthHdr() });
}

export function haircutCancelBooking(bookingId, reason) {
  return request(`/haircut/bookings/${bookingId}/cancel`, {
    method: "POST", body: JSON.stringify({ reason }), headers: _hcAuthHdr(),
  });
}

export function haircutManualCheckin(bookingId, lat, lng) {
  return request(`/haircut/bookings/${bookingId}/manual-checkin`, {
    method: "POST", body: JSON.stringify({ customer_lat: lat, customer_lng: lng }), headers: _hcAuthHdr(),
  });
}

export function haircutRescheduleBooking(bookingId, appointmentDate, startTime) {
  return request(`/haircut/bookings/${bookingId}/reschedule`, {
    method: "POST", body: JSON.stringify({ appointment_date: appointmentDate, start_time: startTime }), headers: _hcAuthHdr(),
  });
}

export function haircutSubmitReview(bookingId, rating, comment) {
  return request(`/haircut/bookings/${bookingId}/review`, {
    method: "POST", body: JSON.stringify({ rating, comment: comment || null }), headers: _hcAuthHdr(),
  });
}

export function haircutBookingHistory() {
  return request("/haircut/bookings/history", { headers: _hcAuthHdr() });
}

export function haircutTokenBalance() {
  return request("/haircut/tokens/balance", { headers: _hcAuthHdr() });
}
