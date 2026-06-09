import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, LocateFixed, MapPin, Navigation, Save } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { FormMessage } from "../components/FormMessage.jsx";
import { createCustomerAddress, getCustomerAddress, updateCustomerAddress } from "../lib/api.js";
import { validatePhone, validatePincode, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqLabel    = validateRequired("Nick name");
const reqAddr     = validateRequired("House / building / street");
const reqLandmark = validateRequired("Nearby landmark");

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
  const navigate = useNavigate();
  const { addressId } = useParams();
  const isEditMode = Boolean(addressId);
  const [mode, setMode] = useState("");
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [touched, setTouched] = useState({});
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

  useEffect(() => {
    let isMounted = true;

    async function loadAddress() {
      if (!addressId) {
        return;
      }

      try {
        const address = await getCustomerAddress(addressId);
        if (!isMounted) {
          return;
        }

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

    loadAddress();

    return () => {
      isMounted = false;
    };
  }, [addressId]);

  const coordinatesLabel = useMemo(
    () => `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`,
    [position],
  );

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function useCurrentLocation() {
    setError("");
    setStatusMessage("");

    if (!navigator.geolocation) {
      setError("Location is not available in this browser. Choose the map option instead.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (location) => {
        setPosition([location.coords.latitude, location.coords.longitude]);
        setMode("CURRENT_LOCATION");
        setStatusMessage("Current location captured. Complete the address details below.");
        setIsLocating(false);
      },
      () => {
        setError("Unable to capture current location. Please allow location access or choose on map.");
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  }

  function chooseMapMode() {
    setMode("MAP_PIN");
    setStatusMessage("Tap the map to place the delivery pin.");
    setError("");
  }

  const fieldErrors = {
    label:    touched.label    ? reqLabel(form.label)                              : null,
    pincode:  touched.pincode  ? validatePincode(form.pincode)                     : null,
    address:  touched.address  ? reqAddr(form.address_line_1)                      : null,
    landmark: touched.landmark ? reqLandmark(form.landmark)                        : null,
    sec_phone: touched.sec_phone
      ? (form.secondary_phone_number ? validatePhone(form.secondary_phone_number) : null)
      : null,
  };

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
      (form.secondary_phone_number ? validatePhone(form.secondary_phone_number) : null)
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
                <span>{isLocating ? "Capturing location" : "Yes, use my current location"}</span>
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

            {mode === "MAP_PIN" ? (
              <div className="address-map-shell">
                <MapContainer center={position} zoom={13} scrollWheelZoom className="address-map">
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter position={position} />
                <MapPicker position={position} onChange={setPosition} />
              </MapContainer>
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
              Secondary mobile number
              <input
                inputMode="tel"
                value={form.secondary_phone_number}
                onChange={(event) => updateField("secondary_phone_number", event.target.value)}
                onBlur={touch(setTouched, "sec_phone")}
                className={inputClass(touched.sec_phone, fieldErrors.sec_phone)}
                placeholder="Optional, cannot be your registered number"
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
