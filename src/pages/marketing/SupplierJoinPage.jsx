import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";

const STORAGE_KEY = "supplier_join_basics_v1";

async function createDraftWithSession(payload) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) return { ok: false, requiresSession: true };

  const resp = await fetch("/api/suppliers/create-draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to create supplier draft");
  return { ok: true };
}

export default function SupplierJoinPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    business_name: "",
    phone: "",
    contact_email: "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.email) {
        setForm((prev) => ({ ...prev, email: prev.email || data.session.user.email, contact_email: prev.contact_email || data.session.user.email }));
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

    const payload = {
      business_name: form.business_name,
      phone: form.phone,
      contact_email: form.contact_email || form.email,
    };

    try {
      const signUp = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signUp.error) throw signUp.error;

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

      const draft = await createDraftWithSession(payload);
      if (draft.ok) {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      navigate("/suppliers/verify", { replace: true });
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
          <p className="text-sm text-slate-600">Create your account, complete your profile, and go live after admin review.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create supplier account</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submit}>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Login email *</label>
                <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Password *</label>
                <Input type="password" value={form.password} onChange={(e) => setField("password", e.target.value)} minLength={8} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Business name *</label>
                <Input value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Phone *</label>
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} required />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Contact email *</label>
                <Input type="email" value={form.contact_email} onChange={(e) => setField("contact_email", e.target.value)} required />
              </div>

              {error ? <p className="text-sm text-rose-600 md:col-span-2">{error}</p> : null}

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy}>{busy ? "Creating account..." : "Create account"}</Button>
                <Link to="/login" className="text-sm text-slate-600 underline">Already have an account? Sign in</Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
