import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";

import { requestOtp, verifyOtp } from "../lib/api.js";
import { validatePhone, validateOtp, inputClass, touch } from "../lib/validation.js";

export function LoginPage() {
  const navigate = useNavigate();
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

  async function requestLoginOtp(event) {
    event.preventDefault();
    setTouched((t) => ({ ...t, phone: true }));
    if (validatePhone(phoneNumber)) return;
    setError(""); setMessage(""); setIsSubmitting(true);
    try {
      const response = await requestOtp(phoneNumber);
      // Dev OTP hint only shown in local development builds — never in production
      const suffix = (import.meta.env.DEV && response.development_otp)
        ? ` Development OTP: ${response.development_otp}`
        : "";
      setMessage(`${response.message}${suffix}`);
      setPhase("verify");
      setTouched({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyLoginOtp(event) {
    event.preventDefault();
    setTouched((t) => ({ ...t, otp: true }));
    if (validateOtp(otp)) return;
    setError(""); setMessage(""); setIsSubmitting(true);
    try {
      await verifyOtp(phoneNumber, otp);
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page auth-layout">
      <section className="intro">
        <p className="eyebrow">Thean control center</p>
        <h1>Super Admin</h1>
        <p>Login with mobile number and OTP to approve pharmacy merchants.</p>
      </section>

      <form className="panel form-grid" onSubmit={phase === "request" ? requestLoginOtp : verifyLoginOtp}>
        {sessionExpired && (
          <div className="session-expired-banner" role="alert">
            Your session has expired. Please login again.
          </div>
        )}
        <div className="brand-row">
          <span className="brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
          <strong>Thean Super Admin</strong>
        </div>

        <label>
          Mobile number
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
                const r = await requestOtp(phoneNumber);
                const s = (import.meta.env.DEV && r.development_otp)
                  ? ` Development OTP: ${r.development_otp}`
                  : "";
                setMessage(`OTP resent.${s}`);
              } catch (e) { setError(e.message); } finally { setIsSubmitting(false); }
            }}
          >
            Resend OTP
          </button>
        )}

        <button className="button" type="submit" disabled={isSubmitting}>
          <KeyRound size={18} aria-hidden="true" />
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
      </form>
    </main>
  );
}
