import { useEffect, useState } from "react";
import { AlertTriangle, Calendar, Clock, Edit2, Plus, Trash2, X } from "lucide-react";
import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import {
  getOperatingHours,
  setOperatingHours,
  clearOperatingHours,
  getHolidays,
  addHoliday,
  removeHoliday,
  getPharmacyScheduleStatus,
} from "../lib/api.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DEFAULT_HOURS = DAYS.map((_, i) => ({
  day_of_week: i,
  open_time: "09:00",
  close_time: "21:00",
  is_closed: i === 6,
}));

function pad(n) { return String(n).padStart(2, "0"); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

const MODE_META = {
  AUTO:            { label: "Auto-schedule active",              cls: "auto" },
  MANUAL_OVERRIDE: { label: "Manual override — auto paused",    cls: "manual" },
  NO_SCHEDULE:     { label: "No schedule set",                   cls: "no_schedule" },
  HOLIDAY:         { label: "Holiday today — offline",           cls: "holiday" },
};

export function SchedulePage() {
  const [scheduleStatus, setScheduleStatus] = useState(null);
  const [savedHours, setSavedHours] = useState(null);   // null = not loaded yet
  const [hours, setHours] = useState(DEFAULT_HOURS);    // edit buffer
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [holidays, setHolidays] = useState([]);
  const [isLoadingHours, setIsLoadingHours] = useState(true);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [isClearingSchedule, setIsClearingSchedule] = useState(false);
  const [hoursError, setHoursError] = useState("");
  const [hoursSuccess, setHoursSuccess] = useState("");
  const [holidayError, setHolidayError] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayReason, setNewHolidayReason] = useState("");
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setIsLoadingHours(true);
    setIsLoadingHolidays(true);

    getPharmacyScheduleStatus().then(setScheduleStatus).catch(() => {});

    getOperatingHours()
      .then((rows) => {
        if (rows && rows.length > 0) {
          const filled = DEFAULT_HOURS.map((def) => {
            const saved = rows.find((r) => r.day_of_week === def.day_of_week);
            return saved
              ? { day_of_week: saved.day_of_week, open_time: saved.open_time.slice(0, 5), close_time: saved.close_time.slice(0, 5), is_closed: saved.is_closed }
              : def;
          });
          setSavedHours(filled);
          setHours(filled);
        } else {
          setSavedHours([]);
        }
      })
      .catch(() => { setSavedHours([]); })
      .finally(() => setIsLoadingHours(false));

    getHolidays()
      .then((data) => setHolidays(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setIsLoadingHolidays(false));
  }

  function startEditHours() {
    setHours(savedHours && savedHours.length > 0 ? savedHours : DEFAULT_HOURS);
    setHoursError("");
    setHoursSuccess("");
    setIsEditingHours(true);
  }

  function cancelEditHours() {
    setHours(savedHours && savedHours.length > 0 ? savedHours : DEFAULT_HOURS);
    setHoursError("");
    setIsEditingHours(false);
  }

  function updateDay(index, field, value) {
    setHours((prev) => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  }

  async function saveHours() {
    setHoursError("");
    setHoursSuccess("");
    for (const d of hours) {
      if (!d.is_closed && d.open_time >= d.close_time) {
        setHoursError(`${DAYS[d.day_of_week]}: close time must be after open time.`);
        return;
      }
    }
    setIsSavingHours(true);
    try {
      await setOperatingHours(hours);
      setSavedHours(hours);
      setIsEditingHours(false);
      setHoursSuccess("Schedule saved. Auto-schedule is now active.");
      getPharmacyScheduleStatus().then(setScheduleStatus).catch(() => {});
    } catch (e) {
      setHoursError(e.message);
    } finally {
      setIsSavingHours(false);
    }
  }

  async function handleClearSchedule() {
    if (!window.confirm("Remove auto-schedule? Your pharmacy will stay at its current online/offline state until you set a new schedule.")) return;
    setIsClearingSchedule(true);
    try {
      await clearOperatingHours();
      setSavedHours([]);
      setHours(DEFAULT_HOURS);
      setIsEditingHours(false);
      setHoursSuccess("Schedule cleared. Pharmacy will not auto-toggle.");
      getPharmacyScheduleStatus().then(setScheduleStatus).catch(() => {});
    } catch (e) {
      setHoursError(e.message);
    } finally {
      setIsClearingSchedule(false);
    }
  }

  async function handleAddHoliday(e) {
    e.preventDefault();
    setHolidayError("");
    if (!newHolidayDate) { setHolidayError("Select a date."); return; }
    if (newHolidayDate < todayStr()) { setHolidayError("Holiday date must be today or in the future."); return; }
    setIsAddingHoliday(true);
    try {
      const h = await addHoliday(newHolidayDate, newHolidayReason.trim() || undefined);
      setHolidays((prev) => [...prev, h].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
      setNewHolidayDate("");
      setNewHolidayReason("");
    } catch (e) {
      setHolidayError(e.message);
    } finally {
      setIsAddingHoliday(false);
    }
  }

  async function handleRemoveHoliday(holidayId) {
    try {
      await removeHoliday(holidayId);
      setHolidays((prev) => prev.filter((h) => h.holiday_id !== holidayId));
    } catch (e) {
      setHolidayError(e.message);
    }
  }

  const hasSchedule = savedHours && savedHours.length > 0;
  const mode = scheduleStatus?.mode;
  const modeMeta = MODE_META[mode] || {};

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <p className="eyebrow">Availability</p>
          <h1>Schedule</h1>
          <p>Set weekly operating hours and mark holidays. The system will auto-toggle your pharmacy online and offline.</p>
        </div>
      </header>

      {/* Status banner */}
      {scheduleStatus && (
        <div className={`schedule-status-banner schedule-status-${modeMeta.cls || "auto"}`}>
          <Clock size={16} />
          <span>{modeMeta.label || mode}</span>
          {scheduleStatus.message && <span className="schedule-status-detail">— {scheduleStatus.message}</span>}
        </div>
      )}

      {/* ── Operating hours panel ── */}
      <section className="panel" style={{ marginBottom: "1.25rem" }}>
        <div className="schedule-panel-header">
          <h2><Clock size={17} style={{ verticalAlign: "middle", marginRight: 6 }} />Weekly Operating Hours</h2>
          {!isEditingHours && !isLoadingHours && (
            <button className="outline-button button-small" type="button" onClick={startEditHours}>
              <Edit2 size={14} /> Edit hours
            </button>
          )}
          {isEditingHours && (
            <button className="icon-button" type="button" onClick={cancelEditHours} title="Cancel">
              <X size={18} />
            </button>
          )}
        </div>

        {hoursError && <div className="error">{hoursError}</div>}
        {hoursSuccess && <div className="success">{hoursSuccess}</div>}

        {isLoadingHours ? (
          <p className="field-help">Loading…</p>
        ) : !isEditingHours ? (
          /* ── View mode ── */
          hasSchedule ? (
            <ul className="schedule-view-list">
              {savedHours.map((day, i) => (
                <li key={i} className={`schedule-view-row${day.is_closed ? " schedule-view-row-closed" : ""}`}>
                  <span className="schedule-view-day">{DAYS[i]}</span>
                  {day.is_closed
                    ? <span className="schedule-view-closed-tag">Closed</span>
                    : <span className="schedule-view-times">
                        <span className="schedule-view-time">{fmt12(day.open_time)}</span>
                        <span className="schedule-view-sep">–</span>
                        <span className="schedule-view-time">{fmt12(day.close_time)}</span>
                      </span>
                  }
                </li>
              ))}
            </ul>
          ) : (
            <div className="schedule-empty-state">
              <Clock size={32} color="#d1d5db" />
              <p>No schedule set yet.</p>
              <button className="button button-small" type="button" onClick={startEditHours}>
                Set operating hours
              </button>
            </div>
          )
        ) : (
          /* ── Edit mode ── */
          <>
            <p className="field-help" style={{ marginBottom: "1rem" }}>
              Check a day to mark it open and set its hours.
            </p>
            <div className="schedule-days-grid">
              {hours.map((day, i) => (
                <div key={i} className={`schedule-day-row${day.is_closed ? " schedule-day-closed" : ""}`}>
                  <label className="schedule-day-label">
                    <input
                      type="checkbox"
                      checked={!day.is_closed}
                      onChange={(e) => updateDay(i, "is_closed", !e.target.checked)}
                    />
                    <span>{DAYS[i]}</span>
                  </label>
                  {day.is_closed ? (
                    <span className="schedule-closed-tag">Closed</span>
                  ) : (
                    <div className="schedule-time-inputs">
                      <input type="time" className="schedule-time-input" value={day.open_time}
                        onChange={(e) => updateDay(i, "open_time", e.target.value)} />
                      <span className="schedule-time-sep">to</span>
                      <input type="time" className="schedule-time-input" value={day.close_time}
                        onChange={(e) => updateDay(i, "close_time", e.target.value)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "1.25rem", flexWrap: "wrap" }}>
              <button className="button" type="button" onClick={saveHours} disabled={isSavingHours}>
                {isSavingHours ? "Saving…" : "Save Schedule"}
              </button>
              <button className="outline-button" type="button" onClick={cancelEditHours} disabled={isSavingHours}>
                Cancel
              </button>
              {hasSchedule && (
                <button className="outline-button" type="button" onClick={handleClearSchedule}
                  disabled={isClearingSchedule} style={{ marginLeft: "auto", color: "#dc2626", borderColor: "#fca5a5" }}>
                  {isClearingSchedule ? "Clearing…" : "Clear Schedule"}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Holiday calendar ── */}
      <section className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2><Calendar size={17} style={{ verticalAlign: "middle", marginRight: 6 }} />Holiday Calendar</h2>
        <p className="field-help" style={{ marginBottom: "1rem" }}>
          Your pharmacy stays offline the full day on any holiday, regardless of operating hours.
        </p>

        {holidayError && <div className="error">{holidayError}</div>}

        <form className="schedule-holiday-form" onSubmit={handleAddHoliday}>
          <input type="date" className="schedule-date-input" value={newHolidayDate}
            min={todayStr()} onChange={(e) => setNewHolidayDate(e.target.value)} />
          <input type="text" className="schedule-reason-input" placeholder="Reason (optional)"
            value={newHolidayReason} onChange={(e) => setNewHolidayReason(e.target.value)} maxLength={120} />
          <button className="button button-small" type="submit" disabled={isAddingHoliday}>
            <Plus size={15} /> {isAddingHoliday ? "Adding…" : "Add Holiday"}
          </button>
        </form>

        {isLoadingHolidays ? (
          <p className="field-help">Loading holidays…</p>
        ) : holidays.length === 0 ? (
          <p className="field-help">No holidays scheduled.</p>
        ) : (
          <ul className="schedule-holiday-list">
            {holidays.map((h) => (
              <li key={h.holiday_id} className="schedule-holiday-item">
                <div>
                  <span className="schedule-holiday-date">
                    {new Date(h.holiday_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  {h.reason && <span className="schedule-holiday-reason">{h.reason}</span>}
                </div>
                <button type="button" className="schedule-holiday-remove" onClick={() => handleRemoveHoliday(h.holiday_id)} title="Remove">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="schedule-note">
        <AlertTriangle size={14} />
        <span>Auto-schedule runs every 15 minutes. There may be a short delay before your status updates.</span>
      </div>
    </PharmacyPageShell>
  );
}
