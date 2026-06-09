import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { registerCustomer } from "../lib/api.js";

export function RegisterPage() {
  const [form, setForm] = useState({ full_name: "", phone_number: "", email: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
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
            minLength={2}
            maxLength={100}
            autoComplete="name"
            required
          />
        </label>
        <label>
          Phone number
          <input
            name="phone_number"
            value={form.phone_number}
            onChange={updateField}
            inputMode="tel"
            minLength={8}
            maxLength={15}
            autoComplete="tel"
            required
          />
        </label>
        <label>
          Email
          <input
            name="email"
            value={form.email}
            onChange={updateField}
            type="email"
            maxLength={100}
            autoComplete="email"
          />
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

