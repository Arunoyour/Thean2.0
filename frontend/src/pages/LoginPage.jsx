import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Send } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { requestOtp, verifyOtp } from "../lib/api.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [phase, setPhase] = useState("request");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestLoginOtp(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await requestOtp(phoneNumber);
      const suffix = response.development_otp ? ` Development OTP: ${response.development_otp}` : "";
      setMessage(`${response.message}${suffix}`);
      setPhase("verify");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyLoginOtp(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await verifyOtp(phoneNumber, otp);
      window.localStorage.setItem("thean_access_token", response.access_token);
      setMessage(`Welcome back, ${response.user.full_name || response.user.phone_number}.`);
      setOtp("");
      navigate("/home");
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
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            inputMode="tel"
            minLength={8}
            maxLength={15}
            autoComplete="tel"
            disabled={phase === "verify"}
            required
          />
        </label>

        {phase === "verify" && (
          <label>
            OTP
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              inputMode="numeric"
              minLength={6}
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
        )}

        <FormMessage kind="success">{message}</FormMessage>
        <FormMessage kind="error">{error}</FormMessage>

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
