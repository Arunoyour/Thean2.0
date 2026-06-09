import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bike, ChevronRight } from "lucide-react";
import { requestDeliveryOtp, verifyDeliveryOtp } from "../lib/api.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1); // 1=phone, 2=otp
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpHint, setOtpHint] = useState("");

  async function requestOtp(e) {
    e.preventDefault();
    setError(""); setIsLoading(true);
    try {
      const resp = await requestDeliveryOtp(phone);
      if (resp.otp) setOtpHint(`Dev OTP: ${resp.otp}`);
      setStep(2);
    } catch (err) { setError(err.message); } finally { setIsLoading(false); }
  }

  async function verifyOtp(e) {
    e.preventDefault();
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

        {error ? <div className="dl-error">{error}</div> : null}
        {otpHint ? <div className="dl-otp-hint">{otpHint}</div> : null}

        {step === 1 ? (
          <form onSubmit={requestOtp} className="dl-form">
            <h2>Login to your account</h2>
            <label>
              Phone Number
              <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" autoFocus />
            </label>
            <button className="dl-btn" type="submit" disabled={isLoading}>
              {isLoading ? "Sending OTP…" : "Send OTP"} <ChevronRight size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="dl-form">
            <h2>Enter OTP</h2>
            <p className="dl-hint">Sent to <strong>{phone}</strong>. <button type="button" className="dl-text-btn" onClick={() => setStep(1)}>Change</button></p>
            <label>
              6-digit OTP
              <input type="text" required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" autoFocus />
            </label>
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
