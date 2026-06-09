const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

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
  return window.localStorage.getItem("thean_access_token");
}

export function getCustomerToken() {
  return getToken();
}

export async function fetchCustomerMedia(mediaPath) {
  const token = getToken();

  if (!token) {
    throw new Error("Please login to continue.");
  }

  const response = await fetch(`${API_BASE_URL}${mediaPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Could not load order attachment.");
  }

  return response.blob();
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

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function listPharmacyProducts() {
  return request("/pharmacy/public/products");
}

export function listCustomerAddresses() {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/customer/addresses", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function deleteCustomerAddress(addressId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/customer/addresses/${addressId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getActiveOrderCount() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request("/customer/active-order-count", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createCustomerAddress(data) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/customer/addresses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
}

export function getCustomerAddress(addressId) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/customer/addresses/${addressId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function updateCustomerAddress(addressId, data) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/customer/addresses/${addressId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

export function createPharmacyOrder(data) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/customer/pharmacy-orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
}

export async function createPharmacyOrderWithMedia(data, prescriptionFiles = [], voiceNote = null) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  const formData = new FormData();
  formData.append("payload", JSON.stringify(data));
  prescriptionFiles.forEach((file) => {
    formData.append("prescription_files", file);
  });
  if (voiceNote) {
    formData.append("voice_note", voiceNote, voiceNote.name || "voice-note.webm");
  }

  const response = await fetch(`${API_BASE_URL}/customer/pharmacy-orders/with-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Request failed. Please try again.");
  }
  return payload;
}

export function listCustomerPharmacyOrders() {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request("/customer/pharmacy-orders", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function updateCustomerPharmacyOrder(orderId, action, comment = "") {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/customer/pharmacy-orders/${orderId}/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ comment }),
  });
}

export function reorderCustomerPharmacyOrder(orderId) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/customer/pharmacy-orders/${orderId}/reorder`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function recreateCustomerPharmacyOrderAnyNearby(orderId) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/customer/pharmacy-orders/${orderId}/recreate-any-nearby`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function setSubstitutionPermission(orderId, allowed) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("Please login to continue."));
  }

  return request(`/customer/pharmacy-orders/${orderId}/substitution`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ allowed }),
  });
}

export function approvePriceEstimate(orderId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request(`/customer/pharmacy-orders/${orderId}/approve-price`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function rejectPriceEstimate(orderId) {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
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
  return request(`/delivery/orders/${deliveryOrderId}/rate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Customer-Id": userId,
    },
    body: JSON.stringify({ rating, comment: comment || null }),
  });
}

/** Poll the delivery tracking endpoint for a given pharmacy order_id. */
export function getDeliveryTracking(orderId) {
  const token = getToken();
  const userId = getCustomerUserId();
  if (!token || !userId) return Promise.reject(new Error("Not logged in."));
  return request(`/delivery/tracking/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Customer-Id": userId,
    },
  }).catch((err) => {
    // 404 = no active delivery yet — return null instead of throwing
    if (err.message?.includes("No active delivery")) return null;
    throw err;
  });
}

export function logoutCustomer() {
  window.localStorage.removeItem("thean_access_token");
}
