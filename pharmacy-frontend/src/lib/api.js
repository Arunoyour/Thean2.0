const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "thean_pharmacy_access_token";
const ACTIVE_KEY = "thean_pharmacy_is_active";

export function setPharmacyActive(active) { window.localStorage.setItem(ACTIVE_KEY, active ? "1" : "0"); }
export function getPharmacyActive() { return window.localStorage.getItem(ACTIVE_KEY) === "1"; }

/** Convert a FastAPI `detail` value to a readable string.
 *  Pydantic 422 errors return detail as [{loc, msg, type}] — join them into
 *  one sentence so users see "Phone number: value is not a valid phone number"
 *  instead of "[object Object]". */
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
const DEFAULT_TIMEOUT_MS = 15_000; // 15 s — prevents requests hanging forever

/** Returns true when an error was caused by an AbortController signal — callers
 *  should silently ignore these (component unmounted before the request finished). */
export function isAbortError(e) {
  return e?.name === "AbortError";
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response;
  try {
    // Don't set Content-Type for FormData — browser sets it automatically with the correct multipart boundary
    const isFormData = options.body instanceof FormData;
    const headers = isFormData
      ? { ...(options.headers || {}) }
      : { "Content-Type": "application/json", ...(options.headers || {}) };

    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });
  } catch (fetchError) {
    if (fetchError.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw new Error("Network error. Check your connection and try again.");
  } finally {
    clearTimeout(timerId);
  }

  // 401 means the session token has expired — redirect to login with a flag
  if (response.status === 401) {
    window.sessionStorage.setItem("thean:session_expired", "1");
    window.location.href = "/login";
    throw new Error("Session expired. Please login again.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(detailToMessage(payload.detail));
  }
  return payload;
}

export function registerPharmacy(data, storeImageFile, drugLicenceFile, ownerIdFile) {
  const fd = new FormData();
  fd.append("owner_name",     data.owner_name);
  fd.append("phone_number",   data.phone_number);
  if (data.email)   fd.append("email",   data.email);
  fd.append("store_name",     data.store_name);
  fd.append("license_number", data.license_number);
  fd.append("address_line_1", data.address_line_1);
  if (data.city)    fd.append("city",    data.city);
  if (data.state)   fd.append("state",   data.state);
  if (data.pincode) fd.append("pincode", data.pincode);
  fd.append("latitude",  String(data.latitude));
  fd.append("longitude", String(data.longitude));
  fd.append("store_image",   storeImageFile);
  fd.append("drug_licence",  drugLicenceFile);
  fd.append("owner_id_doc",  ownerIdFile);
  return request("/pharmacy/register", { method: "POST", body: fd });
}

export function requestPharmacyOtp(phoneNumber) {
  return request("/pharmacy/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
}

export async function verifyPharmacyOtp(phoneNumber, otp) {
  const response = await request("/pharmacy/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone_number: phoneNumber, otp }),
  });
  window.localStorage.setItem(TOKEN_KEY, response.access_token);
  return response;
}

export function getCurrentPharmacy() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/pharmacy/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function updatePharmacyAvailability(isOnline) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/pharmacy/me/availability", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ is_online: isOnline }),
  });
}

export function getPharmacyScheduleStatus() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/pharmacy/me/schedule-status", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function listProducts() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/pharmacy/products", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function addProduct(data) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/pharmacy/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
}

export function updateProduct(productId, data) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/pharmacy/products/${productId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
}

export function resubmitProduct(productId, comment) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/pharmacy/products/${productId}/resubmit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ comment }),
  });
}

export function listAssignedOrders() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/pharmacy/orders/assigned", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function listManagedOrders() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/pharmacy/orders", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function acceptAssignedOrder(orderId) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/pharmacy/orders/${orderId}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function rejectAssignedOrder(orderId) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/pharmacy/orders/${orderId}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getPharmacyToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export async function fetchPharmacyMedia(mediaPath) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    throw new Error("Please login to continue.");
  }

  const response = await fetch(`${API_BASE_URL}${mediaPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error("Could not load order media.");
  }
  return response.blob();
}

export function submitPharmacyEstimate(orderId, payload) {
  // payload: { medicine_cost: number, notes?: string }
  // Delivery charge, platform fee, and GST are auto-calculated server-side.
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/pharmacy/orders/${orderId}/submit-estimate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function submitPharmacyBill(orderId, items) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/pharmacy/orders/${orderId}/submit-bill`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  });
}

export function getPharmacyOrderById(orderId) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  // Orders list filtered by orderId — re-use managed orders and find
  return listManagedOrders().then((orders) => {
    const found = orders.find((o) => o.order_id === orderId);
    if (!found) throw new Error("Order not found.");
    return found;
  });
}

export function markOrderReadyForDelivery(orderId) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/pharmacy/orders/${orderId}/ready-for-delivery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function logoutPharmacy() {
  window.localStorage.removeItem(TOKEN_KEY);
}

// ── Settlement (pharmacy-facing) ──────────────────────────────────────────

export function listMySettlementBatches({ statusFilter, limit = 30, offset = 0 } = {}) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  const params = new URLSearchParams({ limit, offset });
  if (statusFilter) params.set("status_filter", statusFilter);
  return request(`/pharmacy/settlement/batches?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getMySettlementBatch(batchId) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/pharmacy/settlement/batches/${batchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getMySettlementProofs(batchId) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/pharmacy/settlement/batches/${batchId}/proofs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Disputes (pharmacy-facing) ────────────────────────────────────────────

export function listMyDisputes({ statusFilter, disputeType, limit = 30, offset = 0 } = {}) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  const params = new URLSearchParams({ limit, offset });
  if (statusFilter) params.set("status_filter", statusFilter);
  if (disputeType) params.set("dispute_type", disputeType);
  return request(`/pharmacy/disputes?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getMyDispute(disputeId) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/pharmacy/disputes/${disputeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function raisePharmacyDispute({
  dispute_type,
  reference_type,
  reference_id,
  reference_detail,
  text_content,
  voice_file,
  voice_duration_secs,
  image_file,
  attachment_file,
}) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("Please login to continue.");

  const form = new FormData();
  form.append("dispute_type", dispute_type);
  form.append("reference_type", reference_type);
  if (reference_id) form.append("reference_id", reference_id);
  form.append("reference_detail", JSON.stringify(reference_detail ?? {}));
  if (text_content) form.append("text_content", text_content);
  if (voice_duration_secs != null) form.append("voice_duration_secs", voice_duration_secs);
  if (voice_file) form.append("voice_file", voice_file);
  if (image_file) form.append("image_file", image_file);
  if (attachment_file) form.append("attachment_file", attachment_file);

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/pharmacy/disputes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out.");
    throw new Error("Network error.");
  } finally {
    clearTimeout(timerId);
  }
  if (response.status === 401) {
    window.sessionStorage.setItem("thean:session_expired", "1");
    window.location.href = "/login";
    throw new Error("Session expired.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(detailToMessage(payload.detail));
  return payload;
}

export async function reopenPharmacyDispute(disputeId, {
  text_content,
  voice_file,
  voice_duration_secs,
  image_file,
  attachment_file,
} = {}) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("Please login to continue.");

  const form = new FormData();
  if (text_content) form.append("text_content", text_content);
  if (voice_duration_secs != null) form.append("voice_duration_secs", voice_duration_secs);
  if (voice_file) form.append("voice_file", voice_file);
  if (image_file) form.append("image_file", image_file);
  if (attachment_file) form.append("attachment_file", attachment_file);

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/pharmacy/disputes/${disputeId}/reopen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out.");
    throw new Error("Network error.");
  } finally {
    clearTimeout(timerId);
  }
  if (response.status === 401) {
    window.sessionStorage.setItem("thean:session_expired", "1");
    window.location.href = "/login";
    throw new Error("Session expired.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(detailToMessage(payload.detail));
  return payload;
}

export async function getVapidPublicKey() {
  const r = await apiFetch("/pharmacy/push/vapid-public-key", { method: "GET" });
  return r.key;
}

export async function savePushSubscription(sub) {
  const { endpoint, keys } = sub.toJSON();
  return apiFetch("/pharmacy/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  });
}

export async function removePushSubscription(sub) {
  const { endpoint, keys } = sub.toJSON();
  return apiFetch("/pharmacy/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  });
}

// ── Order Disputes (pharmacy) ─────────────────────────────────────────────
const _phToken = () => window.localStorage.getItem(TOKEN_KEY);
const _phHdr = () => ({ Authorization: `Bearer ${_phToken()}` });
async function _phUpload(path, formData) {
  const resp = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers: _phHdr(), body: formData });
  if (resp.status === 401) { window.localStorage.removeItem(TOKEN_KEY); window.location.href = "/login"; throw new Error("Session expired."); }
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(detailToMessage(payload.detail));
  return payload;
}
export function getPharmacyDisputeUnreadCount() { return request("/pharmacy/order-disputes/unread-count", { headers: _phHdr() }); }
export function listPharmacyOrderDisputes(status) {
  const p = status ? `?status=${status}` : "";
  return request(`/pharmacy/order-disputes${p}`, { headers: _phHdr() });
}
export function getPharmacyOrderDispute(disputeId) { return request(`/pharmacy/order-disputes/${disputeId}`, { headers: _phHdr() }); }
export function raisePharmacyOrderDispute(formData) { return _phUpload("/pharmacy/order-disputes", formData); }
export function replyPharmacyOrderDispute(disputeId, formData) { return _phUpload(`/pharmacy/order-disputes/${disputeId}/reply`, formData); }
export function closePharmacyOrderDispute(disputeId) { return request(`/pharmacy/order-disputes/${disputeId}/close`, { method: "POST", headers: _phHdr() }); }

export function getPharmacyStats() { return request("/pharmacy/me/stats", { headers: _phHdr() }); }
export function updatePharmacyProfile(formData) { return request("/pharmacy/me/profile", { method: "PATCH", headers: { Authorization: _phHdr().Authorization }, body: formData }); }

export function getOperatingHours() { return request("/pharmacy/me/operating-hours", { headers: _phHdr() }); }
export function setOperatingHours(days) { return request("/pharmacy/me/operating-hours", { method: "PUT", headers: _phHdr(), body: JSON.stringify({ days }) }); }
export function clearOperatingHours() { return request("/pharmacy/me/operating-hours", { method: "DELETE", headers: _phHdr() }); }
export function getHolidays() { return request("/pharmacy/me/holidays", { headers: _phHdr() }); }
export function addHoliday(holiday_date, reason) { return request("/pharmacy/me/holidays", { method: "POST", headers: _phHdr(), body: JSON.stringify({ holiday_date, reason }) }); }
export function removeHoliday(holidayId) { return request(`/pharmacy/me/holidays/${holidayId}`, { method: "DELETE", headers: _phHdr() }); }

export function getPharmacyAttention() {
  const token = window.localStorage.getItem("thean_pharmacy_access_token");
  return fetch(`${API_BASE_URL}/pharmacy/attention`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(detailToMessage(d.detail));
    return d;
  });
}
