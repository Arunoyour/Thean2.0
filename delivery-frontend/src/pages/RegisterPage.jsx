import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bike, Car, CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";
import { registerDelivery } from "../lib/api.js";
import { validatePhone, validateEmail, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqName    = validateRequired("Full name");
const reqLicense = validateRequired("Driving license number");
const reqIdNum   = validateRequired("ID document number");

const VEHICLES = [
  { value: "bike", label: "Bike", icon: Bike },
  { value: "car", label: "Car", icon: Car },
  { value: "cycle", label: "Cycle", icon: Bike },
];

// Accepted MIME types for document uploads (used post-login on home screen)
export const ALLOWED_DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const REGISTER_DRAFT_KEY = "thean_delivery_register_draft";
function loadDraft() {
  try { const s = window.localStorage.getItem(REGISTER_DRAFT_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function saveDraft(form) {
  try { window.localStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(form)); } catch { /* ignore */ }
}
function clearDraft() {
  try { window.localStorage.removeItem(REGISTER_DRAFT_KEY); } catch { /* ignore */ }
}

export function RegisterPage() {
  // Two steps: 1=details, 2=done
  const [step, setStep] = useState(1);
  const [hasDraft] = useState(() => loadDraft() !== null);
  const [form, setForm] = useState(() => {
    const draft = loadDraft();
    return draft ?? {
      full_name: "",
      phone_number: "",
      email: "",
      vehicle_type: "bike",
      vehicle_number: "",
      license_number: "",
      id_number: "",
    };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  // Persist form to localStorage on every change; clear on successful registration
  useEffect(() => { saveDraft(form); }, [form]);
  const [touched, setTouched] = useState({});

  function setErr(msg) {
    setErrors(Array.isArray(msg) ? msg : [msg]);
  }

  const fieldErrors = {
    full_name:      touched.full_name      ? reqName(form.full_name)              : null,
    phone_number:   touched.phone_number   ? validatePhone(form.phone_number)     : null,
    email:          touched.email          ? validateEmail(form.email)            : null,
    license_number: touched.license_number ? reqLicense(form.license_number)     : null,
    id_number:      touched.id_number      ? reqIdNum(form.id_number)             : null,
  };

  async function handleRegister(e) {
    e.preventDefault();
    setTouched({ full_name: true, phone_number: true, email: true, license_number: true, id_number: true });
    if (
      reqName(form.full_name) ||
      validatePhone(form.phone_number) ||
      validateEmail(form.email) ||
      reqLicense(form.license_number) ||
      reqIdNum(form.id_number)
    ) return;
    setErrors([]); setIsLoading(true);
    try {
      await registerDelivery(form);
      clearDraft();
      setStep(2);
    } catch (err) {
      // Server may return {errors: [...]} for duplicate fields
      const detail = err.detail || err.message;
      if (detail && typeof detail === "object" && detail.errors) {
        setErrors(detail.errors);
      } else {
        setErr(typeof detail === "string" ? detail : err.message);
      }
    } finally { setIsLoading(false); }
  }

  return (
    <div className="dl-auth-page">
      <div className="dl-auth-card">
        <div className="dl-brand">
          <Bike size={32} />
          <h1>Thean Delivery</h1>
        </div>

        {/* Step indicator */}
        <div className="dl-steps">
          {["Details", "Done"].map((label, i) => (
            <div key={label} className={`dl-step ${step > i + 1 ? "dl-step-done" : step === i + 1 ? "dl-step-active" : ""}`}>
              <span>{step > i + 1 ? <CheckCircle2 size={14} /> : i + 1}</span>
              <p>{label}</p>
            </div>
          ))}
        </div>

        {errors.length > 0 && (
          <div className="dl-error-list">
            <AlertTriangle size={16} />
            <ul>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleRegister} className="dl-form">
            <h2>Create your account</h2>
            {hasDraft && (
              <div style={{ fontSize: "0.8rem", color: "#6b7280", padding: "0.4rem 0.75rem", background: "#f9fafb", borderRadius: 4, border: "1px solid #e5e7eb", marginBottom: "0.5rem" }}>
                ✏ Draft restored.{" "}
                <button type="button" style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                  onClick={() => { clearDraft(); setForm({ full_name: "", phone_number: "", email: "", vehicle_type: "bike", vehicle_number: "", license_number: "", id_number: "" }); }}>
                  Clear
                </button>
              </div>
            )}
            <p className="dl-hint">
              Phone number, license number, and ID number must each be unique — duplicate entries will be rejected.
            </p>

            <label>Full Name *
              <input required value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                onBlur={touch(setTouched, "full_name")}
                className={inputClass(touched.full_name, fieldErrors.full_name)}
                placeholder="Ravi Kumar" />
              {fieldErrors.full_name && <span className="field-error-msg">{fieldErrors.full_name}</span>}
            </label>
            <label>Phone Number *
              <input required type="tel" value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                onBlur={touch(setTouched, "phone_number")}
                className={inputClass(touched.phone_number, fieldErrors.phone_number)}
                placeholder="+91 98765 43210" />
              {fieldErrors.phone_number && <span className="field-error-msg">{fieldErrors.phone_number}</span>}
            </label>
            <label>Email <span style={{ fontWeight: 400, fontSize: "0.8em" }}>(optional)</span>
              <input type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onBlur={touch(setTouched, "email")}
                className={inputClass(touched.email, fieldErrors.email)}
                placeholder="ravi@email.com" />
              {fieldErrors.email && <span className="field-error-msg">{fieldErrors.email}</span>}
            </label>

            <div className="dl-two-col">
              <label>Vehicle Number
                <input value={form.vehicle_number}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))}
                  placeholder="TN 01 AB 1234" />
              </label>
              <label>Driving License No. *
                <input required value={form.license_number}
                  onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))}
                  onBlur={touch(setTouched, "license_number")}
                  className={inputClass(touched.license_number, fieldErrors.license_number)}
                  placeholder="TN0120230012345" />
                {fieldErrors.license_number && <span className="field-error-msg">{fieldErrors.license_number}</span>}
              </label>
            </div>

            <label>ID Document Number (Aadhar / PAN) *
              <input required value={form.id_number}
                onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))}
                onBlur={touch(setTouched, "id_number")}
                className={inputClass(touched.id_number, fieldErrors.id_number)}
                placeholder="1234 5678 9012" />
              {fieldErrors.id_number && <span className="field-error-msg">{fieldErrors.id_number}</span>}
            </label>

            <div className="dl-field-label">Vehicle Type *</div>
            <div className="dl-vehicle-options">
              {VEHICLES.map(({ value, label, icon: Icon }) => (
                <label key={value} className={`dl-vehicle-opt ${form.vehicle_type === value ? "dl-vehicle-opt-active" : ""}`}>
                  <input type="radio" name="vehicle" value={value} checked={form.vehicle_type === value}
                    onChange={() => setForm((f) => ({ ...f, vehicle_type: value }))} />
                  <Icon size={24} />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <button className="dl-btn" type="submit" disabled={isLoading}>
              {isLoading ? "Checking…" : "Continue"} <ChevronRight size={16} />
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="dl-form">
            <div className="dl-success-icon"><CheckCircle2 size={56} /></div>
            <h2>Registration Submitted!</h2>
            <p className="dl-hint">
              Your account is <strong>pending admin activation</strong>.
              Activation typically takes <strong>1–2 business days</strong>.
              You will be able to log in once an admin approves your profile.
            </p>
            <p className="dl-hint" style={{ marginTop: "0.75rem" }}>
              After your account is activated and you log in, you can upload your
              <strong> driving license</strong> and <strong>ID proof</strong> documents directly from the home screen.
            </p>
            <Link className="dl-btn" to="/login">Go to Login</Link>
          </div>
        )}

        {step === 1 && (
          <p className="dl-auth-link">Already have an account? <Link to="/login">Login</Link></p>
        )}
      </div>
    </div>
  );
}
