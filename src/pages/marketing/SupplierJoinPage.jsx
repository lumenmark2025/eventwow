import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";

function toSignupMessage(resp, json) {
  const rawDetails = String(json?.details || "").trim();
  const rawError = String(json?.error || "").trim();
  const combined = `${rawError} ${rawDetails}`.toLowerCase();
  const requestId = json?.request_id ? ` (ref: ${json.request_id})` : "";

  if (combined.includes("already") || combined.includes("registered") || combined.includes("user already")) {
    return `This email already has an account - please log in or reset your password.${requestId}`;
  }
  if (combined.includes("valid email is required")) {
    return `Please enter a valid email address.${requestId}`;
  }
  if (combined.includes("business name is required")) {
    return `Please enter your business name.${requestId}`;
  }
  if (resp.status >= 500) {
    return `Couldn't create account. Please try again or contact support.${requestId}`;
  }
  return rawDetails || rawError || `Failed to start signup${requestId}`;
}

export default function SupplierJoinPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    email: "",
    business_name: "",
    location_label: "",
    phone: "",
    website_url: "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.email) {
        setForm((prev) => ({ ...prev, email: prev.email || data.session.user.email }));
      }
    });
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const resp = await fetch("/api/public/suppliers/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          business_name: form.business_name,
          location_label: form.location_label,
          phone: form.phone,
          website_url: form.website_url,
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
      setSuccess(json?.message || "Check your email to continue.");
    } catch (err) {
      setError(err?.message || "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Join Eventwow as a supplier</h1>
          <p className="text-sm text-slate-600">Create your supplier account and get 25 free credits to start quoting.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create supplier account</CardTitle>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4">
                <p className="text-sm text-emerald-700">{success}</p>
                <p className="text-sm text-slate-600">
                  We’ve sent a secure sign-in link if the account can be created. Use it to continue onboarding.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={() => navigate("/login")}>Go to login</Button>
                  <Button type="button" variant="secondary" onClick={() => setSuccess("")}>Submit another email</Button>
                </div>
              </div>
            ) : (
              <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submit}>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Login email *</label>
                <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Business name *</label>
                <Input value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Location label</label>
                <Input value={form.location_label} onChange={(e) => setField("location_label", e.target.value)} placeholder="e.g. Manchester & North West" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Phone</label>
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Website URL</label>
                <Input value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
              </div>

              {error ? <p className="text-sm text-rose-600 md:col-span-2">{error}</p> : null}

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy}>{busy ? "Starting signup..." : "Create supplier account"}</Button>
                <Link to="/login" className="text-sm text-slate-600 underline">Already have an account? Sign in</Link>
              </div>
            </form>
            )}
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
