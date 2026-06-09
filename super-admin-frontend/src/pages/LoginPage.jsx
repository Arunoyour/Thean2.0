import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";

import { requestOtp, verifyOtp } from "../lib/api.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("9539536943");
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
        <div className="brand-row">
          <span className="brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
          <strong>Thean Super Admin</strong>
        </div>

        <label>
          Mobile number
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            inputMode="tel"
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
              maxLength={6}
              required
            />
          </label>
        )}

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        <button className="button" type="submit" disabled={isSubmitting}>
          <KeyRound size={18} aria-hidden="true" />
          {isSubmitting ? "Working" : phase === "request" ? "Send OTP" : "Verify OTP"}
        </button>
      </form>
    </main>
  );
}

