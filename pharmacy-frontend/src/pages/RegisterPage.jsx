import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, LocateFixed, ShieldAlert } from "lucide-react";

import { registerPharmacy } from "../lib/api.js";
import { validatePhone, validateEmail, validatePincode, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqOwner   = validateRequired("Owner name");
const reqStore   = validateRequired("Pharmacy name");
const reqLicense = validateRequired("License number");
const reqAddr    = validateRequired("Address");

const LOCATION_ACCURACY_THRESHOLD_M = 100;
const REGISTER_DRAFT_KEY = "thean_pharmacy_register_draft";

function loadDraft() {
  try {
    const saved = window.localStorage.getItem(REGISTER_DRAFT_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}
function saveDraft(form) {
  try { window.localStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(form)); } catch { /* ignore */ }
}
function clearDraft() {
  try { window.localStorage.removeItem(REGISTER_DRAFT_KEY); } catch { /* ignore */ }
}


export function RegisterPage() {
  const [hasDraft] = useState(() => {
    const draft = loadDraft();
    return draft !== null && Object.values(draft).some(v => typeof v === "string" && v.trim() !== "");
  });
  const [form, setForm] = useState(() => {
    const draft = loadDraft();
    return draft ?? {
      owner_name: "",
      phone_number: "",
      email: "",
      store_name: "",
      license_number: "",
      address_line_1: "",
      city: "",
      state: "",
      pincode: "",
    };
  });
  const [location, setLocation] = useState(null);
  const [storeImageFile, setStoreImageFile] = useState(null);
  const [drugLicenceFile, setDrugLicenceFile] = useState(null);
  const [ownerIdFile, setOwnerIdFile] = useState(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const storeImageInputRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [touched, setTouched] = useState({});

  // Persist form state to localStorage on every change so the user doesn't lose
  // their work if they navigate away or accidentally close the tab.
  useEffect(() => { saveDraft(form); }, [form]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  const errors = {
    owner_name:     touched.owner_name     ? reqOwner(form.owner_name)            : null,
    phone_number:   touched.phone_number   ? validatePhone(form.phone_number)     : null,
    email:          touched.email          ? validateEmail(form.email)            : null,
    store_name:     touched.store_name     ? reqStore(form.store_name)            : null,
    license_number: touched.license_number ? reqLicense(form.license_number)     : null,
    address_line_1: touched.address_line_1 ? reqAddr(form.address_line_1)        : null,
    pincode:        touched.pincode        ? (form.pincode ? validatePincode(form.pincode) : null) : null,
  };

  function captureLocation() {
    setError("");
    setIsLocating(true);
    if (!navigator.geolocation) {
      setIsLocating(false);
      setError("Location capture is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setIsLocating(false);
      },
      (geoError) => {
        setIsLocating(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Location permission denied. Please allow location access in your browser settings and try again.");
        } else if (geoError.code === geoError.TIMEOUT) {
          setError("Location capture timed out. Move to an area with better GPS signal and try again.");
        } else {
          setError("Could not capture location. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  // When accuracy is poor, first submit attempt surfaces a warning + override button.
  // User can recapture GPS or explicitly confirm they want to proceed anyway.
  const [showAccuracyOverride, setShowAccuracyOverride] = useState(false);

  async function submit(event, { overrideAccuracy = false } = {}) {
    if (event) event.preventDefault();
    setTouched({
      owner_name: true, phone_number: true, email: true,
      store_name: true, license_number: true, address_line_1: true, pincode: true,
    });
    if (
      reqOwner(form.owner_name) ||
      validatePhone(form.phone_number) ||
      validateEmail(form.email) ||
      reqStore(form.store_name) ||
      reqLicense(form.license_number) ||
      reqAddr(form.address_line_1) ||
      (form.pincode ? validatePincode(form.pincode) : null)
    ) return;

    setError("");
    setMessage("");

    if (!location) {
      setError("Please capture pharmacy location before registering.");
      return;
    }

    // Soft-block on poor GPS accuracy — surface the override prompt
    if (location.accuracy > LOCATION_ACCURACY_THRESHOLD_M && !overrideAccuracy) {
      setShowAccuracyOverride(true);
      return;
    }
    setShowAccuracyOverride(false);

    if (!storeImageFile) { setError("Please upload a store photo."); return; }
    if (!drugLicenceFile) { setError("Please upload the drug licence document."); return; }
    if (!ownerIdFile) { setError("Please upload owner ID / Aadhaar."); return; }

    setIsSubmitting(true);
    try {
      const response = await registerPharmacy(
        {
          ...form,
          phone_number: `+91${form.phone_number}`,
          email: form.email || null,
          city: form.city || null,
          state: form.state || null,
          pincode: form.pincode || null,
          latitude: location.latitude,
          longitude: location.longitude,
        },
        storeImageFile,
        drugLicenceFile,
        ownerIdFile,
      );
      clearDraft();
      setMessage(`${response.profile.store_name} registered. Status: pending super admin approval.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const locationAccuracyWarning =
    location?.accuracy && location.accuracy > LOCATION_ACCURACY_THRESHOLD_M
      ? `Location accuracy is ${Math.round(location.accuracy)} m — above the ${LOCATION_ACCURACY_THRESHOLD_M} m threshold. Move to a location with better GPS signal for a more precise pin.`
      : null;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (message) {
    return (
      <main className="page two-column">
        <section className="intro">
          <p className="eyebrow">Pharmacy onboarding</p>
          <h1>Register your pharmacy</h1>
          <p>
            New pharmacies are created inactive by default. Thean super admin approval is required
            before a pharmacy is listed for customers.
          </p>
        </section>
        <div className="panel register-success-panel" style={{ textAlign: "center", padding: "2.5rem 2rem" }}>
          <CheckCircle2 size={48} style={{ color: "var(--color-success, #16a34a)", marginBottom: "1rem" }} />
          <h2>Registration submitted!</h2>
          <p style={{ marginBottom: "1.5rem" }}>{message}</p>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>
            A Thean super admin will review your application. You can log in once your pharmacy is activated.
          </p>
          <Link className="button" to="/login">
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page two-column">
      <section className="intro">
        <p className="eyebrow">Pharmacy onboarding</p>
        <h1>Register your pharmacy</h1>
        <p>
          New pharmacies are created inactive by default. Thean super admin approval is required
          before a pharmacy is listed for customers.
        </p>
        <div className="notice">
          <ShieldAlert size={20} aria-hidden="true" />
          <span>Activation and customer listing are separate approval steps.</span>
        </div>
      </section>

      <form className="panel form-grid" onSubmit={submit}>
        {hasDraft && (
          <div style={{ fontSize: "0.8rem", color: "#6b7280", padding: "0.4rem 0.75rem", background: "#f9fafb", borderRadius: 4, border: "1px solid #e5e7eb" }}>
            ✏ Draft restored — your previous entries have been re-loaded.{" "}
            <button type="button" style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "inherit", padding: 0 }}
              onClick={() => { clearDraft(); setForm({ owner_name: "", phone_number: "", email: "", store_name: "", license_number: "", address_line_1: "", city: "", state: "", pincode: "" }); }}>
              Clear draft
            </button>
          </div>
        )}
        <label>
          Owner name
          <input
            name="owner_name"
            value={form.owner_name}
            onChange={updateField}
            onBlur={touch(setTouched, "owner_name")}
            className={inputClass(touched.owner_name, errors.owner_name)}
            required
          />
          {errors.owner_name && <span className="field-error-msg">{errors.owner_name}</span>}
        </label>
        <label>
          Phone number
          <div className="phone-input-wrapper">
            <span className="phone-prefix">🇮🇳 +91</span>
            <input
              name="phone_number"
              value={form.phone_number}
              onChange={updateField}
              onBlur={touch(setTouched, "phone_number")}
              className={inputClass(touched.phone_number, errors.phone_number)}
              inputMode="tel"
              maxLength={10}
              placeholder="9876543210"
              required
            />
          </div>
          {errors.phone_number && <span className="field-error-msg">{errors.phone_number}</span>}
        </label>
        <label>
          Email <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#6b7280" }}>(optional)</span>
          <input
            name="email"
            value={form.email}
            onChange={updateField}
            onBlur={touch(setTouched, "email")}
            className={inputClass(touched.email, errors.email)}
            type="email"
          />
          {errors.email && <span className="field-error-msg">{errors.email}</span>}
        </label>
        <label>
          Pharmacy name
          <input
            name="store_name"
            value={form.store_name}
            onChange={updateField}
            onBlur={touch(setTouched, "store_name")}
            className={inputClass(touched.store_name, errors.store_name)}
            required
          />
          {errors.store_name && <span className="field-error-msg">{errors.store_name}</span>}
        </label>
        <label>
          License number
          <input
            name="license_number"
            value={form.license_number}
            onChange={updateField}
            onBlur={touch(setTouched, "license_number")}
            className={inputClass(touched.license_number, errors.license_number)}
            required
          />
          {errors.license_number && <span className="field-error-msg">{errors.license_number}</span>}
        </label>
        <label>
          Store photo <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#6b7280" }}>(JPG or PNG — required)</span>
          <button type="button" className="outline-button" style={{ marginTop: 6, fontSize: "0.85rem" }}
            onClick={() => setShowPhotoModal(true)}>
            {storeImageFile ? `📷 Change photo (${storeImageFile.name})` : "📷 Select store photo"}
          </button>
          <input
            ref={storeImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => setStoreImageFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Drug licence <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#6b7280" }}>(PDF, JPG, or PNG — required)</span>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setDrugLicenceFile(e.target.files?.[0] ?? null)}
          />
          {drugLicenceFile && <span style={{ fontSize: "0.8em", color: "#6b7280" }}>Selected: {drugLicenceFile.name}</span>}
        </label>
        <label>
          Owner ID / Aadhaar <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#6b7280" }}>(PDF, JPG, or PNG — required)</span>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setOwnerIdFile(e.target.files?.[0] ?? null)}
          />
          {ownerIdFile && <span style={{ fontSize: "0.8em", color: "#6b7280" }}>Selected: {ownerIdFile.name}</span>}
        </label>
        <label>
          Address
          <textarea
            name="address_line_1"
            value={form.address_line_1}
            onChange={updateField}
            onBlur={touch(setTouched, "address_line_1")}
            className={inputClass(touched.address_line_1, errors.address_line_1)}
            required
          />
          {errors.address_line_1 && <span className="field-error-msg">{errors.address_line_1}</span>}
        </label>
        <div className="inline-fields">
          <label>
            City
            <input name="city" value={form.city} onChange={updateField} />
          </label>
          <label>
            State
            <input name="state" value={form.state} onChange={updateField} />
          </label>
          <label>
            Pincode
            <input
              name="pincode"
              value={form.pincode}
              onChange={updateField}
              onBlur={touch(setTouched, "pincode")}
              className={inputClass(touched.pincode, errors.pincode)}
              inputMode="numeric"
            />
            {errors.pincode && <span className="field-error-msg">{errors.pincode}</span>}
          </label>
        </div>

        <div className="location-box">
          <div>
            <strong>Pharmacy location</strong>
            <p>
              {location
                ? `Captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
                : "Mandatory. Capture current pharmacy location before submitting."}
            </p>
            {location?.accuracy && (
              <p style={{ fontSize: "0.85em", color: location.accuracy > LOCATION_ACCURACY_THRESHOLD_M ? "#b45309" : "#6b7280" }}>
                Accuracy: {Math.round(location.accuracy)} m
                {location.accuracy > LOCATION_ACCURACY_THRESHOLD_M ? " — low accuracy, consider recapturing" : ""}
              </p>
            )}
            {locationAccuracyWarning && (
              <div className="notice" style={{ marginTop: "0.5rem" }}>
                <ShieldAlert size={16} aria-hidden="true" />
                <span>{locationAccuracyWarning}</span>
              </div>
            )}
          </div>
          <button className="outline-button location-button" type="button" onClick={captureLocation}>
            <LocateFixed size={18} aria-hidden="true" />
            {isLocating ? "Capturing" : location ? "Update location" : "Use current location"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {/* Accuracy override prompt — shown when GPS accuracy is too low on first submit */}
        {showAccuracyOverride && (
          <div className="notice" style={{ background: "#fef9c3", borderColor: "#eab308" }}>
            <ShieldAlert size={18} aria-hidden="true" style={{ color: "#b45309", flexShrink: 0 }} />
            <div>
              <strong>GPS accuracy is {Math.round(location?.accuracy ?? 0)} m</strong> — above the {LOCATION_ACCURACY_THRESHOLD_M} m threshold.
              An imprecise pin may place your pharmacy in the wrong location on the map.
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => { setShowAccuracyOverride(false); captureLocation(); }}
                >
                  <LocateFixed size={15} aria-hidden="true" /> Recapture GPS
                </button>
                <button
                  type="button"
                  className="button"
                  style={{ background: "#b45309" }}
                  disabled={isSubmitting}
                  onClick={() => submit(null, { overrideAccuracy: true })}
                >
                  Submit anyway
                </button>
              </div>
            </div>
          </div>
        )}

        <button className="button" type="submit" disabled={isSubmitting}>
          <Building2 size={18} aria-hidden="true" />
          {isSubmitting ? "Registering" : "Register pharmacy"}
        </button>
        <p className="footnote">
          Already registered? <Link to="/login">Login with OTP</Link>
        </p>
      </form>
      {showPhotoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px 24px 20px", maxWidth: 420, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#13201e", marginBottom: 8 }}>📷 Store Photo Guidelines</h2>
            <p style={{ fontSize: "0.85rem", color: "#52625f", marginBottom: 14 }}>
              Your photo will be used to verify the location of your pharmacy. Please follow these guidelines:
            </p>
            <ul style={{ paddingLeft: 18, fontSize: "0.85rem", color: "#13201e", lineHeight: 1.7, marginBottom: 18 }}>
              <li>Stand <strong>inside or directly in front</strong> of your pharmacy</li>
              <li>The <strong>shop name board</strong> must be clearly visible</li>
              <li>Your <strong>face</strong> should be visible — no masks or hats</li>
              <li>Take the photo in <strong>good lighting</strong> (daytime preferred)</li>
              <li>Make sure your phone's <strong>location is turned on</strong> before taking the photo</li>
            </ul>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="button"
                style={{ flex: 1 }}
                onClick={() => { setShowPhotoModal(false); storeImageInputRef.current?.click(); }}
              >
                I understand — select photo
              </button>
              <button
                type="button"
                className="outline-button"
                onClick={() => setShowPhotoModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
