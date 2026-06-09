import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Send } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { requestOtp, verifyOtp } from "../lib/api.js";
import { validateOtp, validatePhone, inputClass, touch } from "../lib/validation.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
    // Mark all visible fields touched so errors appear on submit
    setTouched((t) => ({ ...t, phone: true }));
    if (validatePhone(phoneNumber)) return;
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await requestOtp(phoneNumber);
      const suffix = response.development_otp ? ` Development OTP: ${response.development_otp}` : "";
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
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await verifyOtp(phoneNumber, otp);
      window.localStorage.setItem("thean_access_token", response.access_token);
      setMessage(`Welcome back, ${response.user.full_name || response.user.phone_number}.`);
      setOtp("");
      // If the user was redirected here from a protected page, send them back
      const next = searchParams.get("next");
      navigate(next && next.startsWith("/") ? next : "/home");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">Secure access</p>
        <h1>Customer login</h1>
        <p>
          Login through OTP now. The token returned here is the same type mobile clients will use.
        </p>
      </div>

      <form className="auth-form" onSubmit={phase === "request" ? requestLoginOtp : verifyLoginOtp}>
        <label>
          Phone number
          <div className="input-with-indicator">
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              onBlur={touch(setTouched, "phone")}
              className={inputClass(touched.phone, phoneErr)}
              inputMode="tel"
              maxLength={15}
              autoComplete="tel"
              disabled={phase === "verify"}
              required
            />
            {touched.phone && !phoneErr && (
              <span className="input-valid-tick" aria-label="Valid">✓</span>
            )}
          </div>
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
              autoComplete="one-time-code"
              required
            />
            {otpErr && <span className="field-error-msg">{otpErr}</span>}
          </label>
        )}

        <FormMessage kind="success">{message}</FormMessage>
        <FormMessage kind="error">{error}</FormMessage>

        {phase === "verify" && error && (
          <button
            className="text-button login-retry-btn"
            type="button"
            onClick={async () => {
              setError("");
              setMessage("");
              setOtp("");
              setTouched({});
              setIsSubmitting(true);
              try {
                const response = await requestOtp(phoneNumber);
                const suffix = response.development_otp ? ` Development OTP: ${response.development_otp}` : "";
                setMessage(`OTP resent.${suffix}`);
              } catch (retryError) {
                setError(retryError.message);
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
          >
            Resend OTP
          </button>
        )}

        <button className="button button-full" type="submit" disabled={isSubmitting}>
          {phase === "request" ? (
            <>
              <Send size={18} aria-hidden="true" />
              {isSubmitting ? "Sending OTP" : "Send OTP"}
            </>
          ) : (
            <>
              <KeyRound size={18} aria-hidden="true" />
              {isSubmitting ? "Verifying" : "Verify OTP"}
            </>
          )}
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

        <p className="form-footnote">
          New customer? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </section>
  );
}
