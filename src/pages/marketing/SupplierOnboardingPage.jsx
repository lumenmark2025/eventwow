import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent } from "../../components/ui/Card";
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

export default function SupplierOnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const [supplier, setSupplier] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    categories: [],
    short_description: "",
    about: "",
    location: "",
    website_url: "",
    instagram_url: "",
  });

  const onboardingStatus = String(supplier?.onboarding_status || "").toLowerCase();
  const isPublished = !!supplier?.is_published;

  function isLegacyOrApprovedSupplier(row) {
    if (!row?.id) return false;
    if (row.is_published) return true;
    const onboarding = String(row.onboarding_status || "").trim().toLowerCase();
    if (!onboarding) return true;
    return onboarding === "approved";
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [{ data: sessionData }, catsResp] = await Promise.all([
          supabase.auth.getSession(),
          fetch("/api/public/categories/options"),
        ]);
        const user = sessionData?.session?.user;
        if (!user) {
          navigate("/login?returnTo=%2Fsuppliers%2Fonboarding", { replace: true });
          return;
        }

        const catJson = await catsResp.json().catch(() => []);
        if (mounted) setCategories(Array.isArray(catJson) ? catJson : []);

        const me = await authedFetch("/api/suppliers/me");
        if (!mounted) return;
        const row = me?.supplier;
        if (!row?.id) {
          navigate("/suppliers/join", { replace: true });
          return;
        }
        if (isLegacyOrApprovedSupplier(row)) {
          navigate("/supplier/dashboard", { replace: true });
          return;
        }
        if (!user.email_confirmed_at && String(row.onboarding_status || "").toLowerCase() === "awaiting_email_verification") {
          navigate("/suppliers/verify", { replace: true });
          return;
        }

        setSupplier(row);
        setForm({
          categories: Array.isArray(row.listing_categories) ? row.listing_categories : [],
          short_description: row.short_description || "",
          about: row.about || row.description || "",
          location: row.location_label || "",
          website_url: row.website_url || "",
          instagram_url: row.instagram_url || "",
        });

        if (String(row.onboarding_status || "").toLowerCase() === "pending_review") {
          setSubmitted(true);
        }
      } catch (err) {
        if (String(err?.message || "").toLowerCase().includes("supplier not found")) {
          navigate("/suppliers/join", { replace: true });
          return;
        }
        if (mounted) setError(err?.message || "Failed to load onboarding");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
    setOk("");
  }

  function toggleCategory(name) {
    setForm((prev) => {
      const values = Array.isArray(prev.categories) ? prev.categories : [];
      const next = values.includes(name) ? values.filter((v) => v !== name) : [...values, name];
      return { ...prev, categories: next };
    });
  }

  const canSubmitForReview = useMemo(() => {
    return (
      form.categories.length > 0
      && String(form.short_description || "").trim().length >= 30
      && String(form.about || "").trim().length >= 120
      && String(form.location || "").trim().length >= 3
    );
  }, [form]);

  async function saveProgress() {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const json = await authedFetch("/api/suppliers/me/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: form.categories,
          short_description: form.short_description,
          about: form.about,
          location: form.location,
          website_url: form.website_url,
          instagram_url: form.instagram_url,
        }),
      });
      setSupplier((prev) => ({ ...(prev || {}), ...(json?.supplier || {}) }));
      setOk("Progress saved.");
    } catch (err) {
      setError(err?.message || "Failed to save progress");
    } finally {
      setSaving(false);
    }
  }

  async function submitForReview() {
    setSubmitting(true);
    setError("");
    setOk("");
    try {
      await saveProgress();
      const json = await authedFetch("/api/suppliers/submit-for-review", {
        method: "POST",
      });
      setSupplier((prev) => ({ ...(prev || {}), ...(json?.supplier || {}) }));
      setSubmitted(true);
      setOk("Submitted for review.");
    } catch (err) {
      setError(err?.message || "Failed to submit for review");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <MarketingShell><p className="text-sm text-slate-600">Loading onboarding...</p></MarketingShell>;
  }

  if (submitted || onboardingStatus === "pending_review") {
    return (
      <MarketingShell>
        <Card>
          <CardContent className="space-y-3 py-6">
            <h1 className="text-2xl font-semibold">Thanks, your listing is under review</h1>
            <p className="text-sm text-slate-700">You can keep editing your listing while you wait for admin publish approval.</p>
            <div className="flex gap-2">
              <Button as={Link} to="/supplier/dashboard">Go to supplier dashboard</Button>
            </div>
          </CardContent>
        </Card>
      </MarketingShell>
    );
  }

  if (isPublished) {
    return (
      <MarketingShell>
        <p className="text-sm text-slate-600">Redirecting to supplier dashboard...</p>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <div className="space-y-6">
        <PageHeader title="Complete your supplier profile" subtitle="Finish onboarding to submit your listing for review." />

        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <Badge key={n} variant={step === n ? "brand" : "neutral"}>Step {n}</Badge>
          ))}
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

        <Card>
          <CardContent className="space-y-4 py-6">
            {step === 1 ? (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Step 1: Categories</h2>
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
            ) : null}

            {step === 2 ? (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Step 2: Descriptions</h2>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Short description</label>
                  <Input value={form.short_description} onChange={(e) => setField("short_description", e.target.value)} maxLength={160} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">About</label>
                  <textarea className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.about} onChange={(e) => setField("about", e.target.value)} />
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Step 3: Location + Links</h2>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Service area</label>
                  <Input value={form.location} onChange={(e) => setField("location", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Website URL</label>
                  <Input value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Instagram URL</label>
                  <Input value={form.instagram_url} onChange={(e) => setField("instagram_url", e.target.value)} />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button type="button" variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</Button>
              <Button type="button" variant="secondary" disabled={step === 3} onClick={() => setStep((s) => Math.min(3, s + 1))}>Next</Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={saveProgress}>{saving ? "Saving..." : "Save progress"}</Button>
              <Button type="button" disabled={!canSubmitForReview || submitting} onClick={submitForReview}>
                {submitting ? "Submitting..." : "Submit for review"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MarketingShell>
  );
}
