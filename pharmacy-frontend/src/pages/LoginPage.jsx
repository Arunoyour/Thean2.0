import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Send } from "lucide-react";

import { requestPharmacyOtp, verifyPharmacyOtp } from "../lib/api.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [phase, setPhase] = useState("request");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestOtp(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await requestPharmacyOtp(phoneNumber);
      const suffix = response.development_otp ? ` Development OTP: ${response.development_otp}` : "";
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
    setError("");
    setMessage("");
    setIsSubmitting(true);

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
        <label>
          Phone number
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
          {phase === "request" ? <Send size={18} /> : <KeyRound size={18} />}
          {isSubmitting ? "Working" : phase === "request" ? "Send OTP" : "Verify OTP"}
        </button>

        <p className="footnote">
          New pharmacy? <Link to="/register">Register now</Link>
        </p>
      </form>
    </main>
  );
}

