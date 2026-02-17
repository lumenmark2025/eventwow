import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugify } from "../../utils/slugify";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

function SupplierVenueLinksReadOnly({ supplierId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("venue_suppliers")
        .select("id,is_trusted,display_order,venues(id,name,slug)")
        .eq("supplier_id", supplierId)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error) setErr(error.message);
      else setRows(data || []);

      setLoading(false);
    })();
  }, [supplierId]);

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (err) return <p className="text-sm text-rose-600">{err}</p>;

  if (!rows.length) {
    return <EmptyState title="No linked venues" description="This supplier has not been trusted by any venues yet." />;
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm">
            <p className="font-medium text-slate-900">{r.venues?.name || "Unknown venue"}</p>
            <p className="text-xs text-slate-500">{r.venues?.slug || "-"}</p>
          </div>
          <Badge variant={r.is_trusted ? "success" : "neutral"}>{r.is_trusted ? "Trusted" : "Not trusted"}</Badge>
        </div>
      ))}
    </div>
  );
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SupplierEdit({ supplierId, user, onBack, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [warn, setWarn] = useState("");

  const [form, setForm] = useState({
    business_name: "",
    slug: "",
    base_city: "",
    base_postcode: "",
    description: "",
    website_url: "",
    instagram_url: "",
    public_email: "",
    public_phone: "",
    is_published: true,
    is_verified: false,
    is_insured: false,
    fsa_rating_url: "",
    fsa_rating_value: null,
    fsa_rating_last_fetched_at: null,
    credits_balance: 0,
  });

  const [txns, setTxns] = useState([]);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnsErr, setTxnsErr] = useState("");

  const [creditChange, setCreditChange] = useState(0);
  const [creditReason, setCreditReason] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditMsg, setCreditMsg] = useState("");
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState("");
  const [ranking, setRanking] = useState(null);
  const [rankingContexts, setRankingContexts] = useState({ categories: [], locations: [] });
  const [categorySlug, setCategorySlug] = useState("");
  const [locationSlug, setLocationSlug] = useState("");

  const [listingLoading, setListingLoading] = useState(false);
  const [listingSaving, setListingSaving] = useState(false);
  const [listingErr, setListingErr] = useState("");
  const [listingOk, setListingOk] = useState("");
  const [listing, setListing] = useState(null);
  const [media, setMedia] = useState({ hero: null, gallery: [] });
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [gate, setGate] = useState(null);
  const [newService, setNewService] = useState("");
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      setOk("");
      setWarn("");

      const { data, error } = await supabase
        .from("suppliers")
        .select(
          "id,business_name,slug,base_city,base_postcode,description,website_url,instagram_url,public_email,public_phone,is_published,is_verified,is_insured,fsa_rating_url,fsa_rating_value,fsa_rating_last_fetched_at,credits_balance"
        )
        .eq("id", supplierId)
        .maybeSingle();

      if (error) setErr(error.message);
      else if (!data) setErr("Supplier not found.");
      else {
        setForm({
          business_name: data.business_name ?? "",
          slug: data.slug ?? "",
          base_city: data.base_city ?? "",
          base_postcode: data.base_postcode ?? "",
          description: data.description ?? "",
          website_url: data.website_url ?? "",
          instagram_url: data.instagram_url ?? "",
          public_email: data.public_email ?? "",
          public_phone: data.public_phone ?? "",
          is_published: !!data.is_published,
          is_verified: !!data.is_verified,
          is_insured: !!data.is_insured,
          fsa_rating_url: data.fsa_rating_url ?? "",
          fsa_rating_value: data.fsa_rating_value ?? null,
          fsa_rating_last_fetched_at: data.fsa_rating_last_fetched_at ?? null,
          credits_balance: Number(data.credits_balance ?? 0),
        });
        loadCreditTransactions();
      }

      setLoading(false);
    })();
  }, [supplierId]);

  async function fetchAuthedJson(url, options = {}) {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Not authenticated");
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    };
    const resp = await fetch(url, { ...options, headers });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
    return json;
  }

  async function loadListing() {
    if (!supplierId) return;
    setListingLoading(true);
    setListingErr("");
    setListingOk("");
    try {
      const json = await fetchAuthedJson(`/api/admin/suppliers/${encodeURIComponent(supplierId)}/listing`);
      setListing(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setCategoryOptions(Array.isArray(json?.categoryOptions) ? json.categoryOptions : []);
      setGate(json?.gate || null);
    } catch (e) {
      setListing(null);
      setMedia({ hero: null, gallery: [] });
      setCategoryOptions([]);
      setGate(null);
      setListingErr(e?.message || "Failed to load listing");
    } finally {
      setListingLoading(false);
    }
  }

  async function loadRankingContexts() {
    try {
      const json = await fetchAuthedJson("/api/admin/ranking-contexts");
      setRankingContexts({
        categories: Array.isArray(json?.categories) ? json.categories : [],
        locations: Array.isArray(json?.locations) ? json.locations : [],
      });
      if (!categorySlug && Array.isArray(json?.categories) && json.categories[0]?.slug) setCategorySlug(json.categories[0].slug);
      if (!locationSlug && Array.isArray(json?.locations) && json.locations[0]?.slug) setLocationSlug(json.locations[0].slug);
    } catch {
      // leave ranking context optional; ranking can still run without context
    }
  }

  async function loadRanking(nextCategorySlug = categorySlug, nextLocationSlug = locationSlug) {
    setRankingLoading(true);
    setRankingError("");
    try {
      const params = new URLSearchParams();
      if (nextCategorySlug) params.set("category_slug", nextCategorySlug);
      if (nextLocationSlug) params.set("location_slug", nextLocationSlug);
      const json = await fetchAuthedJson(`/api/admin/suppliers/${encodeURIComponent(supplierId)}/ranking?${params.toString()}`);
      setRanking(json || null);
    } catch (e) {
      setRanking(null);
      setRankingError(e?.message || "Failed to load ranking");
    } finally {
      setRankingLoading(false);
    }
  }

  useEffect(() => {
    if (!supplierId) return;
    loadRankingContexts();
  }, [supplierId]);

  useEffect(() => {
    if (!supplierId) return;
    loadRanking(categorySlug, locationSlug);
  }, [supplierId, categorySlug, locationSlug]);

  useEffect(() => {
    if (!supplierId) return;
    loadListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  function setField(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function loadCreditTransactions() {
    setTxnsLoading(true);
    setTxnsErr("");
    try {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id,change,reason,related_quote_id,created_by_user_id,created_by_name,created_at")
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setTxns(data || []);
    } catch (e) {
      setTxnsErr(e?.message || "Failed to load credit transactions");
    } finally {
      setTxnsLoading(false);
    }
  }

  async function adjustCredits(changeAmount) {
    setCreditSubmitting(true);
    setErr("");
    setOk("");
    setCreditMsg("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/admin-adjust-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          supplier_id: supplierId,
          change: changeAmount,
          reason: creditReason,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.details || json?.error || "Failed to adjust credits");
      }

      setForm((p) => ({ ...p, credits_balance: json.credits_balance }));
      setCreditChange(0);
      setCreditReason("");
      setCreditMsg(`Credits updated. New balance: ${json.credits_balance}`);
      setShowAdjustModal(false);
      await loadCreditTransactions();
    } catch (e) {
      setErr(e?.message || "Failed to adjust credits");
    } finally {
      setCreditSubmitting(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr("");
    setOk("");
    setWarn("");

    if (!form.business_name?.trim()) {
      setErr("Business name is required.");
      setSaving(false);
      return;
    }
    if (!form.slug?.trim()) {
      setErr("Slug is required.");
      setSaving(false);
      return;
    }

    const payload = {
      business_name: form.business_name.trim(),
      slug: form.slug.trim(),
      base_city: form.base_city?.trim() || null,
      base_postcode: form.base_postcode?.trim() || null,
      description: form.description?.trim() || null,
      website_url: form.website_url?.trim() || null,
      instagram_url: form.instagram_url?.trim() || null,
      public_email: form.public_email?.trim() || null,
      public_phone: form.public_phone?.trim() || null,
      is_published: !!form.is_published,
      is_verified: !!form.is_verified,
      is_insured: !!form.is_insured,
      fsa_rating_url: form.fsa_rating_url?.trim() || null,
      updated_by_user_id: user?.id || null,
    };

    try {
      const json = await fetchAuthedJson(`/api/admin/suppliers/${encodeURIComponent(supplierId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (json?.supplier) {
        setForm((prev) => ({
          ...prev,
          is_insured: !!json.supplier.is_insured,
          fsa_rating_url: json.supplier.fsa_rating_url ?? "",
          fsa_rating_value: json.supplier.fsa_rating_value ?? null,
          fsa_rating_last_fetched_at: json.supplier.fsa_rating_last_fetched_at ?? null,
        }));
      }
      if (json?.warning) setWarn(json.warning);
      setOk("Saved.");
      onSaved?.();
    } catch (e) {
      setErr(e?.message || "Failed to save supplier");
    }

    setSaving(false);
  }

  async function refreshFsaRating() {
    setErr("");
    setOk("");
    setWarn("");
    try {
      const json = await fetchAuthedJson("/api/admin/suppliers/refresh-fsa-rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      setForm((prev) => ({
        ...prev,
        fsa_rating_url: json?.supplier?.fsa_rating_url ?? prev.fsa_rating_url,
        fsa_rating_value: json?.supplier?.fsa_rating_value ?? null,
        fsa_rating_last_fetched_at: json?.supplier?.fsa_rating_last_fetched_at ?? null,
      }));
      setOk("FHRS rating refreshed.");
    } catch (e) {
      setErr(e?.message || "Failed to refresh FHRS rating");
    }
  }

  function updateListingField(key, value) {
    setListing((prev) => ({ ...(prev || {}), [key]: value }));
    setListingErr("");
    setListingOk("");
  }

  function toggleCategory(name) {
    setListing((prev) => {
      const existing = Array.isArray(prev?.categories) ? prev.categories : [];
      const next = existing.includes(name) ? existing.filter((x) => x !== name) : [...existing, name];
      return { ...(prev || {}), categories: next };
    });
    setListingErr("");
    setListingOk("");
  }

  function addService() {
    const value = String(newService || "").trim();
    if (!value) return;
    if (value.length > 80) {
      setListingErr("Service items must be 80 characters or less.");
      return;
    }
    setListing((prev) => {
      const current = Array.isArray(prev?.services) ? prev.services : [];
      if (current.length >= 12) return prev;
      if (current.some((x) => String(x || "").toLowerCase() === value.toLowerCase())) return prev;
      return { ...(prev || {}), services: [...current, value] };
    });
    setNewService("");
    setListingErr("");
    setListingOk("");
  }

  function removeService(index) {
    setListing((prev) => {
      const current = Array.isArray(prev?.services) ? prev.services : [];
      return { ...(prev || {}), services: current.filter((_, idx) => idx !== index) };
    });
    setListingErr("");
    setListingOk("");
  }

  async function saveListing() {
    if (!listing || listingSaving) return;
    setListingSaving(true);
    setListingErr("");
    setListingOk("");
    try {
      const payload = {
        shortDescription: listing.shortDescription || "",
        about: listing.about || "",
        services: Array.isArray(listing.services) ? listing.services : [],
        locationLabel: listing.locationLabel || "",
        categories: Array.isArray(listing.categories) ? listing.categories : [],
        isPublished: !!listing.isPublished,
      };
      const resp = await fetchAuthedJson(`/api/admin/suppliers/${encodeURIComponent(supplierId)}/listing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setListing(resp?.supplier || null);
      setMedia(resp?.media || { hero: null, gallery: [] });
      setCategoryOptions(Array.isArray(resp?.categoryOptions) ? resp.categoryOptions : []);
      setGate(resp?.gate || null);
      setListingOk("Listing saved.");
    } catch (e) {
      setListingErr(e?.message || "Failed to save listing");
    } finally {
      setListingSaving(false);
    }
  }

  async function uploadListingImage(file, type) {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      setListingErr("Only JPG, PNG, or WEBP images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setListingErr("Image must be 5MB or smaller.");
      return;
    }

    const setBusy = type === "hero" ? setUploadingHero : setUploadingGallery;
    setBusy(true);
    setListingErr("");
    setListingOk("");
    try {
      const dataBase64 = await toBase64(file);
      const resp = await fetchAuthedJson(`/api/admin/suppliers/${encodeURIComponent(supplierId)}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          mimeType: file.type,
          fileName: file.name,
          dataBase64,
        }),
      });
      setListing(resp?.supplier || listing);
      setMedia(resp?.media || { hero: null, gallery: [] });
      setCategoryOptions(Array.isArray(resp?.categoryOptions) ? resp.categoryOptions : categoryOptions);
      setGate(resp?.gate || gate);
      setListingOk(type === "hero" ? "Hero image updated." : "Gallery image uploaded.");
    } catch (e) {
      setListingErr(e?.message || "Failed to upload image");
    } finally {
      setBusy(false);
    }
  }

  async function deleteListingImage(imageId) {
    if (!imageId) return;
    setListingErr("");
    setListingOk("");
    try {
      const resp = await fetchAuthedJson(`/api/admin/suppliers/${encodeURIComponent(supplierId)}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      setListing(resp?.supplier || listing);
      setMedia(resp?.media || { hero: null, gallery: [] });
      setGate(resp?.gate || gate);
      setListingOk("Image removed.");
    } catch (e) {
      setListingErr(e?.message || "Failed to delete image");
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier detail"
        subtitle="Update profile settings and manage credits."
        actions={[
          { key: "back", label: "Back", variant: "secondary", onClick: onBack },
          { key: "save", label: saving ? "Saving..." : "Save", onClick: save, disabled: saving },
        ]}
      />

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      {warn ? <p className="text-sm text-amber-700">{warn}</p> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Credits balance" value={form.credits_balance ?? 0} hint="Current available credits" />
        <StatCard label="Published" value={form.is_published ? "Yes" : "No"} />
        <StatCard label="Verified" value={form.is_verified ? "Yes" : "No"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credits management</CardTitle>
          <CardDescription>Adjust supplier credits with audited changes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {creditMsg ? <p className="text-sm text-emerald-700">{creditMsg}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setShowAdjustModal(true)}>Adjust credits</Button>
            <Button type="button" variant="secondary" onClick={loadCreditTransactions} disabled={txnsLoading}>
              {txnsLoading ? "Refreshing..." : "Refresh history"}
            </Button>
          </div>

          {txnsErr ? <p className="text-sm text-rose-600">{txnsErr}</p> : null}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Change</TH>
                  <TH>Reason</TH>
                  <TH>By</TH>
                  <TH>Quote</TH>
                </TR>
              </THead>
              <TBody>
                {(txns || []).slice(0, 50).map((t) => (
                  <TR key={t.id}>
                    <TD className="whitespace-nowrap">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</TD>
                    <TD className="font-medium text-slate-900">{t.change > 0 ? `+${t.change}` : t.change}</TD>
                    <TD>{t.reason}</TD>
                    <TD className="text-slate-600">
                      {t.created_by_name
                        ? t.created_by_name
                        : t.created_by_user_id
                        ? `${String(t.created_by_user_id).slice(0, 8)}...`
                        : "-"}
                    </TD>
                    <TD className="text-slate-600">
                      {t.related_quote_id ? `${String(t.related_quote_id).slice(0, 8)}...` : "-"}
                    </TD>
                  </TR>
                ))}
                {!txnsLoading && (!txns || txns.length === 0) ? (
                  <TR>
                    <TD colSpan={5} className="text-slate-600">No credit transactions yet.</TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Public supplier details and visibility flags.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Business name *</label>
            <Input value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Slug *</label>
            <div className="flex gap-2">
              <Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} />
              <Button type="button" variant="secondary" onClick={() => setField("slug", slugify(form.business_name))}>Auto</Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Base city</label>
            <Input value={form.base_city} onChange={(e) => setField("base_city", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Base postcode</label>
            <Input value={form.base_postcode} onChange={(e) => setField("base_postcode", e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Website URL</label>
            <Input value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Instagram URL</label>
            <Input value={form.instagram_url} onChange={(e) => setField("instagram_url", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Public email</label>
            <Input value={form.public_email} onChange={(e) => setField("public_email", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Public phone</label>
            <Input value={form.public_phone} onChange={(e) => setField("public_phone", e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="is_published"
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setField("is_published", e.target.checked)}
            />
            Published
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="is_verified"
              type="checkbox"
              checked={form.is_verified}
              onChange={(e) => setField("is_verified", e.target.checked)}
            />
            Verified
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="is_insured"
              type="checkbox"
              checked={form.is_insured}
              onChange={(e) => setField("is_insured", e.target.checked)}
            />
            Insured
          </label>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Food hygiene rating link (FSA)</label>
            <Input
              value={form.fsa_rating_url}
              onChange={(e) => setField("fsa_rating_url", e.target.value)}
              placeholder="https://ratings.food.gov.uk/business/1234567/example-business"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>Current rating: {form.fsa_rating_value || "Not set"}</span>
              {form.fsa_rating_last_fetched_at ? (
                <span>Last fetched: {new Date(form.fsa_rating_last_fetched_at).toLocaleString()}</span>
              ) : null}
            </div>
            <Button type="button" variant="secondary" onClick={refreshFsaRating}>
              Refresh FHRS rating
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public listing (admin)</CardTitle>
          <CardDescription>Images, services and categories shown on the public supplier page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {listingErr ? <p className="text-sm text-rose-600">{listingErr}</p> : null}
          {listingOk ? <p className="text-sm text-emerald-700">{listingOk}</p> : null}
          {listingLoading ? <Skeleton className="h-48 w-full" /> : null}

          {!listingLoading && listing ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={listing.isPublished ? "success" : "neutral"}>
                      {listing.isPublished ? "Published" : "Hidden from directory"}
                    </Badge>
                    {gate && gate.canPublish ? <Badge variant="brand">Publish-ready</Badge> : <Badge variant="warning">Missing requirements</Badge>}
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!listing.isPublished}
                      onChange={(e) => updateListingField("isPublished", e.target.checked)}
                    />
                    Publish this supplier to the public directory
                  </label>
                  {gate && !gate.canPublish && Array.isArray(gate.reasons) && gate.reasons.length > 0 ? (
                    <p className="text-xs text-amber-700">Required before publish: {gate.reasons.join(" ")}</p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Short description</label>
                    <Input
                      value={listing.shortDescription || ""}
                      onChange={(e) => updateListingField("shortDescription", e.target.value)}
                      maxLength={160}
                      placeholder="One-line summary customers see in cards"
                    />
                    <p className="mt-1 text-xs text-slate-500">{String(listing.shortDescription || "").length}/160</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">About</label>
                    <textarea
                      className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                      value={listing.about || ""}
                      onChange={(e) => updateListingField("about", e.target.value)}
                      maxLength={4000}
                      placeholder="Describe your offer, style, experience and what customers can expect"
                    />
                    <p className="mt-1 text-xs text-slate-500">{String(listing.about || "").length}/4000</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Location / service area</label>
                    <Input
                      value={listing.locationLabel || ""}
                      onChange={(e) => updateListingField("locationLabel", e.target.value)}
                      maxLength={120}
                      placeholder="e.g. Manchester and North West"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Services</div>
                  <div className="flex flex-wrap gap-2">
                    {(listing.services || []).map((service, idx) => (
                      <span
                        key={`${service}-${idx}`}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700"
                      >
                        {service}
                        <button
                          type="button"
                          className="text-slate-500 hover:text-slate-900"
                          onClick={() => removeService(idx)}
                          aria-label={`Remove ${service}`}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={newService}
                      onChange={(e) => setNewService(e.target.value)}
                      maxLength={80}
                      placeholder="Add a service bullet"
                    />
                    <Button type="button" variant="secondary" onClick={addService} disabled={(listing.services || []).length >= 12}>
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">{(listing.services || []).length}/12 services</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Categories</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(categoryOptions || []).map((name) => {
                      const checked = (listing.categories || []).includes(name);
                      return (
                        <label
                          key={name}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCategory(name)}
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={saveListing} disabled={listingSaving}>
                    {listingSaving ? "Saving..." : "Save listing"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={loadListing} disabled={listingLoading || listingSaving}>
                    Refresh listing
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Hero image</div>
                  {media.hero?.url ? (
                    <img src={media.hero.url} alt="Hero" className="h-40 w-full rounded-xl object-cover" />
                  ) : (
                    <div className="h-40 rounded-xl border border-dashed border-slate-300 bg-slate-50" />
                  )}
                  <label className="block">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => uploadListingImage(e.target.files?.[0], "hero")}
                    />
                    <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {uploadingHero ? "Uploading..." : "Upload hero image"}
                    </span>
                  </label>
                  {media.hero?.id ? (
                    <Button type="button" variant="ghost" className="w-full" onClick={() => deleteListingImage(media.hero.id)}>
                      Delete hero image
                    </Button>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Gallery</div>
                  <label className="block">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => uploadListingImage(e.target.files?.[0], "gallery")}
                    />
                    <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {uploadingGallery ? "Uploading..." : "Add gallery image"}
                    </span>
                  </label>

                  {(media.gallery || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No gallery images yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {media.gallery.map((img) => (
                        <div key={img.id} className="rounded-xl border border-slate-200 p-2">
                          <img src={img.url} alt={img.caption || "Gallery"} className="h-24 w-full rounded-lg object-cover" />
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => deleteListingImage(img.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trusted by venues</CardTitle>
          <CardDescription>Read-only trust links from venue mappings.</CardDescription>
        </CardHeader>
        <CardContent>
          <SupplierVenueLinksReadOnly supplierId={supplierId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranking</CardTitle>
          <CardDescription>Contextual ranking breakdown and explanation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Category context</label>
              <select
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
              >
                <option value="">None</option>
                {(rankingContexts.categories || []).map((c) => (
                  <option key={c.slug} value={c.slug}>{c.label || c.slug}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Location context</label>
              <select
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                value={locationSlug}
                onChange={(e) => setLocationSlug(e.target.value)}
              >
                <option value="">None</option>
                {(rankingContexts.locations || []).map((l) => (
                  <option key={l.slug} value={l.slug}>{l.label || l.slug}</option>
                ))}
              </select>
            </div>
          </div>

          {rankingError ? <p className="text-sm text-rose-600">{rankingError}</p> : null}
          {rankingLoading ? <Skeleton className="h-36 w-full" /> : null}

          {!rankingLoading && ranking ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Base quality</div>
                  <div className="space-y-1">
                    <div>Smoothed acceptance: <span className="font-medium">{(Number(ranking?.components?.smoothed_acceptance || 0) * 100).toFixed(1)}%</span></div>
                    <div>Response score: <span className="font-medium">{(Number(ranking?.components?.response_score || 0) * 100).toFixed(1)}</span></div>
                    <div>Activity score: <span className="font-medium">{(Number(ranking?.components?.activity_score || 0) * 100).toFixed(1)}</span></div>
                    <div>Volume confidence: <span className="font-medium">{(Number(ranking?.components?.volume_score || 0) * 100).toFixed(1)}</span></div>
                    <div>Base quality: <span className="font-semibold">{(Number(ranking?.components?.base_quality || 0) * 100).toFixed(1)}</span></div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Context + final</div>
                  <div className="space-y-1">
                    <div>Category match: <span className="font-medium">{(Number(ranking?.match?.category_match || 0) * 100).toFixed(1)}</span></div>
                    <div>Location match: <span className="font-medium">{(Number(ranking?.match?.location_match || 0) * 100).toFixed(1)}</span></div>
                    <div>Match: <span className="font-medium">{(Number(ranking?.match?.match || 0) * 100).toFixed(1)}</span></div>
                    <div>Verified bonus: <span className="font-medium">{Number(ranking?.final?.verified_bonus || 0).toFixed(2)}</span></div>
                    <div>Plan multiplier: <span className="font-medium">{Number(ranking?.final?.plan_multiplier || 1).toFixed(2)}x</span></div>
                    <div>Rank score: <span className="font-semibold">{Number(ranking?.final?.rank_score || 0).toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
              {Array.isArray(ranking?.explanations) && ranking.explanations.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Explanation</div>
                  <ul className="list-disc space-y-1 pl-5 text-slate-700">
                    {ranking.explanations.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Modal
        open={showAdjustModal}
        title="Confirm credit adjustment"
        onClose={() => setShowAdjustModal(false)}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setShowAdjustModal(false)} disabled={creditSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => adjustCredits(creditChange)}
              disabled={creditSubmitting || !creditReason.trim() || !Number.isInteger(creditChange) || creditChange === 0}
            >
              {creditSubmitting ? "Applying..." : "Confirm"}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Change (integer)</label>
            <Input type="number" step="1" value={creditChange} onChange={(e) => setCreditChange(parseInt(e.target.value || "0", 10))} />
            <div className="flex flex-wrap gap-2">
              {[5, 10, 25].map((n) => (
                <Button key={n} type="button" variant="secondary" size="sm" disabled={creditSubmitting} onClick={() => setCreditChange(n)}>
                  +{n}
                </Button>
              ))}
              <Button type="button" variant="secondary" size="sm" disabled={creditSubmitting} onClick={() => setCreditChange(-5)}>
                -5
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Reason *</label>
            <Input
              placeholder="e.g. Pilot top-up / manual correction"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function SupplierList({ user }) {
  const [suppliers, setSuppliers] = useState([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [createForm, setCreateForm] = useState({ business_name: "", public_email: "", base_city: "", base_postcode: "" });

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("suppliers")
        .select("id,business_name,slug,base_city,base_postcode,is_published,is_verified,credits_balance")
        .order("created_at", { ascending: false });

      if (error) setErr(error.message);
      else {
        setSuppliers(data || []);
        setFilteredSuppliers(data || []);
      }

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFilteredSuppliers(suppliers);
      return;
    }

    setFilteredSuppliers(
      suppliers.filter((s) =>
        [s.business_name, s.slug, s.base_city, s.base_postcode].join(" ").toLowerCase().includes(q)
      )
    );
  }, [search, suppliers]);

  function refresh() {
    (async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,business_name,slug,base_city,base_postcode,is_published,is_verified,credits_balance")
        .order("created_at", { ascending: false });

      if (!error) {
        setSuppliers(data || []);
      }
    })();
  }

  async function fetchAuthedJson(url, options = {}) {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Not authenticated");
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` };
    const resp = await fetch(url, { ...options, headers });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
    return json;
  }

  async function createSupplier() {
    if (createBusy) return;
    setCreateBusy(true);
    setCreateErr("");
    try {
      const payload = {
        business_name: String(createForm.business_name || "").trim(),
        public_email: String(createForm.public_email || "").trim(),
        base_city: String(createForm.base_city || "").trim() || null,
        base_postcode: String(createForm.base_postcode || "").trim() || null,
      };
      if (!payload.business_name || !payload.public_email) throw new Error("Business name and email are required.");
      const json = await fetchAuthedJson("/api/admin-create-supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const newId = json?.supplier?.id || null;
      await refresh();
      setCreateOpen(false);
      setCreateForm({ business_name: "", public_email: "", base_city: "", base_postcode: "" });
      if (newId) setSelectedSupplierId(newId);
    } catch (e) {
      setCreateErr(e?.message || "Failed to create supplier");
    } finally {
      setCreateBusy(false);
    }
  }

  if (selectedSupplierId) {
    return (
      <SupplierEdit
        supplierId={selectedSupplierId}
        user={user}
        onBack={() => setSelectedSupplierId(null)}
        onSaved={refresh}
      />
    );
  }

  const positiveCredits = suppliers.filter((s) => Number(s.credits_balance || 0) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" subtitle="Manage supplier profiles and credits." />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Total suppliers" value={suppliers.length} />
        <StatCard label="With credits" value={positiveCredits} />
        <StatCard label="Published" value={suppliers.filter((s) => s.is_published).length} />
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers by name, slug, city, or postcode"
              className="sm:max-w-md"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(true)}>Create supplier</Button>
              <Button type="button" variant="secondary" onClick={refresh}>Refresh</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      <Card className="overflow-hidden">
        {loading ? (
          <CardContent className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        ) : filteredSuppliers.length === 0 ? (
          <CardContent>
            <EmptyState title="No suppliers found" description="Try a different search term." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Business</TH>
                  <TH>Slug</TH>
                  <TH>Base</TH>
                  <TH>Credits</TH>
                  <TH>Published</TH>
                  <TH>Verified</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {filteredSuppliers.map((s) => (
                  <TR key={s.id} interactive>
                    <TD className="font-medium text-slate-900">{s.business_name}</TD>
                    <TD className="text-slate-600">{s.slug}</TD>
                    <TD className="text-slate-600">
                      {(s.base_city || "") + (s.base_postcode ? ` (${s.base_postcode})` : "") || "-"}
                    </TD>
                    <TD>
                      <Badge variant={Number(s.credits_balance || 0) > 0 ? "brand" : "neutral"}>
                        {s.credits_balance ?? 0}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge variant={s.is_published ? "success" : "neutral"}>{s.is_published ? "Yes" : "No"}</Badge>
                    </TD>
                    <TD>
                      <Badge variant={s.is_verified ? "success" : "warning"}>{s.is_verified ? "Yes" : "No"}</Badge>
                    </TD>
                    <TD className="text-right">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setSelectedSupplierId(s.id)}>
                        View
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Create supplier"
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={createBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={createSupplier} disabled={createBusy}>
              {createBusy ? "Creating..." : "Create"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {createErr ? <p className="text-sm text-rose-600">{createErr}</p> : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Business name *</label>
              <Input value={createForm.business_name} onChange={(e) => setCreateForm((p) => ({ ...p, business_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Login email *</label>
              <Input type="email" value={createForm.public_email} onChange={(e) => setCreateForm((p) => ({ ...p, public_email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Base city</label>
              <Input value={createForm.base_city} onChange={(e) => setCreateForm((p) => ({ ...p, base_city: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Base postcode</label>
              <Input value={createForm.base_postcode} onChange={(e) => setCreateForm((p) => ({ ...p, base_postcode: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

