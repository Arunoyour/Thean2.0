import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bike, ChevronRight } from "lucide-react";
import { requestDeliveryOtp, verifyDeliveryOtp } from "../lib/api.js";
import { validatePhone, validateOtp, inputClass, touch } from "../lib/validation.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [sessionExpired] = useState(() => {
    const flag = window.sessionStorage.getItem("thean:session_expired");
    if (flag) window.sessionStorage.removeItem("thean:session_expired");
    return flag === "1";
  });
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1); // 1=phone, 2=otp
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // Only surfaced in development builds — never shown in production
  const [otpHint, setOtpHint] = useState("");
  const [touched, setTouched] = useState({});

  const phoneErr = touched.phone ? validatePhone(phone) : null;
  const otpErr   = touched.otp   ? validateOtp(otp)     : null;

  async function requestOtp(e) {
    e.preventDefault();
    setTouched((t) => ({ ...t, phone: true }));
    if (validatePhone(phone)) return;
    setError(""); setOtpHint(""); setIsLoading(true);
    try {
      const resp = await requestDeliveryOtp(phone);
      // Dev OTP hint is only shown in local development builds
      if (import.meta.env.DEV && resp.otp) setOtpHint(`Dev OTP: ${resp.otp}`);
      setStep(2);
      setTouched({});
    } catch (err) { setError(err.message); } finally { setIsLoading(false); }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setTouched((t) => ({ ...t, otp: true }));
    if (validateOtp(otp)) return;
    setError(""); setIsLoading(true);
    try {
      await verifyDeliveryOtp(phone, otp);
      navigate("/home");
    } catch (err) { setError(err.message); } finally { setIsLoading(false); }
  }

  return (
    <div className="dl-auth-page">
      <div className="dl-auth-card">
        <div className="dl-brand">
          <Bike size={32} />
          <h1>Thean Delivery</h1>
        </div>

        {sessionExpired && (
          <div className="session-expired-banner" role="alert">
            Your session has expired. Please login again.
          </div>
        )}
        {error ? <div className="dl-error">{error}</div> : null}
        {/* otpHint is only populated in import.meta.env.DEV builds */}
        {otpHint ? <div className="dl-otp-hint">{otpHint}</div> : null}

        {step === 1 ? (
          <form onSubmit={requestOtp} className="dl-form">
            <h2>Login to your account</h2>
            <label>
              Phone Number
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={touch(setTouched, "phone")}
                className={inputClass(touched.phone, phoneErr)}
                placeholder="+91 98765 43210"
                autoFocus
              />
              {phoneErr && <span className="field-error-msg">{phoneErr}</span>}
            </label>
            <button className="dl-btn" type="submit" disabled={isLoading}>
              {isLoading ? "Sending OTP…" : "Send OTP"} <ChevronRight size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="dl-form">
            <h2>Enter OTP</h2>
            <p className="dl-hint">Sent to <strong>{phone}</strong>. <button type="button" className="dl-text-btn" onClick={() => { setStep(1); setTouched({}); setOtpHint(""); }}>Change</button></p>
            <label>
              6-digit OTP
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onBlur={touch(setTouched, "otp")}
                className={inputClass(touched.otp, otpErr)}
                placeholder="123456"
                autoFocus
              />
              {otpErr && <span className="field-error-msg">{otpErr}</span>}
            </label>
            {error && (
              <button
                type="button"
                className="dl-text-btn"
                style={{ fontSize: "0.85rem" }}
                disabled={isLoading}
                onClick={async () => {
                  setError(""); setOtp(""); setTouched({});
                  setIsLoading(true);
                  try {
                    const r = await requestDeliveryOtp(phone);
                    if (import.meta.env.DEV && r.otp) setOtpHint(`Dev OTP: ${r.otp}`);
                  } catch (err) { setError(err.message); } finally { setIsLoading(false); }
                }}
              >
                Resend OTP
              </button>
            )}
            <button className="dl-btn" type="submit" disabled={isLoading}>
              {isLoading ? "Verifying…" : "Login"} <ChevronRight size={16} />
            </button>
          </form>
        )}

        <p className="dl-auth-link">New driver? <Link to="/register">Register here</Link></p>
      </div>
    </div>
  );
}
