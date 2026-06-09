import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { registerCustomer } from "../lib/api.js";
import { validatePhone, validateEmail, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqName = validateRequired("Full name");

export function RegisterPage() {
  const [form, setForm] = useState({ full_name: "", phone_number: "", email: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  const errors = {
    full_name:    touched.full_name    ? reqName(form.full_name)          : null,
    phone_number: touched.phone_number ? validatePhone(form.phone_number) : null,
    email:        touched.email        ? validateEmail(form.email)        : null,
  };

  async function submit(event) {
    event.preventDefault();
    setTouched({ full_name: true, phone_number: true, email: true });
    if (reqName(form.full_name) || validatePhone(form.phone_number) || validateEmail(form.email)) return;

    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const payload = {
        full_name: form.full_name,
        phone_number: form.phone_number,
        email: form.email || null,
      };
      const user = await registerCustomer(payload);
      setMessage(`Registration created for ${user.phone_number}. You can login now.`);
      setForm({ full_name: "", phone_number: "", email: "" });
      setTouched({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">Customer onboarding</p>
        <h1>Create your Thean account</h1>
        <p>
          Register once and use the same identity for every future web, Android, and iOS flow.
        </p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <label>
          Full name
          <input
            name="full_name"
            value={form.full_name}
            onChange={updateField}
            onBlur={touch(setTouched, "full_name")}
            className={inputClass(touched.full_name, errors.full_name)}
            minLength={2}
            maxLength={100}
            autoComplete="name"
            required
          />
          {errors.full_name && <span className="field-error-msg">{errors.full_name}</span>}
        </label>
        <label>
          Phone number
          <input
            name="phone_number"
            value={form.phone_number}
            onChange={updateField}
            onBlur={touch(setTouched, "phone_number")}
            className={inputClass(touched.phone_number, errors.phone_number)}
            inputMode="tel"
            maxLength={15}
            autoComplete="tel"
            required
          />
          {errors.phone_number && <span className="field-error-msg">{errors.phone_number}</span>}
        </label>
        <label>
          Email <span style={{ fontWeight: 400, fontSize: "0.8em", color: "#6b7280" }}>(optional)</span>
          <input
            name="email"
            value={form.email}
            onChange={updateField}
            onBlur={touch(setTouched, "email")}
            className={inputClass(touched.email, errors.email)}
            type="email"
            maxLength={100}
            autoComplete="email"
          />
          {errors.email && <span className="field-error-msg">{errors.email}</span>}
        </label>

        <FormMessage kind="success">{message}</FormMessage>
        <FormMessage kind="error">{error}</FormMessage>

        <button className="button button-full" type="submit" disabled={isSubmitting}>
          <UserPlus size={18} aria-hidden="true" />
          {isSubmitting ? "Creating account" : "Create account"}
        </button>

        <p className="form-footnote">
          Already registered? <Link to="/login">Login with OTP</Link>
        </p>
      </form>
    </section>
  );
}
