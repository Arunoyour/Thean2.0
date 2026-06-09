import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Edit3, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { deleteCustomerAddress, listCustomerAddresses } from "../lib/api.js";

export function AddressListPage() {
  const [addresses, setAddresses] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  // addressId → "idle" | "confirm" | "deleting"
  const [deleteState, setDeleteState] = useState({});
  const [deleteError, setDeleteError] = useState("");

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
        if (isMounted) setError(requestError.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadAddresses();
    return () => { isMounted = false; };
  }, []);

  function requestDelete(addressId) {
    setDeleteError("");
    setDeleteState((s) => ({ ...s, [addressId]: "confirm" }));
  }

  function cancelDelete(addressId) {
    setDeleteState((s) => ({ ...s, [addressId]: "idle" }));
  }

  async function confirmDelete(addressId) {
    setDeleteState((s) => ({ ...s, [addressId]: "deleting" }));
    setDeleteError("");
    try {
      await deleteCustomerAddress(addressId);
      setAddresses((prev) => prev.filter((a) => a.address_id !== addressId));
      setDeleteState((s) => { const n = { ...s }; delete n[addressId]; return n; });
    } catch (err) {
      setDeleteError(err.message);
      setDeleteState((s) => ({ ...s, [addressId]: "idle" }));
    }
  }

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
      {deleteError ? <FormMessage kind="error">{deleteError}</FormMessage> : null}

      {!isLoading && !error && addresses.length === 0 ? (
        <div className="home-empty address-empty">
          <AlertCircle size={32} className="address-empty-icon" aria-hidden="true" />
          <p className="address-empty-title">No saved addresses yet</p>
          <p className="address-empty-reason">
            You need at least one saved address to place an order.
          </p>
          <Link className="button" to="/home/address/new">
            <Plus size={18} aria-hidden="true" />
            Add your first address
          </Link>
        </div>
      ) : null}

      {!isLoading && addresses.length > 0 ? (
        <div className="address-list-grid">
          {addresses.map((address) => {
            const state = deleteState[address.address_id] || "idle";
            const isConfirming = state === "confirm";
            const isDeleting   = state === "deleting";

            return (
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

                <div className="address-card-actions">
                  <Link
                    className="button button-secondary address-card-action"
                    to={`/home/address/${address.address_id}/edit`}
                  >
                    <Edit3 size={17} aria-hidden="true" />
                    Edit
                  </Link>

                  {/* Delete — blocked on default address */}
                  {address.is_default ? (
                    <span className="address-delete-blocked" title="Set another address as default before deleting this one">
                      <Trash2 size={16} aria-hidden="true" />
                      Delete
                    </span>
                  ) : isConfirming ? (
                    <div className="address-delete-confirm">
                      <span>Delete &ldquo;{address.label}&rdquo;?</span>
                      <button
                        className="button button-danger address-card-action-sm"
                        type="button"
                        onClick={() => confirmDelete(address.address_id)}
                      >
                        Yes, delete
                      </button>
                      <button
                        className="button button-secondary address-card-action-sm"
                        type="button"
                        onClick={() => cancelDelete(address.address_id)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button-danger-outline address-card-action"
                      type="button"
                      disabled={isDeleting}
                      onClick={() => requestDelete(address.address_id)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {isDeleting ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
