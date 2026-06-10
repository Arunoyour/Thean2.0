import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Power, ShieldAlert } from "lucide-react";

import { PharmacyPageShell } from "../components/PharmacyPageShell.jsx";
import { getCurrentPharmacy, updatePharmacyAvailability } from "../lib/api.js";

export function HomePage() {
  const [pharmacy, setPharmacy] = useState(null);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPharmacy() {
      try {
        const profile = await getCurrentPharmacy();
        if (isMounted) {
          setPharmacy(profile);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPharmacy();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return <PharmacyPageShell><section className="panel">Loading pharmacy profile</section></PharmacyPageShell>;
  }

  if (error) {
    return (
      <PharmacyPageShell>
        <section className="panel">
          <div className="error">{error}</div>
        </section>
      </PharmacyPageShell>
    );
  }

  const isActive = pharmacy.is_active;
  const isOnline = Boolean(pharmacy.profile.is_online);

  async function toggleAvailability() {
    setIsUpdatingAvailability(true);
    setAvailabilityError("");
    try {
      const updatedPharmacy = await updatePharmacyAvailability(!isOnline);
      setPharmacy(updatedPharmacy);
    } catch (requestError) {
      setAvailabilityError(requestError.message);
    } finally {
      setIsUpdatingAvailability(false);
    }
  }

  const profileUpdatedAt = pharmacy.profile.updated_at || pharmacy.updated_at;

  return (
    <PharmacyPageShell>
      <header className="portal-header">
        <div>
          <p className="eyebrow">Merchant workstation</p>
          <h1>{pharmacy.profile.store_name}</h1>
          <p>{pharmacy.profile.address_line_1}</p>
        </div>
      </header>

      <section className={`status-card ${isActive ? "status-active" : "status-pending"}`}>
        {isActive ? <CheckCircle2 size={28} /> : <Clock size={28} />}
        <div>
          <h2>{isActive ? "Active and listed" : "Pending super admin approval"}</h2>
          <p>
            {isActive
              ? "Your pharmacy can be listed for Thean customers."
              : "Registration is complete, but this pharmacy is inactive by default until super admin approval."}
          </p>
        </div>
      </section>

      <section className={`availability-card ${isOnline ? "availability-online" : "availability-offline"}`}>
        <div>
          <p className="eyebrow">Order availability</p>
          <h2>{isOnline ? "Online" : "Offline"}</h2>
          <p>
            {isOnline
              ? "Your pharmacy can receive new medicine orders from nearby customers."
              : "Your pharmacy is hidden from recommendations and cannot receive new customer orders."}
          </p>
          {!isActive && !isUpdatingAvailability && (
            <p className="field-help" style={{ color: "#b45309", marginTop: "0.35rem" }}>
              Availability cannot be changed until super admin approval is granted.
            </p>
          )}
          {availabilityError ? <div className="error">{availabilityError}</div> : null}
        </div>
        <button
          className={isOnline ? "danger-button" : "button"}
          disabled={!isActive || isUpdatingAvailability}
          type="button"
          title={!isActive ? "Requires super admin approval before you can go online" : undefined}
          onClick={toggleAvailability}
        >
          <Power size={18} aria-hidden="true" />
          {isUpdatingAvailability ? "Updating" : isOnline ? "Go Offline" : "Go Online"}
        </button>
      </section>

      <section className="portal-grid">
        <article className="panel">
          <h2>Approval checklist</h2>
          <ul>
            <li>License number: {pharmacy.profile.license_number}</li>
            <li>Owner phone: {pharmacy.phone_number}</li>
            <li>Listing status: {pharmacy.profile.is_listed ? "Listed" : "Not listed"}</li>
            <li>Order availability: {pharmacy.profile.is_online ? "Online" : "Offline"}</li>
          </ul>
          {profileUpdatedAt && (
            <p style={{ fontSize: "0.8em", color: "#9ca3af", marginTop: "0.5rem" }}>
              Profile last updated: {new Date(profileUpdatedAt).toLocaleString()}
            </p>
          )}
        </article>
        <article className="panel">
          <h2>Next controls</h2>
          <div className="notice">
            <ShieldAlert size={20} aria-hidden="true" />
            <span>
              {isActive
                ? "Use the menu to add products or view listed products."
                : "Product listing unlocks only after super admin approval."}
            </span>
          </div>
          <label className="readonly-field">
            Product commission %
            <input value={pharmacy.profile.product_commission_percent} readOnly />
          </label>
        </article>
      </section>
    </PharmacyPageShell>
  );
}
