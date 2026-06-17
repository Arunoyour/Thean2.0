import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { vendorRegister, vendorVerifyOtp, saveToken } from "../lib/api.js";

const STEPS = ["Owner Details", "Shop Details", "Documents", "Verify OTP"];

const INIT = {
  full_name: "", phone: "", email: "", owner_address: "",
  shop_name: "", shop_address: "", pin_code: "", lat: "", lng: "",
};

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INIT);
  const [files, setFiles] = useState({ shop_image: null, shop_licence: null, owner_id_doc: null });
  const [otp, setOtp] = useState("");
  const [mockOtp, setMockOtp] = useState(null);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState(false);

  const shopImageRef = useRef();
  const shopLicenceRef = useRef();
  const ownerIdRef = useRef();

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function setFile(field) {
    return e => setFiles(f => ({ ...f, [field]: e.target.files[0] || null }));
  }

  function autoLocate() {
    if (!navigator.geolocation) { setApiError("Geolocation not supported."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          lat: pos.coords.latitude.toFixed(7),
          lng: pos.coords.longitude.toFixed(7),
        }));
        setLocating(false);
      },
      () => { setApiError("Could not fetch location. Allow location access and try again."); setLocating(false); },
    );
  }

  function validateStep0() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = "Name is required.";
    if (!form.phone.trim()) e.phone = "Phone is required.";
    else if (!/^\d{7,15}$/.test(form.phone.trim())) e.phone = "Enter a valid phone number.";
    if (!form.owner_address.trim()) e.owner_address = "Owner address is required.";
    return e;
  }

  function validateStep1() {
    const e = {};
    if (!form.shop_name.trim()) e.shop_name = "Shop name is required.";
    if (!form.shop_address.trim()) e.shop_address = "Shop address is required.";
    if (!form.pin_code.trim()) e.pin_code = "PIN code is required.";
    else if (!/^\d{6}$/.test(form.pin_code.trim())) e.pin_code = "Enter a valid 6-digit PIN code.";
    if (!form.lat || !form.lng) e.lat = "Location is required. Use Auto-fetch.";
    return e;
  }

  function validateStep2() {
    const e = {};
    if (!files.shop_image) e.shop_image = "Shop photo is required.";
    if (!files.shop_licence) e.shop_licence = "Shop licence is required.";
    if (!files.owner_id_doc) e.owner_id_doc = "Owner ID / Aadhaar is required.";
    return e;
  }

  function next() {
    setApiError("");
    let errs = {};
    if (step === 0) errs = validateStep0();
    if (step === 1) errs = validateStep1();
    if (step === 2) errs = validateStep2();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    if (step === 2) {
      submitRegistration();
    } else {
      setStep(s => s + 1);
    }
  }

  async function submitRegistration() {
    setLoading(true);
    const fd = new FormData();
    fd.append("full_name", form.full_name.trim());
    fd.append("phone", form.phone.trim());
    if (form.email.trim()) fd.append("email", form.email.trim());
    fd.append("owner_address", form.owner_address.trim());
    fd.append("shop_name", form.shop_name.trim());
    fd.append("shop_address", form.shop_address.trim());
    fd.append("pin_code", form.pin_code.trim());
    fd.append("lat", form.lat);
    fd.append("lng", form.lng);
    fd.append("shop_image", files.shop_image);
    fd.append("shop_licence", files.shop_licence);
    fd.append("owner_id_doc", files.owner_id_doc);

    try {
      const res = await vendorRegister(fd);
      if (res.otp) setMockOtp(res.otp);
      setStep(3);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (otp.length !== 6) { setApiError("Enter the 6-digit OTP."); return; }
    setApiError(""); setLoading(true);
    try {
      const data = await vendorVerifyOtp(form.phone.trim(), otp.trim());
      saveToken(data.access_token);
      setPending(true);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    return (
      <div className="hc-auth-page">
        <div className="hc-auth-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏳</div>
          <h2 style={{ color: "var(--teal)", marginBottom: "0.5rem" }}>Registration Submitted!</h2>
          <p style={{ color: "#52625f", lineHeight: 1.7, marginBottom: "1.5rem" }}>
            Your shop is now <strong style={{ color: "#13201e" }}>pending admin approval</strong>.
            You'll be able to accept bookings once an admin activates your shop.
          </p>
          <p style={{ color: "#52625f", fontSize: "0.85rem" }}>
            This usually takes 1–2 business days. We'll notify you via SMS when your shop is live.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hc-auth-page">
      <div className="hc-auth-card">
        <div className="hc-brand">
          <span className="hc-brand-icon">✂️</span>
          <h1>Thean Haircut</h1>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.25rem" }}>
          {STEPS.map((label, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
              <div style={{
                width: "100%", height: 4,
                borderRadius: 2,
                background: i <= step ? "var(--teal)" : "#dce6e3",
              }} />
              <span style={{ fontSize: "0.65rem", color: i === step ? "var(--teal)" : "#94a3a0" }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {apiError && <div className="hc-error">{apiError}</div>}
        {mockOtp && step === 3 && (
          <div className="hc-success">
            Dev OTP: <strong style={{ letterSpacing: 4 }}>{mockOtp}</strong>
          </div>
        )}

        {/* Step 0: Owner Details */}
        {step === 0 && (
          <div className="hc-form">
            <h2>Owner Details</h2>
            <label>
              Full Name *
              <input type="text" value={form.full_name} onChange={set("full_name")} autoFocus />
              {errors.full_name && <span className="hc-field-error">{errors.full_name}</span>}
            </label>
            <label>
              Mobile Number *
              <input type="tel" value={form.phone} onChange={set("phone")} placeholder="e.g. 9876543210" />
              {errors.phone && <span className="hc-field-error">{errors.phone}</span>}
            </label>
            <label>
              Email (optional)
              <input type="email" value={form.email} onChange={set("email")} />
            </label>
            <label>
              Owner Address *
              <textarea
                rows={3}
                value={form.owner_address}
                onChange={set("owner_address")}
                placeholder="House / flat, street, city"
                style={{ resize: "vertical" }}
              />
              {errors.owner_address && <span className="hc-field-error">{errors.owner_address}</span>}
            </label>
            <button className="hc-btn hc-btn-primary" type="button" onClick={next}>
              Next →
            </button>
          </div>
        )}

        {/* Step 1: Shop Details */}
        {step === 1 && (
          <div className="hc-form">
            <h2>Shop Details</h2>
            <label>
              Shop Name *
              <input type="text" value={form.shop_name} onChange={set("shop_name")} autoFocus />
              {errors.shop_name && <span className="hc-field-error">{errors.shop_name}</span>}
            </label>
            <label>
              Shop Address *
              <textarea
                rows={3}
                value={form.shop_address}
                onChange={set("shop_address")}
                placeholder="Shop no, street, area, city"
                style={{ resize: "vertical" }}
              />
              {errors.shop_address && <span className="hc-field-error">{errors.shop_address}</span>}
            </label>
            <label>
              PIN Code *
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={form.pin_code}
                onChange={e => setForm(f => ({ ...f, pin_code: e.target.value.replace(/\D/g, "") }))}
                placeholder="600001"
              />
              {errors.pin_code && <span className="hc-field-error">{errors.pin_code}</span>}
            </label>
            <label>
              Shop Location *
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  readOnly
                  value={form.lat && form.lng ? `${parseFloat(form.lat).toFixed(5)}, ${parseFloat(form.lng).toFixed(5)}` : ""}
                  placeholder="Not set — tap Detect Location"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="hc-btn hc-btn-secondary"
                  onClick={autoLocate}
                  disabled={locating}
                  style={{ whiteSpace: "nowrap", padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}
                >
                  {locating ? "…" : "📍 Detect Location"}
                </button>
              </div>
              {errors.lat && <span className="hc-field-error">{errors.lat}</span>}
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="hc-btn hc-btn-secondary" type="button" onClick={() => setStep(0)} style={{ flex: 1 }}>
                ← Back
              </button>
              <button className="hc-btn hc-btn-primary" type="button" onClick={next} style={{ flex: 2 }}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Document Uploads */}
        {step === 2 && (
          <div className="hc-form">
            <h2>Upload Documents</h2>
            <p style={{ fontSize: "0.8rem", color: "#52625f", marginBottom: "0.5rem" }}>
              Max 5 MB per file. JPG / PNG / PDF accepted.
            </p>

            <FileField
              label="Shop Photo *"
              hint="Clear exterior or interior photo of the shop"
              accept="image/*"
              fileRef={shopImageRef}
              file={files.shop_image}
              onChange={setFile("shop_image")}
              error={errors.shop_image}
            />
            <FileField
              label="Shop Licence *"
              hint="Business registration certificate (PDF or image)"
              accept="image/*,application/pdf"
              fileRef={shopLicenceRef}
              file={files.shop_licence}
              onChange={setFile("shop_licence")}
              error={errors.shop_licence}
            />
            <FileField
              label="Owner ID / Aadhaar *"
              hint="Government-issued ID of the shop owner"
              accept="image/*,application/pdf"
              fileRef={ownerIdRef}
              file={files.owner_id_doc}
              onChange={setFile("owner_id_doc")}
              error={errors.owner_id_doc}
            />

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="hc-btn hc-btn-secondary" type="button" onClick={() => setStep(1)} disabled={loading} style={{ flex: 1 }}>
                ← Back
              </button>
              <button className="hc-btn hc-btn-primary" type="button" onClick={next} disabled={loading} style={{ flex: 2 }}>
                {loading ? "Uploading…" : "Submit Registration"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: OTP Verify */}
        {step === 3 && (
          <form className="hc-form" onSubmit={handleVerifyOtp} noValidate>
            <h2>Verify Phone</h2>
            <p style={{ fontSize: "0.85rem", color: "#52625f" }}>
              OTP sent to <strong style={{ color: "#13201e" }}>{form.phone}</strong>
            </p>
            <label>
              6-digit OTP *
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                autoFocus
                style={{ letterSpacing: 8, fontSize: "1.4rem", textAlign: "center" }}
              />
            </label>
            <button className="hc-btn hc-btn-primary" type="submit" disabled={loading}>
              {loading ? "Verifying…" : "Verify & Complete"}
            </button>
          </form>
        )}

        <p style={{ fontSize: "0.88rem", color: "#52625f", textAlign: "center", marginTop: "0.75rem" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--teal)" }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}

function FileField({ label, hint, accept, fileRef, file, onChange, error }) {
  return (
    <label style={{ cursor: "pointer" }}>
      {label}
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${error ? "#b91c1c" : file ? "#0f766e" : "#c9d8d4"}`,
          borderRadius: 8,
          padding: "0.75rem 1rem",
          textAlign: "center",
          background: file ? "rgba(15,118,110,0.08)" : "transparent",
          cursor: "pointer",
          marginTop: "0.35rem",
        }}
      >
        {file ? (
          <span style={{ color: "#15803d", fontSize: "0.85rem" }}>✓ {file.name}</span>
        ) : (
          <span style={{ color: "#52625f", fontSize: "0.82rem" }}>
            📎 Tap to choose file
            {hint && <><br /><span style={{ fontSize: "0.75rem" }}>{hint}</span></>}
          </span>
        )}
      </div>
      <input ref={fileRef} type="file" accept={accept} onChange={onChange} style={{ display: "none" }} />
      {error && <span className="hc-field-error">{error}</span>}
    </label>
  );
}
