import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Check, LocateFixed, MapPin, Navigation, Save } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { FormMessage } from "../components/FormMessage.jsx";
import { createCustomerAddress, getCurrentUser, getCustomerAddress, updateCustomerAddress } from "../lib/api.js";
import { validatePhone, validatePincode, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqLabel    = validateRequired("Nick name");
const reqAddr     = validateRequired("House / building / street");
const reqLandmark = validateRequired("Nearby landmark");

// GPS accuracy threshold — warn if worse than this
const ACCURACY_WARN_METRES = 100;

const DEFAULT_POSITION = [10.8505, 76.2711];

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapPicker({ position, onChange }) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng]);
    },
  });
  return <Marker icon={markerIcon} position={position} />;
}

function MapRecenter({ position }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom());
  }, [map, position]);
  return null;
}

export function AddressPage() {
  const navigate   = useNavigate();
  const { addressId } = useParams();
  const isEditMode = Boolean(addressId);

  const [mode, setMode]             = useState("");
  const [position, setPosition]     = useState(DEFAULT_POSITION);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError]           = useState("");          // general / submit errors
  const [gpsError, setGpsError]     = useState("");          // persistent GPS error
  const [locationAccuracy, setLocationAccuracy] = useState(null); // metres from GPS
  const [mapTilesError, setMapTilesError] = useState(false); // tile load failure
  const [isLoading, setIsLoading]   = useState(isEditMode);
  const [isSaving, setIsSaving]     = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [touched, setTouched]       = useState({});
  const [primaryPhone, setPrimaryPhone] = useState("");      // registered phone for dup check
  const [form, setForm] = useState({
    label: "",
    address_line_1: "",
    apartment_floor_gate: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    secondary_phone_number: "",
    is_default: false,
  });

  // ── Load user phone + address (if edit) on mount ────────────────
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // Always fetch the logged-in user so we can compare secondary phone
        const userPromise = getCurrentUser().then((u) => {
          if (isMounted) setPrimaryPhone(u.phone_number || "");
        });

        const addressPromise = addressId
          ? getCustomerAddress(addressId).then((address) => {
              if (!isMounted) return;
              setForm({
                label: address.label || "",
                address_line_1: address.address_line_1 || "",
                apartment_floor_gate: address.apartment_floor_gate || "",
                landmark: address.landmark || "",
                city: address.city || "",
                state: address.state || "",
                pincode: address.pincode || "",
                secondary_phone_number: address.secondary_phone_number || "",
                is_default: Boolean(address.is_default),
              });
              setPosition([address.latitude, address.longitude]);
              setMode(address.location_capture_method || "MAP_PIN");
            })
          : Promise.resolve();

        await Promise.all([userPromise, addressPromise]);
      } catch (requestError) {
        if (isMounted) setError(requestError.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [addressId]);

  const coordinatesLabel = useMemo(
    () => `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`,
    [position],
  );

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function useCurrentLocation() {
    setGpsError("");
    setStatusMessage("");
    setLocationAccuracy(null);

    if (!navigator.geolocation) {
      setGpsError("Location is not available in this browser. Choose the map option instead.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (location) => {
        const accuracy = location.coords.accuracy;
        setPosition([location.coords.latitude, location.coords.longitude]);
        setLocationAccuracy(accuracy);
        setMode("CURRENT_LOCATION");
        setGpsError(""); // success — clear any previous GPS error
        if (accuracy > ACCURACY_WARN_METRES) {
          setStatusMessage(
            `Location captured (accuracy: ${Math.round(accuracy)} m). Low accuracy — consider using the map for a more precise pin.`,
          );
        } else {
          setStatusMessage(`Location captured (accuracy: ${Math.round(accuracy)} m). Complete the address details below.`);
        }
        setIsLocating(false);
      },
      () => {
        // Error persists until user picks a location method
        setGpsError(
          "Location access was denied or failed. Allow location permission in your browser or choose on the map below.",
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  function chooseMapMode() {
    setMode("MAP_PIN");
    setStatusMessage("Tap the map to place the delivery pin.");
    setGpsError(""); // user picked an alternative — clear GPS error
    setError("");
  }

  // ── Secondary phone: normalise digits for comparison ────────────
  function normPhone(v) {
    return (v || "").replace(/[\s\-+() ]/g, "");
  }

  function validateSecPhone(v) {
    if (!v) return null; // optional
    const phoneErr = validatePhone(v);
    if (phoneErr) return phoneErr;
    if (primaryPhone && normPhone(v) === normPhone(primaryPhone)) {
      return "Secondary number cannot be the same as your registered number";
    }
    return null;
  }

  const fieldErrors = {
    label:     touched.label     ? reqLabel(form.label)              : null,
    pincode:   touched.pincode   ? validatePincode(form.pincode)     : null,
    address:   touched.address   ? reqAddr(form.address_line_1)      : null,
    landmark:  touched.landmark  ? reqLandmark(form.landmark)        : null,
    sec_phone: touched.sec_phone ? validateSecPhone(form.secondary_phone_number) : null,
  };

  // Amber warning for low-accuracy GPS
  const accuracyWarn =
    locationAccuracy !== null && locationAccuracy > ACCURACY_WARN_METRES
      ? `Low GPS accuracy (${Math.round(locationAccuracy)} m). For a more precise pin, switch to the map.`
      : null;

  async function submitAddress(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    setTouched({ label: true, pincode: true, address: true, landmark: true, sec_phone: true });
    if (
      reqLabel(form.label) ||
      validatePincode(form.pincode) ||
      reqAddr(form.address_line_1) ||
      reqLandmark(form.landmark) ||
      validateSecPhone(form.secondary_phone_number)
    ) return;

    if (!mode) {
      setError("Tell us whether you are at the location now or choose it on the map.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...form,
        latitude: position[0],
        longitude: position[1],
        location_capture_method: mode,
        secondary_phone_number: form.secondary_phone_number || null,
      };
      if (isEditMode) {
        await updateCustomerAddress(addressId, payload);
      } else {
        await createCustomerAddress(payload);
      }
      navigate("/home/addresses");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="address-layout">
      <div className="address-header">
        <div>
          <p className="eyebrow">Customer address</p>
          <h1>{isEditMode ? "Edit delivery address" : "Add delivery address"}</h1>
          <p>
            This address is saved to your Thean customer profile and can be reused across pharmacy,
            vegetables, print shop, and future sectors.
          </p>
        </div>
        <Link className="button button-secondary" to="/home/addresses">
          Saved addresses
        </Link>
      </div>

      {isLoading ? (
        <div className="home-loading">Loading address</div>
      ) : null}

      {!isLoading ? (
        <form className="address-form" onSubmit={submitAddress}>
          <div className="address-panel">
            <h2>Address details</h2>
            <div className="address-location-block">
              <p className="field-hint">Are you currently at this delivery location?</p>
              <div className="location-choice-grid">
                <button
                  className={`location-choice ${mode === "CURRENT_LOCATION" ? "location-choice-active" : ""}`}
                  type="button"
                  onClick={useCurrentLocation}
                  disabled={isLocating}
                >
                  <LocateFixed size={22} aria-hidden="true" />
                  <span>{isLocating ? "Capturing location…" : "Yes, use my current location"}</span>
                </button>
                <button
                  className={`location-choice ${mode === "MAP_PIN" ? "location-choice-active" : ""}`}
                  type="button"
                  onClick={chooseMapMode}
                >
                  <MapPin size={22} aria-hidden="true" />
                  <span>No, I will point it on map</span>
                </button>
              </div>

              {/* Persistent GPS error — clears only when user picks a method */}
              {gpsError ? (
                <div className="address-gps-error">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>{gpsError}</span>
                </div>
              ) : null}

              {/* Accuracy warning — amber, non-blocking */}
              {!gpsError && accuracyWarn ? (
                <div className="address-accuracy-warn">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>{accuracyWarn}</span>
                </div>
              ) : null}

              {mode === "MAP_PIN" ? (
                <div className="address-map-shell">
                  {mapTilesError ? (
                    /* ── Map tile failure fallback ── */
                    <div className="address-map-fallback">
                      <MapPin size={36} className="address-map-fallback-icon" aria-hidden="true" />
                      <p className="address-map-fallback-msg">
                        Map tiles could not be loaded. Check your internet connection.
                      </p>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={useCurrentLocation}
                        disabled={isLocating}
                      >
                        <LocateFixed size={16} aria-hidden="true" />
                        {isLocating ? "Capturing…" : "Use current location instead"}
                      </button>
                    </div>
                  ) : (
                    <MapContainer center={position} zoom={13} scrollWheelZoom className="address-map">
                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        eventHandlers={{ tileerror: () => setMapTilesError(true) }}
                      />
                      <MapRecenter position={position} />
                      <MapPicker position={position} onChange={setPosition} />
                    </MapContainer>
                  )}
                </div>
              ) : null}

              <div className="selected-coordinate">
                <Navigation size={18} aria-hidden="true" />
                <span>{coordinatesLabel}</span>
              </div>
            </div>

            <div className="address-fields-grid">
              <label>
                Nick name
                <input
                  required
                  value={form.label}
                  onChange={(event) => updateField("label", event.target.value)}
                  onBlur={touch(setTouched, "label")}
                  className={inputClass(touched.label, fieldErrors.label)}
                  placeholder="Home, Work, Parents"
                />
                {fieldErrors.label && <span className="field-error-msg">{fieldErrors.label}</span>}
              </label>
              <label>
                Pincode
                <input
                  required
                  inputMode="numeric"
                  value={form.pincode}
                  onChange={(event) => updateField("pincode", event.target.value)}
                  onBlur={touch(setTouched, "pincode")}
                  className={inputClass(touched.pincode, fieldErrors.pincode)}
                  placeholder="682001"
                />
                {fieldErrors.pincode && <span className="field-error-msg">{fieldErrors.pincode}</span>}
              </label>
              <label className="address-field-wide">
                House / building / street
                <textarea
                  required
                  rows="3"
                  value={form.address_line_1}
                  onChange={(event) => updateField("address_line_1", event.target.value)}
                  onBlur={touch(setTouched, "address")}
                  className={inputClass(touched.address, fieldErrors.address)}
                  placeholder="Building name, road, area"
                />
                {fieldErrors.address && <span className="field-error-msg">{fieldErrors.address}</span>}
              </label>
              <label>
                Apartment / floor / gate
                <input
                  value={form.apartment_floor_gate}
                  onChange={(event) => updateField("apartment_floor_gate", event.target.value)}
                  placeholder="Flat 4B, second floor"
                />
              </label>
              <label>
                Nearby landmark
                <input
                  required
                  value={form.landmark}
                  onChange={(event) => updateField("landmark", event.target.value)}
                  onBlur={touch(setTouched, "landmark")}
                  className={inputClass(touched.landmark, fieldErrors.landmark)}
                  placeholder="Near metro station"
                />
                {fieldErrors.landmark && <span className="field-error-msg">{fieldErrors.landmark}</span>}
              </label>
              <label>
                City
                <input
                  value={form.city}
                  onChange={(event) => updateField("city", event.target.value)}
                  placeholder="Kochi"
                />
              </label>
              <label>
                State
                <input
                  value={form.state}
                  onChange={(event) => updateField("state", event.target.value)}
                  placeholder="Kerala"
                />
              </label>
              <label className="address-field-wide">
                Secondary mobile number{" "}
                <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#6b7280" }}>(optional)</span>
                <input
                  inputMode="tel"
                  value={form.secondary_phone_number}
                  onChange={(event) => updateField("secondary_phone_number", event.target.value)}
                  onBlur={touch(setTouched, "sec_phone")}
                  className={inputClass(touched.sec_phone, fieldErrors.sec_phone)}
                  placeholder="e.g. 9876543210 — must differ from your registered number"
                />
                {fieldErrors.sec_phone && <span className="field-error-msg">{fieldErrors.sec_phone}</span>}
              </label>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(event) => updateField("is_default", event.target.checked)}
              />
              <span>Make this my default address</span>
            </label>

            {error ? <FormMessage kind="error">{error}</FormMessage> : null}
            {statusMessage ? <FormMessage kind="success">{statusMessage}</FormMessage> : null}

            <button className="button address-submit" type="submit" disabled={isSaving}>
              {isSaving ? <Check size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
              {isSaving ? "Saving" : isEditMode ? "Update address" : "Save address"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
