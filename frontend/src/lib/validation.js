// Shared field validators — return null on valid, error string on invalid.

export function validatePhone(v) {
  const digits = (v || "").replace(/[\s\-+() ]/g, "");
  if (!digits) return "Phone number is required";
  if (!/^\d+$/.test(digits)) return "Phone number must contain digits only";
  if (digits.length < 8 || digits.length > 15) return "Phone number must be 8–15 digits";
  return null;
}

export function validateOtp(v) {
  if (!v) return "OTP is required";
  if (!/^\d{6}$/.test(v)) return "OTP must be exactly 6 digits";
  return null;
}

export function validateEmail(v) {
  if (!v || !v.trim()) return null; // optional field
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return "Enter a valid email address";
  return null;
}

export function validateRequired(label) {
  return (v) => {
    if (!v || !v.toString().trim()) return `${label} is required`;
    return null;
  };
}

export function validatePositiveNumber(label) {
  return (v) => {
    if (v === "" || v === null || v === undefined) return `${label} is required`;
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return `${label} must be a positive number`;
    return null;
  };
}

export function validateNonNegativeNumber(label) {
  return (v) => {
    if (v === "" || v === null || v === undefined) return `${label} is required`;
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) return `${label} must be 0 or more`;
    return null;
  };
}

export function validateOfferPrice(basePriceGetter) {
  return (v) => {
    if (!v && v !== 0) return null; // optional
    const offer = parseFloat(v);
    if (isNaN(offer) || offer <= 0) return "Offer price must be a positive number";
    const base = parseFloat(basePriceGetter());
    if (!isNaN(base) && base > 0 && offer >= base) return "Offer price must be less than the base price";
    return null;
  };
}

export function validatePincode(v) {
  if (!v) return "Pincode is required";
  if (!/^[1-9][0-9]{5}$/.test(v.trim())) return "Enter a valid 6-digit pincode";
  return null;
}

/** Helper — call in onBlur to mark a field touched */
export function touch(setTouched, name) {
  return () => setTouched((t) => ({ ...t, [name]: true }));
}

/** Helper — compute className for an input given touched + error */
export function inputClass(touched, error, extra = "") {
  if (!touched) return extra;
  return `${extra} ${error ? "input-error" : "input-valid"}`.trim();
}
