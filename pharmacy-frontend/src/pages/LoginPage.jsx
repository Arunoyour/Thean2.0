import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Send } from "lucide-react";

import { requestPharmacyOtp, verifyPharmacyOtp } from "../lib/api.js";
import { validatePhone, validateOtp, inputClass, touch } from "../lib/validation.js";

export function LoginPage() {
  const navigate = useNavigate();
  // Show a banner if the user was redirected here because their session expired
  const [sessionExpired] = useState(() => {
    const flag = window.sessionStorage.getItem("thean:session_expired");
    if (flag) window.sessionStorage.removeItem("thean:session_expired");
    return flag === "1";
  });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [phase, setPhase] = useState("request");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  const phoneErr = touched.phone ? validatePhone(phoneNumber) : null;
  const otpErr   = touched.otp   ? validateOtp(otp)           : null;

  async function requestOtp(event) {
    event.preventDefault();
    setTouched((t) => ({ ...t, phone: true }));
    if (validatePhone(phoneNumber)) return;
    setError(""); setMessage(""); setIsSubmitting(true);
    try {
      const response = await requestPharmacyOtp(phoneNumber);
      const suffix = response.development_otp ? ` Development OTP: ${response.development_otp}` : "";
      // Clear state before entering verify phase so nothing stale persists
      setOtp("");
      setTouched({});
      setMessage(`${response.message}${suffix}`);
      setPhase("verify");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setTouched((t) => ({ ...t, otp: true }));
    if (validateOtp(otp)) return;
    setError(""); setMessage(""); setIsSubmitting(true);
    try {
      await verifyPharmacyOtp(phoneNumber, otp);
      navigate("/home");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page two-column">
      <section className="intro">
        <p className="eyebrow">Pharmacy portal</p>
        <h1>Thean Pharmacy</h1>
        <p>Login to view activation status and prepare your merchant profile for approval.</p>
      </section>

      <form className="panel form-grid" onSubmit={phase === "request" ? requestOtp : verifyOtp}>
        {sessionExpired && (
          <div className="session-expired-banner" role="alert">
            Your session has expired. Please login again.
          </div>
        )}
        <label>
          Phone number
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            onBlur={touch(setTouched, "phone")}
            className={inputClass(touched.phone, phoneErr)}
            inputMode="tel"
            placeholder="e.g. 9876543210"
            disabled={phase === "verify"}
            required
          />
          {phoneErr && <span className="field-error-msg">{phoneErr}</span>}
        </label>

        {phase === "verify" && (
          <label>
            OTP
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              onBlur={touch(setTouched, "otp")}
              className={inputClass(touched.otp, otpErr)}
              inputMode="numeric"
              maxLength={6}
              required
            />
            {otpErr && <span className="field-error-msg">{otpErr}</span>}
          </label>
        )}

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        {phase === "verify" && error && (
          <button
            className="text-button"
            type="button"
            style={{ fontSize: "0.875rem" }}
            disabled={isSubmitting}
            onClick={async () => {
              setError(""); setMessage(""); setOtp(""); setTouched({});
              setIsSubmitting(true);
              try {
                const r = await requestPharmacyOtp(phoneNumber);
                const s = r.development_otp ? ` Development OTP: ${r.development_otp}` : "";
                setMessage(`OTP resent.${s}`);
              } catch (e) { setError(e.message); } finally { setIsSubmitting(false); }
            }}
          >
            Resend OTP
          </button>
        )}

        <button className="button" type="submit" disabled={isSubmitting}>
          {phase === "request" ? <Send size={18} /> : <KeyRound size={18} />}
          {isSubmitting ? "Working" : phase === "request" ? "Send OTP" : "Verify OTP"}
        </button>

        {phase === "verify" && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setPhase("request");
              setOtp("");
              setMessage("");
              setError("");
              setTouched({});
            }}
          >
            Change phone number
          </button>
        )}

        <p className="footnote">
          New pharmacy? <Link to="/register">Register now</Link>
        </p>
      </form>
    </main>
  );
}
