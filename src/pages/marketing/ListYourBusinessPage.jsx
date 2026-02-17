import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import { supabase } from "../../lib/supabase";

async function authedFetch(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const resp = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

export default function ListYourBusinessPage() {
  const navigate = useNavigate();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [checkingSupplier, setCheckingSupplier] = useState(false);

  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    business_name: "",
    contact_name: "",
    contact_email: "",
    phone: "",
    service_area: "",
    categories: [],
    short_description: "",
    about: "",
    website_url: "",
    instagram_url: "",
    hero_image_url: "",
    confirm_terms: false,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data?.session || null);
      if (data?.session?.user?.email) {
        setForm((prev) => ({ ...prev, contact_email: prev.contact_email || data.session.user.email }));
      }
      setSessionLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next || null);
      if (next?.user?.email) {
        setForm((prev) => ({ ...prev, contact_email: prev.contact_email || next.user.email }));
      }
      setSessionLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch("/api/public/categories/options");
        const json = await resp.json().catch(() => []);
        if (!resp.ok) throw new Error("Failed to load categories");
        if (!mounted) return;
        setCategories(Array.isArray(json) ? json : []);
      } catch {
        if (mounted) setCategories([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!session?.user?.id) return undefined;

    (async () => {
      setCheckingSupplier(true);
      setError("");
      try {
        const json = await authedFetch("/api/suppliers/me");
        if (!mounted) return;
        if (json?.supplier?.id) {
          navigate("/supplier/dashboard", { replace: true });
        }
      } catch {
        // 404 means user has not onboarded yet.
      } finally {
        if (mounted) setCheckingSupplier(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id, navigate]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategory(name) {
    setForm((prev) => {
      const current = Array.isArray(prev.categories) ? prev.categories : [];
      const next = current.includes(name) ? current.filter((v) => v !== name) : [...current, name];
      return { ...prev, categories: next };
    });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      await authedFetch("/api/suppliers/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSuccess(true);
    } catch (err) {
      setError(err?.message || "Failed to submit application");
    } finally {
      setBusy(false);
    }
  }

  if (sessionLoading || checkingSupplier) {
    return (
      <MarketingShell>
        <p className="text-sm text-slate-600">Loading...</p>
      </MarketingShell>
    );
  }

  if (!session?.user) {
    return (
      <MarketingShell>
        <PageHeader
          title="List your business"
          subtitle="Create your account, submit your listing, and we will review before you go live."
        />

        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="space-y-2 text-sm text-slate-700">
              <p>1. Create account or log in</p>
              <p>2. Submit your business listing</p>
              <p>3. We review and approve</p>
              <p>4. Go live and receive launch offer credits</p>
            </div>
            <Badge variant="brand">Launch offer: 25 free credits when approved</Badge>
            <div>
              <Button as={Link} to={`/login?returnTo=${encodeURIComponent("/list-your-business")}`}>
                Login to start onboarding
              </Button>
            </div>
          </CardContent>
        </Card>
      </MarketingShell>
    );
  }

  if (success) {
    return (
      <MarketingShell>
        <Card>
          <CardHeader>
            <CardTitle>Thanks, your listing is under review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-700">
              You can keep editing your profile while we review. Your listing will go live only after approval.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button as={Link} to="/supplier/dashboard">Go to supplier dashboard</Button>
              <Button as={Link} to="/supplier/listing" variant="secondary">Continue editing listing</Button>
            </div>
          </CardContent>
        </Card>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <div className="space-y-6">
        <PageHeader
          title="List your business"
          subtitle="Submit your supplier application. We review every listing before it appears publicly."
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">Step 1: Apply</Badge>
          <Badge variant="neutral">Step 2: Review</Badge>
          <Badge variant="success">Launch offer: 25 free credits on approval</Badge>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <Card>
          <CardContent className="py-6">
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submit}>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Business name *</label>
                <Input value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Contact name *</label>
                <Input value={form.contact_name} onChange={(e) => setField("contact_name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Contact email *</label>
                <Input type="email" value={form.contact_email} onChange={(e) => setField("contact_email", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Phone</label>
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Location / service area</label>
                <Input value={form.service_area} onChange={(e) => setField("service_area", e.target.value)} placeholder="e.g. Manchester and surrounding areas" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Categories *</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map((cat) => {
                    const name = cat.display_name;
                    const checked = form.categories.includes(name);
                    return (
                      <label key={cat.slug || name} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <input type="checkbox" checked={checked} onChange={() => toggleCategory(name)} />
                        {name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Short description *</label>
                <Input value={form.short_description} onChange={(e) => setField("short_description", e.target.value)} maxLength={160} required />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">About / description *</label>
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={form.about}
                  onChange={(e) => setField("about", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Website URL</label>
                <Input value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Instagram URL</label>
                <Input value={form.instagram_url} onChange={(e) => setField("instagram_url", e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Hero image URL (optional)</label>
                <Input value={form.hero_image_url} onChange={(e) => setField("hero_image_url", e.target.value)} placeholder="Optional for now; you can upload in dashboard later" />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.confirm_terms}
                  onChange={(e) => setField("confirm_terms", e.target.checked)}
                  required
                />
                I confirm this information is accurate and I agree to terms.
              </label>

              <div className="md:col-span-2">
                <Button type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit for review"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </MarketingShell>
  );
}
