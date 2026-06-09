import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, UserPlus } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { registerCustomer } from "../lib/api.js";
import { validatePhone, validateEmail, validateRequired, inputClass, touch } from "../lib/validation.js";

const reqName = validateRequired("Full name");

export function RegisterPage() {
  const [form, setForm] = useState({ full_name: "", phone_number: "", email: "" });
  const [registeredPhone, setRegisteredPhone] = useState("");
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
    setIsSubmitting(true);

    try {
      const user = await registerCustomer({
        full_name: form.full_name,
        phone_number: form.phone_number,
        email: form.email || null,
      });
      setRegisteredPhone(user.phone_number);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Success state — hide the form entirely ──────────────────────
  if (registeredPhone) {
    return (
      <section className="auth-layout">
        <div className="auth-intro">
          <p className="eyebrow">Customer onboarding</p>
          <h1>Create your Thean account</h1>
          <p>
            Register once and use the same identity for every future web, Android, and iOS flow.
          </p>
        </div>

        <div className="auth-form register-success-card">
          <CheckCircle2 size={48} className="register-success-icon" aria-hidden="true" />
          <h2 className="register-success-title">Account created!</h2>
          <p className="register-success-body">
            Your Thean account for <strong>{registeredPhone}</strong> is ready.
            Use your phone number and OTP to log in.
          </p>
          <Link className="button button-full" to="/login">
            Go to Login
          </Link>
          <button
            className="text-button"
            type="button"
            style={{ marginTop: 4, textAlign: "center" }}
            onClick={() => {
              setRegisteredPhone("");
              setForm({ full_name: "", phone_number: "", email: "" });
              setTouched({});
            }}
          >
            Register another account
          </button>
        </div>
      </section>
    );
  }

  // ── Form state ──────────────────────────────────────────────────
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
          {errors.email
            ? <span className="field-error-msg">{errors.email}</span>
            : <span className="field-hint-msg">e.g. name@example.com</span>
          }
        </label>

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
