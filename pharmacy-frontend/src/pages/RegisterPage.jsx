import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, LocateFixed, ShieldAlert } from "lucide-react";

import { registerPharmacy } from "../lib/api.js";
import { validatePhone, validateEmail, validatePincode, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqOwner   = validateRequired("Owner name");
const reqStore   = validateRequired("Pharmacy name");
const reqLicense = validateRequired("License number");
const reqAddr    = validateRequired("Address");

export function RegisterPage() {
  const [form, setForm] = useState({
    owner_name: "",
    phone_number: "",
    email: "",
    store_name: "",
    license_number: "",
    address_line_1: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [location, setLocation] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [touched, setTouched] = useState({});

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
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission is required to register a pharmacy."
            : "Could not capture location. Please try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function submit(event) {
    event.preventDefault();
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

    setIsSubmitting(true);
    try {
      const response = await registerPharmacy({
        ...form,
        email: form.email || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setMessage(`${response.profile.store_name} registered. Status: pending super admin approval.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
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
          <input
            name="phone_number"
            value={form.phone_number}
            onChange={updateField}
            onBlur={touch(setTouched, "phone_number")}
            className={inputClass(touched.phone_number, errors.phone_number)}
            inputMode="tel"
            required
          />
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
            {location?.accuracy && <p>Accuracy: {Math.round(location.accuracy)} meters</p>}
          </div>
          <button className="outline-button location-button" type="button" onClick={captureLocation}>
            <LocateFixed size={18} aria-hidden="true" />
            {isLocating ? "Capturing" : location ? "Update location" : "Use current location"}
          </button>
        </div>

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        <button className="button" type="submit" disabled={isSubmitting}>
          <Building2 size={18} aria-hidden="true" />
          {isSubmitting ? "Registering" : "Register pharmacy"}
        </button>
        <p className="footnote">
          Already registered? <Link to="/login">Login with OTP</Link>
        </p>
      </form>
    </main>
  );
}
