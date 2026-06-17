import { Link, Navigate } from "react-router-dom";
import { ArrowRight, MapPin, Smartphone, WalletCards } from "lucide-react";

export function LandingPage() {
  const isAuthenticated = Boolean(window.localStorage.getItem("thean_access_token"));
  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return (
    <section className="landing">
      <div className="landing-copy">
        <p className="eyebrow">Unified local commerce</p>
        <h1>Thean</h1>
        <p className="lead">
          One secure account for pharmacy, fresh produce, print services, wallet payments, and
          location-aware delivery workflows.
        </p>
        <div className="hero-actions">
          <Link className="button" to="/register">
            Start registration <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link className="button button-secondary" to="/login">
            Customer login
          </Link>
        </div>
      </div>

      <div className="service-panel" aria-label="Thean service summary">
        <div className="service-row">
          <span className="service-icon">
            <Smartphone size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Cross-platform ready</h2>
            <p>Same backend contract for web, Android, and iOS clients.</p>
          </div>
        </div>
        <div className="service-row">
          <span className="service-icon">
            <WalletCards size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Wallet-first core</h2>
            <p>Customer identity and wallet rules stay unified across sectors.</p>
          </div>
        </div>
        <div className="service-row">
          <span className="service-icon">
            <MapPin size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Local routing</h2>
            <p>Store discovery and fulfillment are designed around nearby merchants.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

