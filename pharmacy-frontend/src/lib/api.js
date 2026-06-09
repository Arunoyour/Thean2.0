const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "thean_pharmacy_access_token";
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
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
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
    throw new Error(payload.detail || "Request failed. Please try again.");
  }
  return payload;
}

export function registerPharmacy(data) {
  return request("/pharmacy/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
  return apiFetch(`/pharmacy/orders/${orderId}/ready-for-delivery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function logoutPharmacy() {
  window.localStorage.removeItem(TOKEN_KEY);
}
