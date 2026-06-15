const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "thean_delivery_access_token";
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
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch (fetchError) {
    if (fetchError.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw new Error("Network error. Check your connection and try again.");
  } finally {
    clearTimeout(timerId);
  }

  if (response.status === 401) {
    window.sessionStorage.setItem("thean:session_expired", "1");
    window.location.href = "/login";
    throw new Error("Session expired. Please login again.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Request failed.");
  return payload;
}

function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
export function getDeliveryToken() { return getToken(); }

function authHeaders() {
  const token = getToken();
  if (!token) throw new Error("Please login to continue.");
  return { Authorization: `Bearer ${token}` };
}

// ── Auth ──────────────────────────────────────────────────────────────────
export function registerDelivery(data) {
  return request("/delivery/register", { method: "POST", body: JSON.stringify(data) });
}

export function requestDeliveryOtp(phoneNumber) {
  return request("/delivery/request-otp", { method: "POST", body: JSON.stringify({ phone_number: phoneNumber }) });
}

export async function verifyDeliveryOtp(phoneNumber, otp) {
  const resp = await request("/delivery/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone_number: phoneNumber, otp }),
  });
  window.localStorage.setItem(TOKEN_KEY, resp.access_token);
  return resp;
}

export function uploadDeliveryDocument(docType, file) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login."));
  const form = new FormData();
  form.append("file", file);
  return fetch(`${API_BASE_URL}/delivery/documents/${docType}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }).then(async (r) => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Upload failed."); }
  });
}

// ── Profile ───────────────────────────────────────────────────────────────
export function getDeliveryMe() {
  return request("/delivery/me", { headers: authHeaders() });
}

export function setDeliveryAvailability(isOnline) {
  return request("/delivery/me/availability", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ is_online: isOnline }),
  });
}

export function updateDeliveryLocation(lat, lng) {
  return request("/delivery/me/location", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ lat, lng }),
  });
}

export function logoutDelivery() {
  window.localStorage.removeItem(TOKEN_KEY);
}

// ── Orders ────────────────────────────────────────────────────────────────
export function getDeliveryOrders() {
  return request("/delivery/orders", { headers: authHeaders() });
}

export function getActiveDeliveryOrder() {
  return request("/delivery/orders/active", { headers: authHeaders() });
}

export function acceptDeliveryOrder(deliveryOrderId) {
  return request(`/delivery/orders/${deliveryOrderId}/accept`, { method: "POST", headers: authHeaders() });
}

export function rejectDeliveryOrder(deliveryOrderId) {
  return request(`/delivery/orders/${deliveryOrderId}/reject`, { method: "POST", headers: authHeaders() });
}

export function advanceDeliveryStatus(deliveryOrderId, pin = null) {
  return request(`/delivery/orders/${deliveryOrderId}/advance`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ pin }),
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────
export function getDeliveryChat(deliveryOrderId) {
  return request(`/delivery/orders/${deliveryOrderId}/chat`, { headers: authHeaders() });
}

export function sendDeliveryChat(deliveryOrderId, messageText) {
  return request(`/delivery/orders/${deliveryOrderId}/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message_text: messageText }),
  });
}

// ── Earnings ─────────────────────────────────────────────────────────────
export function getDeliveryEarnings() {
  return request("/delivery/earnings", { headers: authHeaders() });
}

export function requestDeliveryCashout(amount, upiId) {
  return request("/delivery/earnings/cashout", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ amount, upi_id: upiId }),
  });
}

// ── Rate Config ───────────────────────────────────────────────────────────
export function getDeliveryRateConfig() {
  return request("/delivery/config/rate");
}

// ── Settlement ────────────────────────────────────────────────────────────
export function listMyDeliverySettlementBatches() {
  return request("/delivery/settlement/batches", { headers: authHeaders() });
}

export function getMyDeliverySettlementBatch(batchId) {
  return request(`/delivery/settlement/batches/${batchId}`, { headers: authHeaders() });
}

export function getMyDeliverySettlementProofs(batchId) {
  return request(`/delivery/settlement/batches/${batchId}/proofs`, { headers: authHeaders() });
}

// ── Disputes (delivery boy) ───────────────────────────────────────────────
export function listMyDeliveryDisputes() {
  return request("/delivery/disputes", { headers: authHeaders() });
}

export function getMyDeliveryDispute(disputeId) {
  return request(`/delivery/disputes/${disputeId}`, { headers: authHeaders() });
}

export async function raiseDeliveryDispute(formData) {
  const token = getToken();
  if (!token) throw new Error("Please login to continue.");
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(`${API_BASE_URL}/delivery/disputes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
    if (resp.status === 401) { window.location.href = "/login"; throw new Error("Session expired."); }
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.detail || "Failed to raise dispute.");
    return payload;
  } finally { clearTimeout(timerId); }
}

export async function reopenDeliveryDispute(disputeId, formData) {
  const token = getToken();
  if (!token) throw new Error("Please login to continue.");
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(`${API_BASE_URL}/delivery/disputes/${disputeId}/reopen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
    if (resp.status === 401) { window.location.href = "/login"; throw new Error("Session expired."); }
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.detail || "Failed to reopen dispute.");
    return payload;
  } finally { clearTimeout(timerId); }
}

// ── Team Lead ─────────────────────────────────────────────────────────────
export function getTeamMembers() {
  return request("/delivery/team/members", { headers: authHeaders() });
}

export function getTeamMemberDetail(memberId) {
  return request(`/delivery/team/members/${memberId}`, { headers: authHeaders() });
}

export function getTeamEarnings() {
  return request("/delivery/team/earnings", { headers: authHeaders() });
}

export function getTeamCod() {
  return request("/delivery/team/cod", { headers: authHeaders() });
}

export function adminClearCod(memberId, amount, note) {
  return request("/delivery/admin/cod/clear", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ account_id: memberId, amount, note }),
  });
}

// ── Order Disputes (delivery boy) ─────────────────────────────────────────
async function _dlUpload(path, formData) {
  const resp = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers: authHeaders(), body: formData });
  if (resp.status === 401) { window.localStorage.removeItem(TOKEN_KEY); window.location.href = "/login"; throw new Error("Session expired."); }
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(payload.detail || "Request failed.");
  return payload;
}
export function getDeliveryDisputeUnreadCount() { return request("/delivery/order-disputes/unread-count", { headers: authHeaders() }); }
export function listDeliveryOrderDisputes(status) {
  const p = status ? `?status=${status}` : "";
  return request(`/delivery/order-disputes${p}`, { headers: authHeaders() });
}
export function getDeliveryOrderDispute(disputeId) { return request(`/delivery/order-disputes/${disputeId}`, { headers: authHeaders() }); }
export function raiseDeliveryOrderDispute(formData) { return _dlUpload("/delivery/order-disputes", formData); }
export function replyDeliveryOrderDispute(disputeId, formData) { return _dlUpload(`/delivery/order-disputes/${disputeId}/reply`, formData); }
export function closeDeliveryOrderDispute(disputeId) { return request(`/delivery/order-disputes/${disputeId}/close`, { method: "POST", headers: authHeaders() }); }

export function getDeliveryAttention() {
  return fetch(`${API_BASE_URL}/delivery/attention`, { headers: authHeaders() })
    .then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Failed.");
      return d;
    });
}
