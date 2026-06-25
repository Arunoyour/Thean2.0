import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { vendorRequestOtp, vendorVerifyOtp, saveToken } from "../lib/api.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const fullPhone = `+91${phone}`;
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [mockOtp, setMockOtp] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp(e) {
    e.preventDefault();
    if (!phone.trim()) { setError("Enter your phone number."); return; }
    setError(""); setLoading(true);
    try {
      const res = await vendorRequestOtp(fullPhone);
      setOtpSent(true);
      if (res.otp) setMockOtp(res.otp); // dev only
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (otp.length !== 6) { setError("Enter the 6-digit OTP."); return; }
    setError(""); setLoading(true);
    try {
      const data = await vendorVerifyOtp(fullPhone, otp.trim());
      saveToken(data.access_token);
      navigate("/home");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hc-auth-page">
      <div className="hc-auth-card">
        <div className="hc-brand">
          <span className="hc-brand-icon">✂️</span>
          <h1>Thean Haircut</h1>
        </div>

        {error && <div className="hc-error">{error}</div>}
        {mockOtp && (
          <div className="hc-success">
            Dev OTP: <strong style={{ letterSpacing: 4 }}>{mockOtp}</strong>
          </div>
        )}

        {!otpSent ? (
          <form className="hc-form" onSubmit={handleRequestOtp} noValidate>
            <h2>Vendor Login</h2>
            <label>
              Phone Number *
              <div className="phone-input-wrapper">
                <span className="phone-prefix">🇮🇳 +91</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="9876543210"
                  maxLength={10}
                  autoFocus
                />
              </div>
            </label>
            <button className="hc-btn hc-btn-primary" type="submit" disabled={loading}>
              {loading ? "Sending OTP…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form className="hc-form" onSubmit={handleVerifyOtp} noValidate>
            <h2>Enter OTP</h2>
            <p style={{ fontSize: "0.85rem", color: "#52625f" }}>
              OTP sent to <strong style={{ color: "#13201e" }}>+91 {phone}</strong>
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
              {loading ? "Verifying…" : "Verify & Login"}
            </button>
            <button
              type="button"
              className="hc-link"
              onClick={() => { setOtpSent(false); setOtp(""); setMockOtp(null); setError(""); }}
            >
              ← Change number
            </button>
          </form>
        )}

        <p style={{ fontSize: "0.88rem", color: "#52625f", textAlign: "center" }}>
          New vendor?{" "}
          <Link to="/register" style={{ color: "var(--teal)" }}>Register here</Link>
        </p>
      </div>
    </div>
  );
}
