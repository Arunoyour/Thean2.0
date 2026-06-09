const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "thean_super_admin_access_token";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Request failed. Please try again.");
  }
  return payload;
}

function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function requestOtp(phoneNumber) {
  return request("/super-admin/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
}

export async function verifyOtp(phoneNumber, otp) {
  const response = await request("/super-admin/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone_number: phoneNumber, otp }),
  });
  window.localStorage.setItem(TOKEN_KEY, response.access_token);
  return response;
}

export function getCurrentAdmin() {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/super-admin/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function listPharmacies() {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/super-admin/pharmacies", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function listCustomers() {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/super-admin/customers", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getCustomerDetail(userId) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/super-admin/customers/${userId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function activatePharmacy(accountId) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/super-admin/pharmacies/${accountId}/activate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function updatePharmacyStatus(accountId, isActive, comment) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/super-admin/pharmacies/${accountId}/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ is_active: isActive, comment }),
  });
}

export function updatePharmacyDetails(accountId, data) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/super-admin/pharmacies/${accountId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
}

export function getPharmacyTimeline(accountId) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/super-admin/pharmacies/${accountId}/timeline`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getPharmacyAvailabilityEvents(accountId, filters = {}) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  const params = new URLSearchParams();
  if (filters.dateFrom) {
    params.set("date_from", new Date(`${filters.dateFrom}T00:00:00`).toISOString());
  }
  if (filters.dateTo) {
    params.set("date_to", new Date(`${filters.dateTo}T23:59:59`).toISOString());
  }
  const query = params.toString();

  return request(`/super-admin/pharmacies/${accountId}/availability-events${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function listPharmacyProductsForReview() {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/super-admin/pharmacy/products", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function approvePharmacyProduct(productId) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/super-admin/pharmacy/products/${productId}/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function requestPharmacyProductRevision(productId, comment) {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/super-admin/pharmacy/products/${productId}/revision`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ comment }),
  });
}

export function getSubstitutionAuditOrders() {
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/super-admin/pharmacy/orders/substitution-audit", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function listAllPharmacyOrders() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request("/super-admin/pharmacy/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getPharmacyOrderDetail(orderId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/super-admin/pharmacy/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchAdminOrderMedia(orderId, userId, mediaId, filename) {
  const token = getToken();
  if (!token) throw new Error("Please login to continue.");
  const response = await fetch(
    `${API_BASE_URL}/super-admin/pharmacy/orders/${orderId}/media/${userId}/${mediaId}/${filename}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("Could not load media.");
  return response.blob();
}

export function getAdminToken() {
  return getToken();
}

export function logoutAdmin() {
  window.localStorage.removeItem(TOKEN_KEY);
}

// ── Delivery Admin API ─────────────────────────────────────────────────────

function deliveryAdminHeaders() {
  const token = getToken();
  const SUPER_TOKEN = import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin";
  return {
    Authorization: `Bearer ${token}`,
    "x-super-admin-token": SUPER_TOKEN,
  };
}

function deliveryRequest(path, options = {}) {
  return request(path, { ...options, headers: { ...deliveryAdminHeaders(), ...(options.headers || {}) } });
}

export function listDeliveryAccounts() {
  return deliveryRequest("/delivery/admin/accounts?x_super_admin_token=" + encodeURIComponent(
    import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin"
  ));
}

export function setDeliveryAccountStatus(accountId, newStatus) {
  const tok = import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin";
  return deliveryRequest(
    `/delivery/admin/accounts/${accountId}/status?new_status=${encodeURIComponent(newStatus)}&x_super_admin_token=${encodeURIComponent(tok)}`,
    { method: "POST" }
  );
}

export function listDeliveryOrders() {
  const tok = import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin";
  return deliveryRequest(`/delivery/admin/orders?x_super_admin_token=${encodeURIComponent(tok)}`);
}

export function clearDeliveryCod(accountId, payload) {
  const tok = import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin";
  return deliveryRequest(
    `/delivery/admin/cod-clear/${accountId}?x_super_admin_token=${encodeURIComponent(tok)}`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function getDeliveryRate() {
  return deliveryRequest("/delivery/config/rate");
}

export function getDeliveryRateHistory() {
  const tok = import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin";
  return deliveryRequest(`/delivery/config/rate/history?x_super_admin_token=${encodeURIComponent(tok)}`);
}

export function setDeliveryRate(payload) {
  const tok = import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin";
  return deliveryRequest(
    `/delivery/admin/config/rate?x_super_admin_token=${encodeURIComponent(tok)}`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

// ── Sector Fee & Tax Config ───────────────────────────────────────────────
export function getSectorFees() {
  const token = getToken();
  return request("/super-admin/config/sector-fees", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getSectorFeeHistory(sector) {
  const token = getToken();
  return request(`/super-admin/config/sector-fees/${sector}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function setSectorFee(sector, payload) {
  const token = getToken();
  return request(`/super-admin/config/sector-fees/${sector}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// ── Auto-assign ────────────────────────────────────────────────────────────

const _ST = () => import.meta.env.VITE_SUPER_ADMIN_TOKEN || "d2decea281512bbf9bd8fe1297946f50e0ea8bf88b709ef20c6c8e1fc94ca4ab-admin";

export function listUnassignedOrders() {
  return deliveryRequest(`/delivery/admin/unassigned-orders?x_super_admin_token=${encodeURIComponent(_ST())}`);
}

export function triggerAutoAssign(payload) {
  return deliveryRequest(`/delivery/admin/auto-assign?x_super_admin_token=${encodeURIComponent(_ST())}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
