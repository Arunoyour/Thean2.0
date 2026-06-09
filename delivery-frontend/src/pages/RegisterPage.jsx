import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bike, Car, CheckCircle2, ChevronRight, FileText, Upload, AlertTriangle } from "lucide-react";
import { registerDelivery } from "../lib/api.js";

const VEHICLES = [
  { value: "bike", label: "Bike", icon: Bike },
  { value: "car", label: "Car", icon: Car },
  { value: "cycle", label: "Cycle", icon: Bike },
];

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=details, 2=docs, 3=done
  const [form, setForm] = useState({
    full_name: "",
    phone_number: "",
    email: "",
    vehicle_type: "bike",
    vehicle_number: "",
    license_number: "",
    id_number: "",
  });
  const [account, setAccount] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [idFile, setIdFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  function setErr(msg) {
    setErrors(Array.isArray(msg) ? msg : [msg]);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setErrors([]); setIsLoading(true);
    try {
      const acc = await registerDelivery(form);
      setAccount(acc);
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

  async function handleDocStep(e) {
    e.preventDefault();
    // Docs are uploaded after admin activation. Just advance.
    setStep(3);
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
          {["Details", "Documents", "Done"].map((label, i) => (
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
            <p className="dl-hint">All details must be unique. Duplicate entries will be rejected to prevent fraud.</p>

            <label>Full Name *
              <input required value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Ravi Kumar" />
            </label>
            <label>Phone Number *
              <input required type="tel" value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                placeholder="+91 98765 43210" />
            </label>
            <label>Email
              <input type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ravi@email.com" />
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
                  placeholder="TN0120230012345" />
              </label>
            </div>

            <label>ID Document Number (Aadhar / PAN) *
              <input required value={form.id_number}
                onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))}
                placeholder="1234 5678 9012" />
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
          <form onSubmit={handleDocStep} className="dl-form">
            <h2>Upload Documents</h2>
            <p className="dl-hint">
              Upload your driving license and ID proof for admin verification.
              Accepted formats: image or PDF.
            </p>
            <DocUpload label="Driving License" icon={FileText} file={licenseFile} onChange={setLicenseFile} />
            <DocUpload label="ID Proof (Aadhar / PAN)" icon={FileText} file={idFile} onChange={setIdFile} />
            <p className="dl-hint" style={{ marginTop: 8 }}>
              Documents can also be re-uploaded after login once your account is activated.
            </p>
            <button className="dl-btn" type="submit">{isLoading ? "Uploading…" : "Submit"} <ChevronRight size={16} /></button>
          </form>
        )}

        {step === 3 && (
          <div className="dl-form">
            <div className="dl-success-icon"><CheckCircle2 size={56} /></div>
            <h2>Registration Submitted!</h2>
            <p className="dl-hint">
              Your account is <strong>pending admin activation</strong>.
              You will be able to log in once an admin approves your profile.
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

function DocUpload({ label, icon: Icon, file, onChange }) {
  const inputRef = useRef();
  return (
    <div className="dl-doc-upload">
      <div className="dl-doc-label"><Icon size={18} />{label}</div>
      <button type="button" className="dl-doc-btn" onClick={() => inputRef.current.click()}>
        <Upload size={16} />
        {file ? file.name : "Choose file"}
      </button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden
        onChange={(e) => onChange(e.target.files[0] || null)} />
    </div>
  );
}
