import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  LogOut,
  Download,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";

import {
  adminGetPharmacyScheduleStatus,
  getCurrentAdmin,
  getPharmacyAvailabilityEvents,
  getPharmacyTimeline,
  listPharmacies,
  logoutAdmin,
  updatePharmacyDetails,
  updatePharmacyStatus,
} from "../lib/api.js";
import { DEFAULT_PAGE_SIZE, exportRowsToExcel, getPageCount, pageLabel, paginate } from "../lib/listingUtils.js";

function createEditForm(pharmacy) {
  return {
    owner_name: pharmacy.owner_name || "",
    phone_number: pharmacy.phone_number || "",
    email: pharmacy.email || "",
    store_name: pharmacy.profile.store_name || "",
    license_number: pharmacy.profile.license_number || "",
    address_line_1: pharmacy.profile.address_line_1 || "",
    city: pharmacy.profile.city || "",
    state: pharmacy.profile.state || "",
    pincode: pharmacy.profile.pincode || "",
    latitude: pharmacy.profile.latitude ?? "",
    longitude: pharmacy.profile.longitude ?? "",
    product_commission_percent: pharmacy.profile.product_commission_percent || "0",
    prescription_commission_percent: pharmacy.profile.prescription_commission_percent || "0",
    platform_fee: pharmacy.profile.platform_fee || "0",
  };
}

export function PharmacyDashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [scheduleStatus, setScheduleStatus] = useState(null);
  const [targetStatus, setTargetStatus] = useState(null);
  const [comment, setComment] = useState("");
  const [timeline, setTimeline] = useState([]);
  const [availabilityEvents, setAvailabilityEvents] = useState([]);
  const [availabilityFilters, setAvailabilityFilters] = useState({ dateFrom: "", dateTo: "" });
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [pharmacyPage, setPharmacyPage] = useState(1);
  const [timelinePage, setTimelinePage] = useState(1);
  const [availabilityPage, setAvailabilityPage] = useState(1);

  const pendingCount = useMemo(
    () => pharmacies.filter((pharmacy) => pharmacy.activation_status === "PENDING_SUPER_ADMIN_APPROVAL").length,
    [pharmacies],
  );
  const inactiveCount = useMemo(
    () => pharmacies.filter((pharmacy) => pharmacy.activation_status === "INACTIVE").length,
    [pharmacies],
  );
  const pagedPharmacies = useMemo(
    () => paginate(pharmacies, pharmacyPage, DEFAULT_PAGE_SIZE),
    [pharmacies, pharmacyPage],
  );
  const pharmacyPageCount = getPageCount(pharmacies, DEFAULT_PAGE_SIZE);
  const pagedTimeline = useMemo(
    () => paginate(timeline, timelinePage, DEFAULT_PAGE_SIZE),
    [timeline, timelinePage],
  );
  const timelinePageCount = getPageCount(timeline, DEFAULT_PAGE_SIZE);
  const pagedAvailabilityEvents = useMemo(
    () => paginate(availabilityEvents, availabilityPage, DEFAULT_PAGE_SIZE),
    [availabilityEvents, availabilityPage],
  );
  const availabilityPageCount = getPageCount(availabilityEvents, DEFAULT_PAGE_SIZE);

  async function loadData() {
    setError("");
    setIsLoading(true);

    try {
      const [adminProfile, pharmacyList] = await Promise.all([
        getCurrentAdmin(),
        listPharmacies(),
      ]);
      setAdmin(adminProfile);
      setPharmacies(pharmacyList);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function selectPharmacy(pharmacy, nextStatus = null) {
    setError("");
    setSelectedPharmacy(pharmacy);
    setTargetStatus(nextStatus);
    setComment("");
    setEditForm(createEditForm(pharmacy));
    setEditMessage("");
    setTimelinePage(1);
    setAvailabilityPage(1);
    setIsTimelineLoading(true);
    setIsAvailabilityLoading(true);

    try {
      const [events, availabilityHistory, schedule] = await Promise.all([
        getPharmacyTimeline(pharmacy.account_id),
        getPharmacyAvailabilityEvents(pharmacy.account_id, availabilityFilters),
        adminGetPharmacyScheduleStatus(pharmacy.account_id).catch(() => null),
      ]);
      setTimeline(events);
      setAvailabilityEvents(availabilityHistory);
      setScheduleStatus(schedule);
    } catch (requestError) {
      setError(requestError.message);
      setTimeline([]);
      setAvailabilityEvents([]);
      setScheduleStatus(null);
    } finally {
      setIsTimelineLoading(false);
      setIsAvailabilityLoading(false);
    }
  }

  async function loadAvailabilityEvents(
    accountId = selectedPharmacy?.account_id,
    filters = availabilityFilters,
  ) {
    if (!accountId) return;
    setIsAvailabilityLoading(true);
    try {
      const events = await getPharmacyAvailabilityEvents(accountId, filters);
      setAvailabilityEvents(events);
      setAvailabilityPage(1);
    } catch (requestError) {
      setError(requestError.message);
      setAvailabilityEvents([]);
    } finally {
      setIsAvailabilityLoading(false);
    }
  }

  function updateEditField(event) {
    setEditForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitPharmacyDetails(event) {
    event.preventDefault();
    setError("");
    setEditMessage("");

    if (!selectedPharmacy || !editForm) {
      setError("Select a pharmacy first.");
      return;
    }

    setIsSavingDetails(true);
    try {
      const updated = await updatePharmacyDetails(selectedPharmacy.account_id, {
        ...editForm,
        email: editForm.email || null,
        city: editForm.city || null,
        state: editForm.state || null,
        pincode: editForm.pincode || null,
        latitude: editForm.latitude === "" ? null : Number(editForm.latitude),
        longitude: editForm.longitude === "" ? null : Number(editForm.longitude),
        product_commission_percent: Number(editForm.product_commission_percent),
        prescription_commission_percent: Number(editForm.prescription_commission_percent),
        platform_fee: Number(editForm.platform_fee),
      });
      setPharmacies((current) =>
        current.map((pharmacy) =>
          pharmacy.account_id === selectedPharmacy.account_id ? updated : pharmacy,
        ),
      );
      setSelectedPharmacy(updated);
      setEditForm(createEditForm(updated));
      setEditMessage("Pharmacy details updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function submitStatusChange(event) {
    event.preventDefault();
    setError("");

    if (!selectedPharmacy || targetStatus === null) {
      setError("Select Activate or Deactivate first.");
      return;
    }

    if (comment.trim().length < 3) {
      setError("Comment is mandatory for status changes.");
      return;
    }

    setIsUpdatingStatus(true);

    try {
      const updated = await updatePharmacyStatus(
        selectedPharmacy.account_id,
        targetStatus,
        comment.trim(),
      );
      setPharmacies((current) =>
        current.map((pharmacy) =>
          pharmacy.account_id === selectedPharmacy.account_id ? updated : pharmacy,
        ),
      );
      setSelectedPharmacy(updated);
      setComment("");
      setTargetStatus(null);
      const events = await getPharmacyTimeline(updated.account_id);
      setTimeline(events);
      setTimelinePage(1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  function logout() {
    logoutAdmin();
    navigate("/login");
  }

  function exportPharmacies() {
    exportRowsToExcel(
      "thean-pharmacies.xls",
      "Pharmacies",
      [
        { label: "Store name", value: (pharmacy) => pharmacy.profile.store_name },
        { label: "Owner", value: (pharmacy) => pharmacy.owner_name },
        { label: "Phone", value: (pharmacy) => pharmacy.phone_number },
        { label: "Email", value: (pharmacy) => pharmacy.email || "" },
        { label: "License", value: (pharmacy) => pharmacy.profile.license_number },
        { label: "City", value: (pharmacy) => pharmacy.profile.city || "" },
        { label: "Pincode", value: (pharmacy) => pharmacy.profile.pincode || "" },
        { label: "Activation status", value: (pharmacy) => pharmacy.activation_status },
        { label: "Order availability", value: (pharmacy) => pharmacy.profile.is_online ? "Online" : "Offline" },
        { label: "Listed", value: (pharmacy) => pharmacy.profile.is_listed ? "Yes" : "No" },
        { label: "Product commission %", value: (pharmacy) => pharmacy.profile.product_commission_percent },
        { label: "Prescription commission %", value: (pharmacy) => pharmacy.profile.prescription_commission_percent },
        { label: "Platform fee", value: (pharmacy) => pharmacy.profile.platform_fee },
      ],
      pharmacies,
    );
  }

  function exportTimeline() {
    if (!selectedPharmacy) return;
    exportRowsToExcel(
      "thean-pharmacy-status-timeline.xls",
      "Status Timeline",
      [
        { label: "Pharmacy", value: () => selectedPharmacy.profile.store_name },
        { label: "Status", value: (event) => event.status },
        { label: "Comment", value: (event) => event.comment },
        { label: "Changed by admin", value: (event) => event.changed_by_admin_id },
        { label: "Created", value: (event) => event.created_at },
      ],
      timeline,
    );
  }

  function exportAvailabilityEvents() {
    if (!selectedPharmacy) return;
    exportRowsToExcel(
      "thean-pharmacy-availability-history.xls",
      "Availability History",
      [
        { label: "Pharmacy", value: () => selectedPharmacy.profile.store_name },
        { label: "Availability", value: (event) => event.is_online ? "Online" : "Offline" },
        { label: "Actor type", value: (event) => event.actor_type },
        { label: "Actor ID", value: (event) => event.actor_id || "" },
        { label: "Comment", value: (event) => event.comment || "" },
        { label: "Created", value: (event) => event.created_at },
      ],
      availabilityEvents,
    );
  }

  if (isLoading) {
    return (
      <main className="page">
        <section className="panel loading-panel">
          <RefreshCw size={20} aria-hidden="true" />
          Loading pharmacy dashboard
        </section>
      </main>
    );
  }

  if (error && !admin) {
    return (
      <main className="page">
        <section className="panel">
          <div className="error">{error}</div>
          <button className="button" type="button" onClick={() => navigate("/login")}>
            Login again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="dashboard-header">
        <div>
          <button className="text-nav-button" type="button" onClick={() => navigate("/dashboard")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Sectors
          </button>
          <p className="eyebrow">Pharmacy sector</p>
          <h1>Pharmacy Dashboard</h1>
          <p>Approve pharmacy merchants and manage customer listing readiness.</p>
        </div>
        <div className="header-actions">
          <button className="outline-button" type="button" onClick={loadData}>
            <RefreshCw size={18} aria-hidden="true" />
            Refresh
          </button>
          <button className="outline-button" type="button" onClick={logout}>
            <LogOut size={18} aria-hidden="true" />
            Logout
          </button>
        </div>
      </header>

      <section className="metrics">
        <article className="metric-card">
          <Clock size={22} aria-hidden="true" />
          <div>
            <p>Pending pharmacies</p>
            <strong>{pendingCount}</strong>
          </div>
        </article>
        <article className="metric-card">
          <Clock size={22} aria-hidden="true" />
          <div>
            <p>Inactive pharmacies</p>
            <strong>{inactiveCount}</strong>
          </div>
        </article>
        <article className="metric-card">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <p>Total pharmacies</p>
            <strong>{pharmacies.length}</strong>
          </div>
        </article>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="quick-nav-links">
        <button
          className="outline-button"
          type="button"
          onClick={() => navigate("/dashboard/pharmacy/orders")}
        >
          <Clock size={16} aria-hidden="true" />
          Order Management
        </button>
        <button
          className="outline-button"
          type="button"
          onClick={() => navigate("/dashboard/pharmacy/products")}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Product Review
        </button>
        <button
          className="outline-button"
          type="button"
          onClick={() => navigate("/dashboard/pharmacy/substitution-audit")}
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          Substitution Audit
        </button>
        <button
          className="outline-button"
          type="button"
          onClick={() => navigate("/dashboard/pharmacy/vendor-approvals")}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Vendor Approvals
        </button>
      </section>

      <section className="table-panel">
        <div className="table-header">
          <h2>Pharmacy approvals</h2>
          <button className="outline-button button-small" type="button" onClick={exportPharmacies}>
            <Download size={16} aria-hidden="true" />
            Export Excel
          </button>
        </div>
        <div className="approval-layout">
          <div className="pharmacy-list">
            {pagedPharmacies.map((pharmacy) => (
              <article
                className={`pharmacy-row ${
                  selectedPharmacy?.account_id === pharmacy.account_id ? "pharmacy-row-selected" : ""
                }`}
                key={pharmacy.account_id}
              >
                <button
                  className="row-main-button"
                  type="button"
                  onClick={() => selectPharmacy(pharmacy)}
                >
                  <h3>{pharmacy.profile.store_name}</h3>
                  <p>{pharmacy.profile.license_number}</p>
                  <p>
                    {pharmacy.profile.address_line_1}
                    {pharmacy.profile.city ? `, ${pharmacy.profile.city}` : ""}
                  </p>
                  <p>{pharmacy.phone_number}</p>
                </button>
                <div className="row-actions">
                  <span className={pharmacy.is_active ? "badge badge-active" : "badge badge-pending"}>
                    {pharmacy.is_active ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                    {pharmacy.is_active ? "Active" : "Inactive"}
                  </span>
                  <span className={pharmacy.profile.is_online ? "badge badge-online" : "badge badge-offline"}>
                    {pharmacy.profile.is_online ? "Online" : "Offline"}
                  </span>
                  <button
                    className={pharmacy.is_active ? "danger-button button-small" : "button button-small"}
                    type="button"
                    onClick={() => selectPharmacy(pharmacy, !pharmacy.is_active)}
                  >
                    {pharmacy.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            ))}
            <div className="pagination-bar">
              <span>{pageLabel(pharmacyPage, pharmacies, DEFAULT_PAGE_SIZE)}</span>
              <div>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={pharmacyPage <= 1}
                  onClick={() => setPharmacyPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <strong>Page {Math.min(pharmacyPage, pharmacyPageCount)} of {pharmacyPageCount}</strong>
                <button
                  className="outline-button button-small"
                  type="button"
                  disabled={pharmacyPage >= pharmacyPageCount}
                  onClick={() => setPharmacyPage((page) => Math.min(pharmacyPageCount, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <aside className="timeline-panel">
            {selectedPharmacy ? (
              <>
                <div className="timeline-header">
                  <div>
                    <p className="eyebrow">Status controls</p>
                    <h2>{selectedPharmacy.profile.store_name}</h2>
                  </div>
                  <span
                    className={
                      selectedPharmacy.is_active ? "badge badge-active" : "badge badge-pending"
                    }
                  >
                    {selectedPharmacy.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <section className="availability-panel">
                  <div className="availability-summary">
                    <div>
                      <p className="eyebrow">Current order status</p>
                      <h3>{selectedPharmacy.profile.is_online ? "Online" : "Offline"}</h3>
                      <p>
                        {selectedPharmacy.profile.is_online
                          ? "This pharmacy is visible for recommendations and can receive new orders."
                          : "This pharmacy is hidden from recommendations and cannot receive new orders."}
                      </p>
                    </div>
                    <span className={selectedPharmacy.profile.is_online ? "badge badge-online" : "badge badge-offline"}>
                      {selectedPharmacy.profile.is_online ? "Online" : "Offline"}
                    </span>
                  </div>
                  {scheduleStatus && (
                    <div className="availability-summary">
                      <div>
                        <p className="eyebrow">Schedule</p>
                        <h3>
                          {scheduleStatus.mode === "AUTO" && "Auto (weekly schedule)"}
                          {scheduleStatus.mode === "MANUAL_OVERRIDE" && "Manual override"}
                          {scheduleStatus.mode === "NO_SCHEDULE" && "No schedule set"}
                          {scheduleStatus.mode === "HOLIDAY" && "Closed for holiday"}
                        </h3>
                        {scheduleStatus.message && <p>{scheduleStatus.message}</p>}
                      </div>
                      <span className={scheduleStatus.mode === "NO_SCHEDULE" ? "badge badge-pending" : "badge badge-active"}>
                        {scheduleStatus.mode.replace("_", " ")}
                      </span>
                    </div>
                  )}
                  <div className="availability-filters">
                    <label>
                      From
                      <input
                        type="date"
                        value={availabilityFilters.dateFrom}
                        onChange={(event) =>
                          setAvailabilityFilters((current) => ({ ...current, dateFrom: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={availabilityFilters.dateTo}
                        onChange={(event) =>
                          setAvailabilityFilters((current) => ({ ...current, dateTo: event.target.value }))
                        }
                      />
                    </label>
                    <button className="outline-button" type="button" onClick={() => loadAvailabilityEvents()}>
                      Filter
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        const clearedFilters = { dateFrom: "", dateTo: "" };
                        setAvailabilityFilters(clearedFilters);
                        loadAvailabilityEvents(selectedPharmacy.account_id, clearedFilters);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="availability-history">
                    <div className="list-section-heading">
                      <h3>Online / offline history</h3>
                      <button className="outline-button button-small" type="button" onClick={exportAvailabilityEvents}>
                        <Download size={16} aria-hidden="true" />
                        Export Excel
                      </button>
                    </div>
                    {isAvailabilityLoading ? (
                      <p>Loading availability history</p>
                    ) : availabilityEvents.length ? (
                      pagedAvailabilityEvents.map((event) => (
                        <article className="timeline-event" key={event.event_id}>
                          <span className={event.is_online ? "badge badge-online" : "badge badge-offline"}>
                            {event.is_online ? "Went online" : "Went offline"}
                          </span>
                          <p>{event.comment || (event.is_online ? "Pharmacy went online." : "Pharmacy went offline.")}</p>
                          <time>{new Date(event.created_at).toLocaleString()}</time>
                        </article>
                      ))
                    ) : (
                      <p>No online/offline changes recorded for this date range.</p>
                    )}
                    <div className="pagination-bar">
                      <span>{pageLabel(availabilityPage, availabilityEvents, DEFAULT_PAGE_SIZE)}</span>
                      <div>
                        <button
                          className="outline-button button-small"
                          type="button"
                          disabled={availabilityPage <= 1}
                          onClick={() => setAvailabilityPage((page) => Math.max(1, page - 1))}
                        >
                          Previous
                        </button>
                        <strong>Page {Math.min(availabilityPage, availabilityPageCount)} of {availabilityPageCount}</strong>
                        <button
                          className="outline-button button-small"
                          type="button"
                          disabled={availabilityPage >= availabilityPageCount}
                          onClick={() => setAvailabilityPage((page) => Math.min(availabilityPageCount, page + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {targetStatus !== null && (
                  <form className="status-form" onSubmit={submitStatusChange}>
                    <label>
                      Comment
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder={
                          targetStatus
                            ? "Reason for activation"
                            : "Reason for deactivation"
                        }
                        required
                      />
                    </label>
                    <button
                      className={targetStatus ? "button" : "danger-button"}
                      type="submit"
                      disabled={isUpdatingStatus}
                    >
                      {isUpdatingStatus
                        ? "Saving"
                        : targetStatus
                          ? "Confirm activation"
                          : "Confirm deactivation"}
                    </button>
                  </form>
                )}

                {editForm && (
                  <form className="admin-edit-form" onSubmit={submitPharmacyDetails}>
                    <div className="form-section-title">
                      <h3>Pharmacy details</h3>
                      <p>Portal admin can edit merchant profile and commercial settings.</p>
                    </div>
                    <label>
                      Store name
                      <input
                        name="store_name"
                        value={editForm.store_name}
                        onChange={updateEditField}
                        required
                      />
                    </label>
                    <div className="inline-fields">
                      <label>
                        Owner name
                        <input
                          name="owner_name"
                          value={editForm.owner_name}
                          onChange={updateEditField}
                          required
                        />
                      </label>
                      <label>
                        Phone
                        <input
                          name="phone_number"
                          value={editForm.phone_number}
                          onChange={updateEditField}
                          required
                        />
                      </label>
                    </div>
                    <div className="inline-fields">
                      <label>
                        Email
                        <input name="email" value={editForm.email} onChange={updateEditField} />
                      </label>
                      <label>
                        License
                        <input
                          name="license_number"
                          value={editForm.license_number}
                          onChange={updateEditField}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Address
                      <textarea
                        name="address_line_1"
                        value={editForm.address_line_1}
                        onChange={updateEditField}
                        required
                      />
                    </label>
                    <div className="inline-fields inline-fields-three">
                      <label>
                        City
                        <input name="city" value={editForm.city} onChange={updateEditField} />
                      </label>
                      <label>
                        State
                        <input name="state" value={editForm.state} onChange={updateEditField} />
                      </label>
                      <label>
                        Pincode
                        <input name="pincode" value={editForm.pincode} onChange={updateEditField} />
                      </label>
                    </div>
                    <div className="inline-fields">
                      <label>
                        Latitude
                        <input
                          name="latitude"
                          value={editForm.latitude}
                          onChange={updateEditField}
                          type="number"
                          step="0.000001"
                        />
                      </label>
                      <label>
                        Longitude
                        <input
                          name="longitude"
                          value={editForm.longitude}
                          onChange={updateEditField}
                          type="number"
                          step="0.000001"
                        />
                      </label>
                    </div>
                    <div className="form-section-title">
                      <h3>Commercial settings</h3>
                      <p>These values are controlled only from Super Admin.</p>
                    </div>
                    <div className="inline-fields inline-fields-three">
                      <label>
                        Product commission %
                        <input
                          name="product_commission_percent"
                          value={editForm.product_commission_percent}
                          onChange={updateEditField}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          required
                        />
                      </label>
                      <label>
                        Prescription commission %
                        <input
                          name="prescription_commission_percent"
                          value={editForm.prescription_commission_percent}
                          onChange={updateEditField}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          required
                        />
                      </label>
                      <label>
                        Platform fee
                        <input
                          name="platform_fee"
                          value={editForm.platform_fee}
                          onChange={updateEditField}
                          type="number"
                          min="0"
                          step="0.01"
                          required
                        />
                      </label>
                    </div>
                    {editMessage && <div className="success">{editMessage}</div>}
                    <button className="button" type="submit" disabled={isSavingDetails}>
                      <Save size={18} aria-hidden="true" />
                      {isSavingDetails ? "Saving" : "Save pharmacy details"}
                    </button>
                  </form>
                )}

                <div className="timeline-list">
                  <div className="list-section-heading">
                    <h3>Timeline</h3>
                    <button className="outline-button button-small" type="button" onClick={exportTimeline}>
                      <Download size={16} aria-hidden="true" />
                      Export Excel
                    </button>
                  </div>
                  {isTimelineLoading ? (
                    <p>Loading timeline</p>
                  ) : timeline.length ? (
                    pagedTimeline.map((event) => (
                      <article className="timeline-event" key={event.event_id}>
                        <span
                          className={
                            event.status === "ACTIVE"
                              ? "badge badge-active"
                              : "badge badge-pending"
                          }
                        >
                          {event.status === "ACTIVE" ? "Activated" : "Disabled"}
                        </span>
                        <p>{event.comment}</p>
                        <time>{new Date(event.created_at).toLocaleString()}</time>
                      </article>
                    ))
                  ) : (
                    <p>No status changes recorded yet.</p>
                  )}
                  <div className="pagination-bar">
                    <span>{pageLabel(timelinePage, timeline, DEFAULT_PAGE_SIZE)}</span>
                    <div>
                      <button
                        className="outline-button button-small"
                        type="button"
                        disabled={timelinePage <= 1}
                        onClick={() => setTimelinePage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      <strong>Page {Math.min(timelinePage, timelinePageCount)} of {timelinePageCount}</strong>
                      <button
                        className="outline-button button-small"
                        type="button"
                        disabled={timelinePage >= timelinePageCount}
                        onClick={() => setTimelinePage((page) => Math.min(timelinePageCount, page + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="timeline-empty">
                <Clock size={22} aria-hidden="true" />
                <p>Select a pharmacy to view timeline and change active status.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
