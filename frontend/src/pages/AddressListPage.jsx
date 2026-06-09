import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Edit3, MapPin, Plus, RefreshCw } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { listCustomerAddresses } from "../lib/api.js";

export function AddressListPage() {
  const [addresses, setAddresses] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadAddresses() {
      try {
        const response = await listCustomerAddresses();
        if (isMounted) {
          setAddresses(response);
          setError("");
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

    loadAddresses();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="address-layout">
      <div className="address-header">
        <div>
          <p className="eyebrow">Address book</p>
          <h1>Saved addresses</h1>
          <p>Manage the delivery locations shared across every Thean sector.</p>
        </div>
        <Link className="button" to="/home/address/new">
          <Plus size={18} aria-hidden="true" />
          Add address
        </Link>
      </div>

      {isLoading ? (
        <div className="home-loading">
          <RefreshCw size={18} aria-hidden="true" />
          Loading addresses
        </div>
      ) : null}

      {error ? <FormMessage kind="error">{error}</FormMessage> : null}

      {!isLoading && !error && addresses.length === 0 ? (
        <div className="home-empty">
          <p>No saved address yet.</p>
          <Link className="button" to="/home/address/new">
            Add address
          </Link>
        </div>
      ) : null}

      {!isLoading && addresses.length > 0 ? (
        <div className="address-list-grid">
          {addresses.map((address) => (
            <article className="address-card" key={address.address_id}>
              <div className="address-card-header">
                <span className="service-icon">
                  <MapPin size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2>{address.label}</h2>
                  {address.is_default ? <span className="default-badge">Default</span> : null}
                </div>
              </div>

              <p>{address.address_line_1}</p>
              <dl className="address-meta">
                <div>
                  <dt>Landmark</dt>
                  <dd>{address.landmark}</dd>
                </div>
                <div>
                  <dt>Pincode</dt>
                  <dd>{address.pincode}</dd>
                </div>
                <div>
                  <dt>City</dt>
                  <dd>{address.city || "Not added"}</dd>
                </div>
                <div>
                  <dt>Secondary number</dt>
                  <dd>{address.secondary_phone_number || "Not added"}</dd>
                </div>
              </dl>

              <Link className="button button-secondary address-card-action" to={`/home/address/${address.address_id}/edit`}>
                <Edit3 size={17} aria-hidden="true" />
                Edit
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
