import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createShop, updateShop, getMyShop } from "../lib/api.js";

export function ShopSetupPage({ mode = "create" }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ shop_name: "", phone: "", total_chairs: 1, address_line: "", lat: "", lng: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(mode === "edit");
  const [locating, setLocating] = useState(false);

  function autoLocate() {
    if (!navigator.geolocation) { setError("Geolocation not supported."); return; }
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          lat: pos.coords.latitude.toFixed(7),
          lng: pos.coords.longitude.toFixed(7),
        }));
        setLocating(false);
      },
      () => { setError("Could not fetch location. Allow location access and try again."); setLocating(false); },
    );
  }

  useEffect(() => {
    if (mode !== "edit") return;
    setFetching(true);
    getMyShop()
      .then(shop => setForm({
        shop_name: shop.shop_name || "",
        phone: shop.phone || "",
        total_chairs: shop.total_chairs || 1,
        address_line: shop.address_line || "",
        lat: shop.lat ?? "",
        lng: shop.lng ?? "",
      }))
      .catch(err => setError(err.message))
      .finally(() => setFetching(false));
  }, [mode]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.shop_name.trim()) { setError("Shop name is required."); return; }
    if (form.total_chairs < 1 || form.total_chairs > 15) { setError("Number of chairs must be between 1 and 15."); return; }

    setLoading(true);
    const payload = {
      shop_name: form.shop_name.trim(),
      phone: form.phone.trim() || null,
      total_chairs: Number(form.total_chairs),
      address_line: form.address_line.trim() || null,
      lat: form.lat !== "" ? Number(form.lat) : null,
      lng: form.lng !== "" ? Number(form.lng) : null,
    };
    try {
      if (mode === "create") {
        await createShop(payload);
        navigate("/hours/setup");
      } else {
        await updateShop(payload);
        setSuccess("Shop updated.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (fetching) return <div style={{ padding: 32, textAlign: "center", color: "#52625f" }}>Loading…</div>;

  return (
    <div className="hc-page">
      <div className="hc-topbar">
        <h2>{mode === "create" ? "Shop Setup" : "Edit Shop"}</h2>
      </div>
      <div className="hc-content">
        {error && <div className="hc-error">{error}</div>}
        {success && <div className="hc-success">{success}</div>}

        <form className="hc-form" onSubmit={handleSubmit} noValidate>
          <label>Shop Name *<input value={form.shop_name} onChange={set("shop_name")} /></label>
          <label>Shop Phone<input type="tel" value={form.phone} onChange={set("phone")} /></label>
          <label>
            Number of Chairs * <span className="field-hint">(1–15)</span>
            <input type="number" min={1} max={15} value={form.total_chairs} onChange={set("total_chairs")} />
          </label>
          <label>Address<textarea value={form.address_line} onChange={set("address_line")} /></label>
          <label>
            Shop Location *
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                readOnly
                value={form.lat && form.lng ? `${parseFloat(form.lat).toFixed(5)}, ${parseFloat(form.lng).toFixed(5)}` : ""}
                placeholder="Not set — tap Detect Location"
                style={{ flex: 1 }}
              />
              <button type="button" className="hc-btn hc-btn-secondary hc-btn-sm" onClick={autoLocate} disabled={locating}>
                {locating ? "…" : "📍 Detect"}
              </button>
            </div>
          </label>
          <button className="hc-btn hc-btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving…" : mode === "create" ? "Save & Continue" : "Update Shop"}
          </button>
        </form>
      </div>
    </div>
  );
}
