import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bike, Car, CheckCircle2, ChevronRight, AlertTriangle, Camera, Loader2 } from "lucide-react";
import { registerDelivery } from "../lib/api.js";
import { validatePhone, validateEmail, validateRequired, validateFileSize, inputClass, touch } from "../lib/validation.js";

const reqName    = validateRequired("Full name");
const reqLicense = validateRequired("Driving license number");
const reqIdNum   = validateRequired("ID document number");
const reqVehicle = validateRequired("Vehicle number");

const VEHICLES = [
  { value: "bike",  label: "Bike",  icon: Bike },
  { value: "car",   label: "Car",   icon: Car  },
  { value: "cycle", label: "Cycle", icon: Bike },
];

const ALLOWED_DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Indian vehicle number — basic: 2 letters, 1-2 digits, 1-3 letters/digits, 4 digits (spaces allowed)
const VEHICLE_NO_RE = /^[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{4}$/i;
function validateVehicleNumber(v) {
  if (!v || !v.trim()) return null; // optional
  if (!VEHICLE_NO_RE.test(v.trim())) return "Enter a valid vehicle number (e.g. TN 01 AB 1234)";
  return null;
}

// face-api.js model URL (hosted by the library author on GitHub Pages)
const FACE_API_MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

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

// Load face-api.js tiny detector model (once, cached after first load)
let _modelLoaded = false;
async function ensureFaceModel() {
  const faceapi = window.faceapi;
  if (!faceapi) throw new Error("Face detection library not loaded. Please refresh and try again.");
  if (_modelLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
  _modelLoaded = true;
}

// Returns null on success, error string on failure
async function validateFacePhoto(file) {
  const sizeErr = validateFileSize(file);
  if (sizeErr) return sizeErr;
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return "Profile photo must be a JPG, PNG, or WebP image.";

  await ensureFaceModel();

  // Draw into an offscreen image element
  const url = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read image file."));
    el.src = url;
  });
  URL.revokeObjectURL(url);

  const faceapi = window.faceapi;
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
  const detections = await faceapi.detectAllFaces(img, opts);

  if (detections.length === 0) return "No face detected. Please upload a clear, well-lit photo of your face.";
  if (detections.length > 1) return `${detections.length} faces detected. Photo must contain only your face — no other people.`;

  // Check face is fully in frame and not too small
  const { x, y, width: w, height: h } = detections[0].box;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const marginPct = 0.04; // 4% edge margin

  const tooClose =
    x < iw * marginPct ||
    y < ih * marginPct ||
    (x + w) > iw * (1 - marginPct) ||
    (y + h) > ih * (1 - marginPct);

  if (tooClose) return "Face appears to be cut off. Please step back slightly so your full face is clearly visible.";

  const faceFraction = (w * h) / (iw * ih);
  if (faceFraction < 0.05) return "Face is too small. Please move closer to the camera so your face fills most of the frame.";

  return null; // OK
}

export function RegisterPage() {
  const [step, setStep] = useState(1);
  const [hasDraft] = useState(() => loadDraft() !== null);
  const [form, setForm] = useState(() => {
    const defaults = {
      full_name: "", phone_number: "", email: "",
      vehicle_type: "bike", vehicle_number: "",
      license_number: "", id_number: "",
    };
    const draft = loadDraft();
    return draft ? { ...defaults, ...draft } : defaults;
  });

  // File fields
  const [photo, setPhoto]         = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoError, setPhotoError]     = useState(null);
  const [faceChecking, setFaceChecking] = useState(false);
  const [rcFront, setRcFront]     = useState(null);
  const [rcBack, setRcBack]       = useState(null);
  const [insurance, setInsurance] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors]       = useState([]);
  const [touched, setTouched]     = useState({});

  const photoInputRef = useRef(null);

  useEffect(() => { saveDraft(form); }, [form]);

  function setErr(msg) { setErrors(Array.isArray(msg) ? msg : [msg]); }

  const fieldErrors = {
    full_name:      touched.full_name      ? reqName(form.full_name)                : null,
    phone_number:   touched.phone_number   ? validatePhone(form.phone_number)       : null,
    email:          touched.email          ? (validateRequired("Email")(form.email) || validateEmail(form.email)) : null,
    vehicle_number: touched.vehicle_number ? (reqVehicle(form.vehicle_number) || validateVehicleNumber(form.vehicle_number)) : null,
    license_number: touched.license_number ? reqLicense(form.license_number)        : null,
    id_number:      touched.id_number      ? reqIdNum(form.id_number)               : null,
    photo:    touched.photo    ? (photo ? photoError : "Profile photo is required") : null,
    rc_front: touched.rc_front ? (rcFront ? validateFileSize(rcFront) : "RC book front is required") : null,
    rc_back:  touched.rc_back  ? (rcBack  ? validateFileSize(rcBack)  : "RC book back is required")  : null,
    insurance: touched.insurance ? (insurance ? validateFileSize(insurance) : "Insurance document is required") : null,
  };

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    touch(setTouched, "photo")();
    setPhoto(null); setPhotoPreview(null); setPhotoError(null);
    setFaceChecking(true);
    try {
      const err = await validateFacePhoto(file);
      if (err) {
        setPhotoError(err);
        if (photoInputRef.current) photoInputRef.current.value = "";
      } else {
        setPhoto(file);
        setPhotoPreview(URL.createObjectURL(file));
      }
    } catch (ex) {
      setPhotoError(ex.message);
    } finally {
      setFaceChecking(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const allTouched = {
      full_name: true, phone_number: true, email: true,
      vehicle_number: true, license_number: true, id_number: true,
      photo: true, rc_front: true, rc_back: true, insurance: true,
    };
    setTouched(allTouched);

    if (
      reqName(form.full_name) ||
      validatePhone(form.phone_number) ||
      validateRequired("Email")(form.email) || validateEmail(form.email) ||
      reqVehicle(form.vehicle_number) || validateVehicleNumber(form.vehicle_number) ||
      reqLicense(form.license_number) ||
      reqIdNum(form.id_number) ||
      !photo || photoError ||
      !rcFront || validateFileSize(rcFront) ||
      !rcBack  || validateFileSize(rcBack)  ||
      !insurance || validateFileSize(insurance)
    ) return;

    setErrors([]); setIsLoading(true);
    try {
      await registerDelivery({
        ...form,
        phone_number: `+91${form.phone_number}`,
        profile_photo: photo,
        rc_book_front: rcFront,
        rc_book_back:  rcBack,
        insurance,
      });
      clearDraft();
      setStep(2);
    } catch (err) {
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
            <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleRegister} className="dl-form" noValidate>
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
              All fields marked * are required. Phone, email, vehicle number, license, and ID must each be unique — duplicates will be rejected.
            </p>

            {/* ── Personal info ── */}
            <label>Full Name *
              <input required value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                onBlur={touch(setTouched, "full_name")}
                className={inputClass(touched.full_name, fieldErrors.full_name)}
                placeholder="Ravi Kumar" />
              {fieldErrors.full_name && <span className="field-error-msg">{fieldErrors.full_name}</span>}
            </label>

            <label>Phone Number *
              <div className="phone-input-wrapper">
                <span className="phone-prefix">🇮🇳 +91</span>
                <input required type="tel" value={form.phone_number}
                  onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                  onBlur={touch(setTouched, "phone_number")}
                  className={inputClass(touched.phone_number, fieldErrors.phone_number)}
                  placeholder="9876543210"
                  maxLength={10} />
              </div>
              {fieldErrors.phone_number && <span className="field-error-msg">{fieldErrors.phone_number}</span>}
            </label>

            <label>Email *
              <input type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onBlur={touch(setTouched, "email")}
                className={inputClass(touched.email, fieldErrors.email)}
                placeholder="ravi@email.com" />
              {fieldErrors.email && <span className="field-error-msg">{fieldErrors.email}</span>}
            </label>

            <label>Vehicle Number *
              <input value={form.vehicle_number}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value.toUpperCase() }))}
                onBlur={touch(setTouched, "vehicle_number")}
                className={inputClass(touched.vehicle_number, fieldErrors.vehicle_number)}
                placeholder="TN 01 AB 1234" />
              {fieldErrors.vehicle_number && <span className="field-error-msg">{fieldErrors.vehicle_number}</span>}
            </label>

            <label>Driving License No. *
              <input required value={form.license_number}
                onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value.toUpperCase() }))}
                onBlur={touch(setTouched, "license_number")}
                className={inputClass(touched.license_number, fieldErrors.license_number)}
                placeholder="TN0120230012345" />
              {fieldErrors.license_number && <span className="field-error-msg">{fieldErrors.license_number}</span>}
            </label>

            <label>ID Document Number (Aadhar / PAN) *
              <input required value={form.id_number}
                onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))}
                onBlur={touch(setTouched, "id_number")}
                className={inputClass(touched.id_number, fieldErrors.id_number)}
                placeholder="1234 5678 9012" />
              {fieldErrors.id_number && <span className="field-error-msg">{fieldErrors.id_number}</span>}
            </label>

            {/* ── Profile photo ── */}
            <div className="dl-field-label" style={{ marginTop: "0.5rem" }}>
              Profile Photo * <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#94a3b8" }}>(JPG / PNG / WebP · max 1 MB · clear front-facing photo)</span>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 4 }}>
              {photoPreview ? (
                <img src={photoPreview} alt="Profile preview"
                  style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid #22c55e", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#1e293b", border: `2px solid ${fieldErrors.photo ? "#ef4444" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {faceChecking ? <Loader2 size={24} className="dl-spin" style={{ color: "#3b82f6" }} /> : <Camera size={24} style={{ color: "#64748b" }} />}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: "block", width: "100%", fontSize: "0.85rem" }}
                  onBlur={touch(setTouched, "photo")}
                  onChange={handlePhotoChange} />
                {faceChecking && <span style={{ fontSize: "0.75rem", color: "#3b82f6", display: "block", marginTop: 4 }}>Checking photo for face…</span>}
                {fieldErrors.photo && <span className="field-error-msg">{fieldErrors.photo}</span>}
                {photo && !photoError && <span className="field-ok-msg">✓ Face detected — photo accepted</span>}
                <span style={{ fontSize: "0.72rem", color: "#64748b", display: "block", marginTop: 4 }}>
                  Ensure your full face is clearly visible. No sunglasses, masks, or other people.
                </span>
              </div>
            </div>

            {/* ── Documents ── */}
            <div className="dl-field-label" style={{ marginTop: "0.5rem" }}>
              Documents <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#94a3b8" }}>(JPG / PNG / PDF · max 1 MB each)</span>
            </div>
            <label>RC Book — Front *
              <input required type="file" accept={ALLOWED_DOC_TYPES.join(",")}
                onBlur={touch(setTouched, "rc_front")}
                className={inputClass(touched.rc_front, fieldErrors.rc_front)}
                onChange={(e) => { touch(setTouched, "rc_front")(); setRcFront(e.target.files?.[0] ?? null); }} />
              {fieldErrors.rc_front && <span className="field-error-msg">{fieldErrors.rc_front}</span>}
              {rcFront && !fieldErrors.rc_front && <span className="field-ok-msg">✓ {rcFront.name}</span>}
            </label>
            <label>RC Book — Back *
              <input required type="file" accept={ALLOWED_DOC_TYPES.join(",")}
                onBlur={touch(setTouched, "rc_back")}
                className={inputClass(touched.rc_back, fieldErrors.rc_back)}
                onChange={(e) => { touch(setTouched, "rc_back")(); setRcBack(e.target.files?.[0] ?? null); }} />
              {fieldErrors.rc_back && <span className="field-error-msg">{fieldErrors.rc_back}</span>}
              {rcBack && !fieldErrors.rc_back && <span className="field-ok-msg">✓ {rcBack.name}</span>}
            </label>
            <label>Insurance Document *
              <input required type="file" accept={ALLOWED_DOC_TYPES.join(",")}
                onBlur={touch(setTouched, "insurance")}
                className={inputClass(touched.insurance, fieldErrors.insurance)}
                onChange={(e) => { touch(setTouched, "insurance")(); setInsurance(e.target.files?.[0] ?? null); }} />
              {fieldErrors.insurance && <span className="field-error-msg">{fieldErrors.insurance}</span>}
              {insurance && !fieldErrors.insurance && <span className="field-ok-msg">✓ {insurance.name}</span>}
            </label>

            {/* ── Vehicle type ── */}
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

            <button className="dl-btn" type="submit" disabled={isLoading || faceChecking}>
              {isLoading ? "Submitting…" : faceChecking ? "Checking photo…" : "Continue"} <ChevronRight size={16} />
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
              After activation you can upload your <strong>driving license</strong> and <strong>ID proof</strong> directly from the home screen.
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
