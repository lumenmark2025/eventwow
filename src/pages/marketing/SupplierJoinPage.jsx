import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";
import { getSiteOrigin } from "../../lib/siteUrl";

function toSignupMessage(resp, json) {
  const rawDetails = String(json?.details || "").trim();
  const rawError = String(json?.error || "").trim();
  const combined = `${rawError} ${rawDetails}`.toLowerCase();
  const requestId = json?.request_id ? ` (ref: ${json.request_id})` : "";

  if (
    combined.includes("already") ||
    combined.includes("registered") ||
    combined.includes("user already")
  ) {
    return `This email already has an account - please log in or reset your password.${requestId}`;
  }
  if (combined.includes("valid email is required")) {
    return `Please enter a valid email address.${requestId}`;
  }
  if (combined.includes("business name is required")) {
    return `Please enter your business name.${requestId}`;
  }
  if (combined.includes("password")) {
    return `Please provide a valid password (at least 8 characters).${requestId}`;
  }
  if (resp.status >= 500) {
    return `Couldn't create account. Please try again or contact support.${requestId}`;
  }
  return rawDetails || rawError || `Failed to start signup${requestId}`;
}

function validateSignupForm(current) {
  const errors = {};
  const email = String(current.email || "").trim();
  const businessName = String(current.business_name || "").trim();
  const password = String(current.password || "");
  const confirmPassword = String(current.confirm_password || "");

  if (!email) errors.email = "Email is required.";
  if (!businessName) errors.business_name = "Business name is required.";
  if (password.length < 8)
    errors.password = "Password must be at least 8 characters.";
  if (confirmPassword !== password)
    errors.confirm_password = "Passwords do not match.";

  return errors;
}

export default function SupplierJoinPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    email: "",
    business_name: "",
    location_label: "",
    phone: "",
    website_url: "",
    password: "",
    confirm_password: "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.email) {
        setForm((prev) => ({
          ...prev,
          email: prev.email || data.session.user.email,
        }));
      }
    });
  }, []);

  const computedErrors = useMemo(() => validateSignupForm(form), [form]);
  const isInvalid = Object.keys(computedErrors).length > 0;

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  }

  async function submit(e) {
    e.preventDefault();
    const errors = validateSignupForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (import.meta.env.DEV) {
        console.debug("[supplier-signup] submit", {
          email: form.email ? "<provided>" : "<missing>",
          business_name: form.business_name ? "<provided>" : "<missing>",
          has_password: !!form.password,
          has_confirm_password: !!form.confirm_password,
        });
      }

      const resp = await fetch("/api/public/suppliers/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          business_name: form.business_name,
          location_label: form.location_label,
          phone: form.phone,
          website_url: form.website_url,
          password: form.password,
        }),
      });

      const rawText = await resp.text();
      let json = {};
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch {
        json = {};
      }

      if (import.meta.env.DEV) {
        console.debug("[supplier-signup] response", {
          status: resp.status,
          ok: resp.ok,
          json,
          rawTextPreview: rawText?.slice?.(0, 300) || "",
        });
      }

      if (!resp.ok) throw new Error(toSignupMessage(resp, json));

      if (json?.existing_account) {
        setError("This email already has an account - please log in.");
        return;
      }

      const signInResp = await supabase.auth.signInWithPassword({
        email: String(form.email || "").trim(),
        password: String(form.password || ""),
      });

      if (signInResp.error) {
        if (import.meta.env.DEV) {
          console.debug("[supplier-signup] signInWithPassword error", {
            message: signInResp.error.message,
            status: signInResp.error.status || null,
          });
        }
        setSuccess("Account created. Please log in to continue.");
        navigate("/login?returnTo=%2Fsupplier%2Fdashboard");
        return;
      }

      if (import.meta.env.DEV) {
        console.debug("[supplier-signup] signInWithPassword success", {
          user_id: signInResp.data?.user?.id || null,
          origin: getSiteOrigin() || window.location.origin,
        });
      }

      setSuccess("Account created. Redirecting to your supplier dashboard...");
      navigate("/supplier/dashboard", { replace: true });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.debug("[supplier-signup] error", {
          message: err?.message || String(err),
        });
      }
      setError(err?.message || "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      wide
      title="Join Eventwow as a supplier"
      subtitle="Create your supplier account and get 25 free credits to start quoting."
    >
      {success ? (
        <div className="space-y-4">
          <p role="status" className="auth-body auth-success">
            {success}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => navigate("/login")}>
              Go to login
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSuccess("")}
            >
              Submit another email
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          onSubmit={submit}
        >
          <div className="space-y-1 md:col-span-2">
            <label
              htmlFor="auth-email"
              className="auth-body font-medium auth-ink"
            >
              Login email *
            </label>
            <Input
              id="auth-email"
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              required
            />
            {fieldErrors.email ? (
              <p role="alert" className="auth-small auth-error">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-business_name"
              className="auth-body font-medium auth-ink"
            >
              Business name *
            </label>
            <Input
              id="auth-business_name"
              value={form.business_name}
              onChange={(e) => setField("business_name", e.target.value)}
              required
            />
            {fieldErrors.business_name ? (
              <p role="alert" className="auth-small auth-error">
                {fieldErrors.business_name}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-location_label"
              className="auth-body font-medium auth-ink"
            >
              Location label
            </label>
            <Input
              id="auth-location_label"
              value={form.location_label}
              onChange={(e) => setField("location_label", e.target.value)}
              placeholder="e.g. Manchester & North West"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-password"
              className="auth-body font-medium auth-ink"
            >
              Password *
            </label>
            <Input
              id="auth-password"
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              required
              minLength={8}
            />
            {fieldErrors.password ? (
              <p role="alert" className="auth-small auth-error">
                {fieldErrors.password}
              </p>
            ) : (
              <p className="auth-small auth-muted">Minimum 8 characters.</p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-confirm_password"
              className="auth-body font-medium auth-ink"
            >
              Confirm password *
            </label>
            <Input
              id="auth-confirm_password"
              type="password"
              value={form.confirm_password}
              onChange={(e) => setField("confirm_password", e.target.value)}
              required
              minLength={8}
            />
            {fieldErrors.confirm_password ? (
              <p role="alert" className="auth-small auth-error">
                {fieldErrors.confirm_password}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-phone"
              className="auth-body font-medium auth-ink"
            >
              Phone
            </label>
            <Input
              id="auth-phone"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-website_url"
              className="auth-body font-medium auth-ink"
            >
              Website URL
            </label>
            <Input
              id="auth-website_url"
              value={form.website_url}
              onChange={(e) => setField("website_url", e.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="auth-body auth-error md:col-span-2">
              {error}
            </p>
          ) : null}

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || isInvalid}>
              {busy ? "Starting signup..." : "Create supplier account"}
            </Button>
            <Link to="/login" className="auth-body auth-muted underline">
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
