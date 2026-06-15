const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
const TOKEN_KEY = "thean_super_admin_access_token";
const DEFAULT_TIMEOUT_MS = 15_000; // 15 s — prevents requests hanging forever

/**
 * Super-admin delivery token — MUST be set via VITE_SUPER_ADMIN_TOKEN in .env.local.
 * The token is intentionally not bundled as a fallback string; if the env var is
 * missing the delivery admin API calls will return 401 from the server.
 */
const SUPER_ADMIN_TOKEN = import.meta.env.VITE_SUPER_ADMIN_TOKEN || "";
if (!SUPER_ADMIN_TOKEN && import.meta.env.DEV) {
  console.warn(
    "[super-admin] VITE_SUPER_ADMIN_TOKEN is not set. " +
    "Delivery admin API calls will fail. Add it to .env.local.",
  );
}

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
  // Persist role so all pages can read it without an extra /me call
  if (response.admin?.role) {
    window.localStorage.setItem("thean_super_admin_role", response.admin.role);
  }
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

export function getPharmacyOrderStatusBuckets() {
  const token = getToken();
  if (!token) return Promise.reject(new Error("Please login to continue."));
  return request("/super-admin/pharmacy/orders/status-buckets", {
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

  return {
    Authorization: `Bearer ${token}`,
    "x-super-admin-token": SUPER_ADMIN_TOKEN,
  };
}

function deliveryRequest(path, options = {}) {
  return request(path, { ...options, headers: { ...deliveryAdminHeaders(), ...(options.headers || {}) } });
}

export function listDeliveryAccounts() {
  return deliveryRequest("/delivery/admin/accounts?x_super_admin_token=" + encodeURIComponent(
    SUPER_ADMIN_TOKEN
  ));
}

export function setDeliveryAccountStatus(accountId, newStatus) {
  const tok = SUPER_ADMIN_TOKEN;
  return deliveryRequest(
    `/delivery/admin/accounts/${accountId}/status?new_status=${encodeURIComponent(newStatus)}&x_super_admin_token=${encodeURIComponent(tok)}`,
    { method: "POST" }
  );
}

export function listDeliveryOrders() {
  const tok = SUPER_ADMIN_TOKEN;
  return deliveryRequest(`/delivery/admin/orders?x_super_admin_token=${encodeURIComponent(tok)}`);
}

export function clearDeliveryCod(accountId, payload) {
  const tok = SUPER_ADMIN_TOKEN;
  return deliveryRequest(
    `/delivery/admin/cod-clear/${accountId}?x_super_admin_token=${encodeURIComponent(tok)}`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function getDeliveryRate() {
  return deliveryRequest("/delivery/config/rate");
}

export function getDeliveryRateHistory() {
  const tok = SUPER_ADMIN_TOKEN;
  return deliveryRequest(`/delivery/config/rate/history?x_super_admin_token=${encodeURIComponent(tok)}`);
}

export function setDeliveryRate(payload) {
  const tok = SUPER_ADMIN_TOKEN;
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

// Alias kept for readability in the auto-assign functions below
const _ST = () => SUPER_ADMIN_TOKEN;

export function listUnassignedOrders() {
  return deliveryRequest(`/delivery/admin/unassigned-orders?x_super_admin_token=${encodeURIComponent(_ST())}`);
}

export function getActiveDeliveryLocations() {
  return deliveryRequest(`/delivery/admin/active-locations?x_super_admin_token=${encodeURIComponent(_ST())}`);
}

export function getDeliveryLocationTrail(deliveryOrderId) {
  return deliveryRequest(`/delivery/orders/${deliveryOrderId}/location-trail?x_super_admin_token=${encodeURIComponent(_ST())}`);
}

export function triggerAutoAssign(payload) {
  return deliveryRequest(`/delivery/admin/auto-assign?x_super_admin_token=${encodeURIComponent(_ST())}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Admin management (SUPER only) ─────────────────────────────────────────────

export function listAdmins() {
  const token = getToken();
  return request("/super-admin/admins", { headers: { Authorization: `Bearer ${token}` } });
}

export function createAdmin(payload) {
  const token = getToken();
  return request("/super-admin/admins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function changeAdminRole(adminId, role) {
  const token = getToken();
  return request(`/super-admin/admins/${adminId}/role`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
}

export function deactivateAdmin(adminId, reason) {
  const token = getToken();
  return request(`/super-admin/admins/${adminId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
}

// ── Approvals ──────────────────────────────────────────────────────────────────

export function listApprovals({ status, request_type, limit = 50, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (request_type) params.set("request_type", request_type);
  params.set("limit", limit);
  params.set("offset", offset);
  return request(`/approvals?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function getApproval(requestId) {
  const token = getToken();
  return request(`/approvals/${requestId}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function reviewApprovalLine(requestId, lineId, decision, rejectionReason) {
  const token = getToken();
  return request(`/approvals/${requestId}/lines/${lineId}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision, rejection_reason: rejectionReason || null }),
  });
}

export function correctApproval(requestId, correctedPayload, correctionComment) {
  const token = getToken();
  return request(`/approvals/${requestId}/correct`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ corrected_payload: correctedPayload, correction_comment: correctionComment }),
  });
}

export function cancelApproval(requestId, reason) {
  const token = getToken();
  return request(`/approvals/${requestId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
}

export function getMyNotifications({ unreadOnly = false, limit = 30 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit });
  if (unreadOnly) params.set("unread_only", "true");
  return request(`/approvals/notifications/me?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function markNotificationRead(notificationId) {
  const token = getToken();
  return request(`/approvals/notifications/${notificationId}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Settlement ─────────────────────────────────────────────────────────────────

export function listSettlementCycles({ status, limit = 30, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit, offset });
  if (status) params.set("status", status);
  return request(`/settlement/cycles?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function createSettlementCycle({ cycle_date, cycle_type = "DAILY", notes }) {
  const token = getToken();
  const params = new URLSearchParams({ cycle_date, cycle_type });
  if (notes) params.set("notes", notes);
  return request(`/settlement/cycles?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getSettlementCycle(cycleId) {
  const token = getToken();
  return request(`/settlement/cycles/${cycleId}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function listSettlementBatches({ cycleId, stakeholderType, status, limit = 50, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit, offset });
  if (cycleId)         params.set("cycle_id", cycleId);
  if (stakeholderType) params.set("stakeholder_type", stakeholderType);
  if (status)          params.set("status", status);
  return request(`/settlement/batches?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function getSettlementBatch(batchId) {
  const token = getToken();
  return request(`/settlement/batches/${batchId}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function submitSettlementBatch(batchId) {
  const token = getToken();
  return request(`/settlement/batches/${batchId}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function executeSettlementBatch(batchId) {
  const token = getToken();
  return request(`/settlement/batches/${batchId}/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getStakeholderLedger(stakeholderType, stakeholderId, { dateFrom, dateTo, limit = 100, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit, offset });
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo)   params.set("date_to", dateTo);
  return request(`/settlement/ledger/${stakeholderType}/${stakeholderId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listPaymentProofs(batchId) {
  const token = getToken();
  return request(`/settlement/batches/${batchId}/proofs`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function uploadPaymentProof(batchId, { proof_type, amount, payment_method, notes, file }) {
  const token = getToken();
  const form  = new FormData();
  form.append("proof_type",     proof_type);
  form.append("amount",         amount);
  form.append("payment_method", payment_method);
  if (notes) form.append("notes", notes);
  if (file)  form.append("file", file);

  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${API_BASE_URL}/settlement/batches/${batchId}/proofs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Upload failed.");
    return payload;
  } finally {
    clearTimeout(timerId);
  }
}

export function verifyPaymentProof(proofId) {
  const token = getToken();
  return request(`/settlement/proofs/${proofId}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Disputes ───────────────────────────────────────────────────────────────────

export function getDisputeOverview() {
  const token = getToken();
  return request("/disputes/overview", { headers: { Authorization: `Bearer ${token}` } });
}

export function listDisputes({ status, raised_by_app, dispute_type, limit = 50, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit, offset });
  if (status)        params.set("status", status);
  if (raised_by_app) params.set("raised_by_app", raised_by_app);
  if (dispute_type)  params.set("dispute_type", dispute_type);
  return request(`/disputes?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function getDispute(disputeId) {
  const token = getToken();
  return request(`/disputes/${disputeId}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function resolveDispute(disputeId, resolutionNotes) {
  const token = getToken();
  return request(`/disputes/${disputeId}/resolve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resolution_notes: resolutionNotes }),
  });
}

export function assignDisputeAdmin(disputeId, assigneeId) {
  const token = getToken();
  return request(`/disputes/${disputeId}/assign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ assignee_id: assigneeId }),
  });
}

export async function addDisputeReply(disputeId, { text_content, voice_file, image_file, attachment_file, is_internal = false }) {
  const token = getToken();
  const form  = new FormData();
  if (text_content)    form.append("text_content", text_content);
  if (is_internal)     form.append("is_internal", "true");
  if (voice_file)      form.append("voice_file", voice_file);
  if (image_file)      form.append("image_file", image_file);
  if (attachment_file) form.append("attachment_file", attachment_file);

  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${API_BASE_URL}/disputes/${disputeId}/reply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Failed to send reply.");
    return payload;
  } finally {
    clearTimeout(timerId);
  }
}

// ── Reconciliation ─────────────────────────────────────────────────────────────

export function getReconciliationOverview() {
  const token = getToken();
  return request("/reconciliation/overview", { headers: { Authorization: `Bearer ${token}` } });
}

export function listReconciliationExceptions({ status, severity, exception_type, limit = 50, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit, offset });
  if (status)         params.set("status", status);
  if (severity)       params.set("severity", severity);
  if (exception_type) params.set("exception_type", exception_type);
  return request(`/reconciliation/exceptions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function getReconciliationException(exceptionId) {
  const token = getToken();
  return request(`/reconciliation/exceptions/${exceptionId}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function assignReconciliationException(exceptionId, assigneeId) {
  const token = getToken();
  return request(`/reconciliation/exceptions/${exceptionId}/assign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ assignee_id: assigneeId }),
  });
}

export function escalateReconciliationException(exceptionId) {
  const token = getToken();
  return request(`/reconciliation/exceptions/${exceptionId}/escalate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function resolveReconciliationException(exceptionId, resolutionNotes) {
  const token = getToken();
  return request(`/reconciliation/exceptions/${exceptionId}/resolve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resolution_notes: resolutionNotes }),
  });
}

export function listReconciliationMatches({ batchId, status, matchType, limit = 50, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit, offset });
  if (batchId)   params.set("batch_id", batchId);
  if (status)    params.set("status", status);
  if (matchType) params.set("match_type", matchType);
  return request(`/reconciliation/matches?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function runReconciliationMatch(batchId) {
  const token = getToken();
  return request(`/reconciliation/match/${batchId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Audit log (SUPER + SUPERVISOR only) ────────────────────────────────────────

export function getAuditLogs({ dateFrom, dateTo, role, actionType, success, limit = 100, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams();
  if (dateFrom)    params.set("date_from", dateFrom);
  if (dateTo)      params.set("date_to", dateTo);
  if (role)        params.set("role", role);
  if (actionType)  params.set("action_type", actionType);
  if (success !== undefined && success !== "") params.set("success", success);
  params.set("limit", limit);
  params.set("offset", offset);
  return request(`/super-admin/audit-logs?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}

// ── Order Disputes (admin board) ──────────────────────────────────────────────
export function getDisputeSummary() {
  const token = getToken();
  return request("/disputes/summary", { headers: { Authorization: `Bearer ${token}` } });
}
export function listAdminDisputes({ raised_by_app, sector, status, limit = 100, offset = 0 } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ limit, offset });
  if (raised_by_app) params.set("raised_by_app", raised_by_app);
  if (sector) params.set("sector", sector);
  if (status) params.set("status", status);
  return request(`/disputes?${params}`, { headers: { Authorization: `Bearer ${token}` } });
}
export function closeDispute(disputeId, resolutionNotes) {
  const token = getToken();
  return request(`/disputes/${disputeId}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resolution_notes: resolutionNotes }),
  });
}
export async function addAdminDisputeReply(disputeId, { text_content, voice_file, image_file, attachment_file, is_internal = false }) {
  const token = getToken();
  const fd = new FormData();
  if (text_content) fd.append("text_content", text_content);
  if (is_internal) fd.append("is_internal", "true");
  if (voice_file) fd.append("voice_file", voice_file);
  if (image_file) fd.append("image_file", image_file);
  if (attachment_file) fd.append("attachment_file", attachment_file);
  const resp = await fetch(`${API_BASE_URL}/disputes/${disputeId}/reply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (resp.status === 401) { window.localStorage.removeItem(TOKEN_KEY); window.location.href = "/login"; throw new Error("Session expired."); }
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(payload.detail || "Failed to send reply.");
  return payload;
}
