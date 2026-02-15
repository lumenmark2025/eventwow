import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  const headers = {
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  return fetch(path, { ...options, headers });
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function guestLabel(min, max) {
  const mn = Number(min);
  const mx = Number(max);
  if (Number.isFinite(mn) && Number.isFinite(mx)) return `${mn}-${mx}`;
  if (Number.isFinite(mn)) return `${mn}+`;
  if (Number.isFinite(mx)) return `<=${mx}`;
  return "-";
}

function isVenuePublished(venue) {
  if (typeof venue?.is_published === "boolean") return venue.is_published;
  return !!venue?.listed_publicly;
}

function csvToList(value, maxItems = 20, maxLen = 80) {
  const seen = new Set();
  const out = [];
  const parts = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  for (const item of parts) {
    const clipped = item.slice(0, maxLen);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= maxItems) break;
  }
  return out;
}

function VenueEditor({ venueId, onBack, autoOpenAi }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [linkedSupplierIds, setLinkedSupplierIds] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraftSaving, setAiDraftSaving] = useState("");
  const [aiInput, setAiInput] = useState({
    venue_name: "",
    town_or_city: "",
    county_or_region: "",
    venue_type: "other",
    website_url: "",
    notes: "",
  });
  const [aiDraft, setAiDraft] = useState(null);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    locationLabel: "",
    address: "",
    city: "",
    postcode: "",
    guestMin: "",
    guestMax: "",
    shortDescription: "",
    about: "",
    websiteUrl: "",
    listedPublicly: false,
    heroImageUrl: "",
    gallery: [],
    aiTags: [],
    aiSuggestedSearchTerms: [],
    aiDraftMeta: {},
    aiGeneratedAt: null,
  });

  const filteredSuppliers = useMemo(
    () => allSuppliers.filter((s) => String(s.name || "").trim().length > 0),
    [allSuppliers]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      try {
        const resp = await apiFetch(`/api/admin-venues?venueId=${encodeURIComponent(venueId)}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load venue");
        if (!mounted) return;
        const venue = json?.venue || {};
        setForm({
          name: venue.name || "",
          slug: venue.slug || "",
          locationLabel: venue.locationLabel || "",
          address: venue.address || "",
          city: venue.city || "",
          postcode: venue.postcode || "",
          guestMin: venue.guestMin ?? "",
          guestMax: venue.guestMax ?? "",
          shortDescription: venue.shortDescription || "",
          about: venue.about || "",
          websiteUrl: venue.websiteUrl || "",
          listedPublicly: !!venue.listedPublicly,
          heroImageUrl: venue.heroImageUrl || "",
          gallery: Array.isArray(venue.gallery) ? venue.gallery : [],
          aiTags: Array.isArray(venue.aiTags) ? venue.aiTags : [],
          aiSuggestedSearchTerms: Array.isArray(venue.aiSuggestedSearchTerms) ? venue.aiSuggestedSearchTerms : [],
          aiDraftMeta: venue.aiDraftMeta && typeof venue.aiDraftMeta === "object" ? venue.aiDraftMeta : {},
          aiGeneratedAt: venue.aiGeneratedAt || null,
        });
        setLinkedSupplierIds(Array.isArray(json?.linkedSupplierIds) ? json.linkedSupplierIds : []);
        setAllSuppliers(Array.isArray(json?.suppliers) ? json.suppliers : []);
        setDirty(false);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load venue");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [venueId]);

  useEffect(() => {
    if (!loading && autoOpenAi) {
      setAiOpen(true);
    }
  }, [loading, autoOpenAi]);

  useEffect(() => {
    (async () => {
      try {
        await apiFetch("/api/admin/storage/ensure-buckets", { method: "POST" });
      } catch {
        // non-blocking: upload endpoint validates bucket again
      }
    })();
  }, []);

  useEffect(() => {
    function beforeUnload(e) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function saveVenue(options = {}) {
    const formPatch = options.formPatch || {};
    const nextForm = { ...form, ...formPatch };
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        venueId,
        name: nextForm.name,
        slug: nextForm.slug,
        locationLabel: nextForm.locationLabel,
        address: nextForm.address,
        city: nextForm.city,
        postcode: nextForm.postcode,
        guestMin: nextForm.guestMin === "" ? null : Number(nextForm.guestMin),
        guestMax: nextForm.guestMax === "" ? null : Number(nextForm.guestMax),
        shortDescription: nextForm.shortDescription,
        about: nextForm.about,
        websiteUrl: nextForm.websiteUrl,
        listedPublicly: !!nextForm.listedPublicly,
        aiTags: Array.isArray(nextForm.aiTags) ? nextForm.aiTags : [],
        aiSuggestedSearchTerms: Array.isArray(nextForm.aiSuggestedSearchTerms) ? nextForm.aiSuggestedSearchTerms : [],
        aiDraftMeta: nextForm.aiDraftMeta && typeof nextForm.aiDraftMeta === "object" ? nextForm.aiDraftMeta : {},
        aiGeneratedAt: nextForm.aiGeneratedAt || null,
      };
      const resp = await apiFetch("/api/admin-venue-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to save venue");
      setSuccess("Venue saved.");
      setForm(nextForm);
      setDirty(false);
      return true;
    } catch (err) {
      setError(err?.message || "Failed to save venue");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openAiModal() {
    setAiError("");
    setAiDraft(null);
    setAiInput({
      venue_name: form.name || "",
      town_or_city: form.city || "",
      county_or_region: "",
      venue_type: "other",
      website_url: form.websiteUrl || "",
      notes: "",
    });
    setAiOpen(true);
  }

  async function generateAiDraft() {
    setAiGenerating(true);
    setAiError("");
    setSuccess("");
    try {
      const resp = await apiFetch("/api/admin/venues/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiInput),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to generate draft");
      setAiDraft({
        name_suggestion: json?.name_suggestion || aiInput.venue_name || "",
        slug_suggestion: json?.slug_suggestion || "",
        location_label: json?.location_label || "",
        short_description: json?.short_description || "",
        about: json?.about || "",
        guest_min: json?.guest_min ?? "",
        guest_max: json?.guest_max ?? "",
        capacity_confidence: json?.capacity_confidence || "low",
        tags: Array.isArray(json?.tags) ? json.tags : [],
        hero_image_search_terms: Array.isArray(json?.hero_image_search_terms) ? json.hero_image_search_terms : [],
        suggested_supplier_categories: Array.isArray(json?.suggested_supplier_categories) ? json.suggested_supplier_categories : [],
        disclaimers: Array.isArray(json?.disclaimers) ? json.disclaimers : [],
      });
    } catch (err) {
      setAiError(err?.message || "Failed to generate draft");
    } finally {
      setAiGenerating(false);
    }
  }

  function buildFormPatchFromAiDraft() {
    if (!aiDraft) return null;
    const nowIso = new Date().toISOString();
    return {
      name: aiDraft.name_suggestion || form.name,
      slug: aiDraft.slug_suggestion || form.slug,
      locationLabel: aiDraft.location_label || form.locationLabel,
      shortDescription: aiDraft.short_description || form.shortDescription,
      about: aiDraft.about || form.about,
      guestMin: aiDraft.guest_min ?? form.guestMin,
      guestMax: aiDraft.guest_max ?? form.guestMax,
      city: aiInput.town_or_city || form.city,
      websiteUrl: aiInput.website_url || form.websiteUrl,
      aiTags: Array.isArray(aiDraft.tags) ? aiDraft.tags : [],
      aiSuggestedSearchTerms: Array.isArray(aiDraft.hero_image_search_terms) ? aiDraft.hero_image_search_terms : [],
      aiDraftMeta: {
        source: "ai_venue_builder",
        modelInput: { ...aiInput, website_url: aiInput.website_url || null },
        modelOutput: aiDraft,
        capacity_confidence: aiDraft.capacity_confidence || "low",
        suggested_supplier_categories: Array.isArray(aiDraft.suggested_supplier_categories) ? aiDraft.suggested_supplier_categories : [],
        disclaimers: Array.isArray(aiDraft.disclaimers) ? aiDraft.disclaimers : [],
      },
      aiGeneratedAt: nowIso,
    };
  }

  function applyAiToForm() {
    const patch = buildFormPatchFromAiDraft();
    if (!patch) return;
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setSuccess("AI draft applied to form.");
  }

  async function saveAiDraft(publish) {
    const patch = buildFormPatchFromAiDraft();
    if (!patch) return;
    setAiDraftSaving(publish ? "publish" : "draft");
    setAiError("");
    try {
      const ok = await saveVenue({ formPatch: { ...patch, listedPublicly: publish } });
      if (ok) setAiOpen(false);
    } catch {
      // saveVenue handles error surface
    } finally {
      setAiDraftSaving("");
    }
  }

  async function uploadImage(file, type) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }
    setBusy(type);
    setError("");
    setSuccess("");
    try {
      const dataBase64 = await toBase64(file);
      const resp = await apiFetch(`/api/admin/venues/${encodeURIComponent(venueId)}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          caption: "",
          mimeType: file.type || "",
          fileName: file.name || "",
          dataBase64,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to upload image");
      setSuccess("Image uploaded.");
      const refresh = await apiFetch(`/api/admin-venues?venueId=${encodeURIComponent(venueId)}`);
      const fresh = await refresh.json().catch(() => ({}));
      if (refresh.ok) {
        setForm((prev) => ({
          ...prev,
          heroImageUrl: fresh?.venue?.heroImageUrl || "",
          gallery: Array.isArray(fresh?.venue?.gallery) ? fresh.venue.gallery : [],
        }));
      }
    } catch (err) {
      setError(err?.message || "Failed to upload image");
    } finally {
      setBusy("");
    }
  }

  async function deleteImage(imageId) {
    setBusy(`delete:${imageId}`);
    setError("");
    try {
      const resp = await apiFetch(`/api/admin/venues/${encodeURIComponent(venueId)}/images?imageId=${encodeURIComponent(imageId)}`, {
        method: "DELETE",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to delete image");
      const refresh = await apiFetch(`/api/admin-venues?venueId=${encodeURIComponent(venueId)}`);
      const fresh = await refresh.json().catch(() => ({}));
      if (refresh.ok) {
        setForm((prev) => ({
          ...prev,
          heroImageUrl: fresh?.venue?.heroImageUrl || "",
          gallery: Array.isArray(fresh?.venue?.gallery) ? fresh.venue.gallery : [],
        }));
      }
    } catch (err) {
      setError(err?.message || "Failed to delete image");
    } finally {
      setBusy("");
    }
  }

  async function moveGallery(index, direction) {
    const arr = [...(form.gallery || [])];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= arr.length) return;
    const tmp = arr[index];
    arr[index] = arr[newIndex];
    arr[newIndex] = tmp;
    setForm((prev) => ({ ...prev, gallery: arr }));
    setBusy("reorder");
    try {
      const orderedImageIds = arr.map((img) => img.id).filter(Boolean);
      const resp = await apiFetch("/api/admin-venue-reorder-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, orderedImageIds }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to reorder gallery");
    } catch (err) {
      setError(err?.message || "Failed to reorder gallery");
    } finally {
      setBusy("");
    }
  }

  async function saveLinkedSuppliers() {
    setBusy("suppliers");
    setError("");
    try {
      const resp = await apiFetch("/api/admin-venue-set-linked-suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, supplierIds: linkedSupplierIds }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to save linked suppliers");
      setSuccess("Linked suppliers saved.");
    } catch (err) {
      setError(err?.message || "Failed to save linked suppliers");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit venue"
        subtitle="Manage venue copy, guest range, imagery, and linked suppliers."
        actions={[
          { key: "back", label: "Back", variant: "secondary", onClick: onBack },
          { key: "ai-draft", label: "AI Draft Venue", variant: "secondary", onClick: openAiModal },
          { key: "save", label: saving ? "Saving..." : "Save changes", onClick: saveVenue, disabled: saving },
        ]}
      />

      {dirty ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Unsaved changes</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Basic info</CardTitle>
          <CardDescription>Public listing content shown on /venues pages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Venue name" />
            <Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} placeholder="Slug" />
            <Input value={form.locationLabel} onChange={(e) => setField("locationLabel", e.target.value)} placeholder="Location label" />
            <Input value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder="City" />
            <Input value={form.postcode} onChange={(e) => setField("postcode", e.target.value)} placeholder="Postcode" />
            <Input value={form.websiteUrl} onChange={(e) => setField("websiteUrl", e.target.value)} placeholder="Website URL" />
            <Input value={form.guestMin} onChange={(e) => setField("guestMin", e.target.value)} type="number" placeholder="Guest min" />
            <Input value={form.guestMax} onChange={(e) => setField("guestMax", e.target.value)} type="number" placeholder="Guest max" />
          </div>
          <Input
            value={(form.aiTags || []).join(", ")}
            onChange={(e) => setField("aiTags", csvToList(e.target.value, 10, 40))}
            placeholder="AI tags (comma separated)"
          />
          <Input
            value={(form.aiSuggestedSearchTerms || []).join(", ")}
            onChange={(e) => setField("aiSuggestedSearchTerms", csvToList(e.target.value, 6, 80))}
            placeholder="Hero image search terms (comma separated)"
          />
          {form.aiGeneratedAt ? (
            <p className="text-xs text-slate-500">AI draft generated: {new Date(form.aiGeneratedAt).toLocaleString()}</p>
          ) : null}
          <textarea
            className="min-h-[90px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            value={form.shortDescription}
            onChange={(e) => setField("shortDescription", e.target.value)}
            placeholder="Short description"
          />
          <textarea
            className="min-h-[160px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            value={form.about}
            onChange={(e) => setField("about", e.target.value)}
            placeholder="About"
          />
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.listedPublicly} onChange={(e) => setField("listedPublicly", e.target.checked)} />
            Listed publicly
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
          <CardDescription>Upload hero and gallery images (jpg/png/webp, max 5MB).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Upload hero
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => uploadImage(e.target.files?.[0], "hero")}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Upload gallery image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => uploadImage(e.target.files?.[0], "gallery")}
              />
            </label>
            {busy ? <Badge variant="neutral">Working...</Badge> : null}
          </div>

          {form.heroImageUrl ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <img src={form.heroImageUrl} alt="Venue hero" className="h-44 w-full object-cover" loading="lazy" />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(form.gallery || []).map((img, index) => (
              <div key={img.id || `${img.url}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <img src={img.url} alt={`Gallery ${index + 1}`} className="h-24 w-full object-cover" loading="lazy" />
                <div className="flex items-center justify-between gap-1 p-2">
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                    onClick={() => moveGallery(index, -1)}
                    disabled={busy === "reorder"}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                    onClick={() => moveGallery(index, 1)}
                    disabled={busy === "reorder"}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700"
                    onClick={() => deleteImage(img.id)}
                    disabled={busy === `delete:${img.id}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked suppliers</CardTitle>
          <CardDescription>Suppliers shown on the public venue page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 p-2">
            {filteredSuppliers.map((supplier) => {
              const checked = linkedSupplierIds.includes(supplier.id);
              return (
                <label key={supplier.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setLinkedSupplierIds((prev) =>
                        enabled ? Array.from(new Set([...prev, supplier.id])) : prev.filter((id) => id !== supplier.id)
                      );
                    }}
                  />
                  <span>{supplier.name}</span>
                  {supplier.listedPublicly ? <Badge variant="success">Public</Badge> : <Badge variant="neutral">Hidden</Badge>}
                </label>
              );
            })}
          </div>
          <Button onClick={saveLinkedSuppliers} disabled={busy === "suppliers"}>
            {busy === "suppliers" ? "Saving..." : "Save linked suppliers"}
          </Button>
        </CardContent>
      </Card>

      <Modal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="AI Assisted Venue Builder"
        footer={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={generateAiDraft} disabled={aiGenerating}>
              {aiGenerating ? "Generating..." : "Generate Draft"}
            </Button>
            <Button type="button" variant="secondary" onClick={applyAiToForm} disabled={!aiDraft}>
              Apply to Form
            </Button>
            <Button type="button" onClick={() => saveAiDraft(false)} disabled={!aiDraft || !!aiDraftSaving}>
              {aiDraftSaving === "draft" ? "Saving..." : "Save Draft"}
            </Button>
            <Button type="button" onClick={() => saveAiDraft(true)} disabled={!aiDraft || !!aiDraftSaving}>
              {aiDraftSaving === "publish" ? "Saving..." : "Save & Publish"}
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Input
              value={aiInput.venue_name}
              onChange={(e) => setAiInput((prev) => ({ ...prev, venue_name: e.target.value }))}
              placeholder="Venue name *"
            />
            <Input
              value={aiInput.town_or_city}
              onChange={(e) => setAiInput((prev) => ({ ...prev, town_or_city: e.target.value }))}
              placeholder="Town or city *"
            />
            <Input
              value={aiInput.county_or_region}
              onChange={(e) => setAiInput((prev) => ({ ...prev, county_or_region: e.target.value }))}
              placeholder="County or region"
            />
            <select
              value={aiInput.venue_type}
              onChange={(e) => setAiInput((prev) => ({ ...prev, venue_type: e.target.value }))}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            >
              <option value="hotel">hotel</option>
              <option value="barn">barn</option>
              <option value="country house">country house</option>
              <option value="village hall">village hall</option>
              <option value="outdoor">outdoor</option>
              <option value="restaurant">restaurant</option>
              <option value="marquee site">marquee site</option>
              <option value="other">other</option>
            </select>
            <div className="md:col-span-2">
              <Input
                value={aiInput.website_url}
                onChange={(e) => setAiInput((prev) => ({ ...prev, website_url: e.target.value }))}
                placeholder="Website URL (optional, not fetched)"
              />
            </div>
          </div>
          <textarea
            className="min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            value={aiInput.notes}
            onChange={(e) => setAiInput((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Notes (optional)"
          />
          {aiError ? <p className="text-sm text-rose-600">{aiError}</p> : null}
          {aiDraft ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <Input
                value={aiDraft.name_suggestion}
                onChange={(e) => setAiDraft((prev) => ({ ...prev, name_suggestion: e.target.value }))}
                placeholder="Name suggestion"
              />
              <Input
                value={aiDraft.slug_suggestion}
                onChange={(e) => setAiDraft((prev) => ({ ...prev, slug_suggestion: e.target.value }))}
                placeholder="Slug suggestion"
              />
              <Input
                value={aiDraft.location_label}
                onChange={(e) => setAiDraft((prev) => ({ ...prev, location_label: e.target.value }))}
                placeholder="Location label"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={aiDraft.guest_min}
                  onChange={(e) => setAiDraft((prev) => ({ ...prev, guest_min: e.target.value }))}
                  placeholder="Guest min"
                />
                <Input
                  type="number"
                  value={aiDraft.guest_max}
                  onChange={(e) => setAiDraft((prev) => ({ ...prev, guest_max: e.target.value }))}
                  placeholder="Guest max"
                />
              </div>
              <textarea
                className="min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                value={aiDraft.short_description}
                onChange={(e) => setAiDraft((prev) => ({ ...prev, short_description: e.target.value }))}
                placeholder="Short description"
              />
              <textarea
                className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                value={aiDraft.about}
                onChange={(e) => setAiDraft((prev) => ({ ...prev, about: e.target.value }))}
                placeholder="About"
              />
              <Input
                value={(aiDraft.tags || []).join(", ")}
                onChange={(e) => setAiDraft((prev) => ({ ...prev, tags: csvToList(e.target.value, 10, 40) }))}
                placeholder="Tags (comma separated)"
              />
              <Input
                value={(aiDraft.hero_image_search_terms || []).join(", ")}
                onChange={(e) =>
                  setAiDraft((prev) => ({ ...prev, hero_image_search_terms: csvToList(e.target.value, 6, 80) }))
                }
                placeholder="Hero image search terms (comma separated)"
              />
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

export default function VenueList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [listError, setListError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");

  async function loadVenues() {
    setLoading(true);
    setListError("");
    try {
      const resp = await apiFetch("/api/admin-venues");
      const json = await resp.json().catch(() => ({}));
      if (import.meta.env.DEV) {
        console.log("[admin-venues] response shape", json);
      }
      if (!resp.ok) throw new Error(`Failed to load venues (${resp.status}): ${json?.details || json?.error || "Request failed"}`);
      if (!Array.isArray(json?.rows)) throw new Error("Invalid venues response shape (expected { rows: [] })");
      setRows(json.rows);
    } catch (err) {
      setRows([]);
      setListError(err?.message || "Failed to load venues");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) loadVenues();
  }, [id]);

  async function createVenue(e) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const resp = await apiFetch("/api/admin-venue-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), listedPublicly: false }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to create venue");
      const venueId = json?.venueId;
      if (!venueId) throw new Error("Venue id missing");
      setCreateName("");
      navigate(`/admin/venues/${venueId}`);
    } catch (err) {
      setCreateError(err?.message || "Failed to create venue");
    } finally {
      setCreating(false);
    }
  }

  async function openAiBuilderFromList() {
    setCreating(true);
    setCreateError("");
    try {
      const initialName = createName.trim() || "Untitled venue";
      const resp = await apiFetch("/api/admin-venue-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: initialName, listedPublicly: false }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to create venue");
      const venueId = json?.venueId;
      if (!venueId) throw new Error("Venue id missing");
      setCreateName("");
      navigate(`/admin/venues/${venueId}?ai=1`);
    } catch (err) {
      setCreateError(err?.message || "Failed to open AI builder");
    } finally {
      setCreating(false);
    }
  }

  if (id) {
    const searchParams = new URLSearchParams(location.search || "");
    const autoOpenAi = searchParams.get("ai") === "1";
    return <VenueEditor venueId={id} onBack={() => navigate("/admin/venues")} autoOpenAi={autoOpenAi} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Venues" subtitle="Manage public venue listings, media, and linked suppliers." />

      <Card>
        <CardHeader>
          <CardTitle>Create venue</CardTitle>
          <CardDescription>Add a new venue record and then complete its content.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createVenue} className="flex flex-col gap-3 md:flex-row">
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Venue name"
            />
            <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create"}</Button>
            <Button type="button" variant="secondary" disabled={creating} onClick={openAiBuilderFromList}>
              {creating ? "Opening..." : "AI Draft Venue"}
            </Button>
          </form>
          {createError ? <p className="mt-2 text-sm text-rose-600">{createError}</p> : null}
        </CardContent>
      </Card>

      <Section title="Venue list" right={<Badge variant="neutral">{rows.length} total</Badge>}>
        <Card className="overflow-hidden">
          {loading ? (
            <CardContent className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          ) : listError ? (
            <CardContent className="space-y-3">
              <p className="text-sm text-rose-700">{listError}</p>
              <div>
                <Button variant="secondary" onClick={loadVenues}>Retry</Button>
              </div>
            </CardContent>
          ) : rows.length === 0 ? (
            <CardContent>
              <EmptyState title="No venues found" description="Create your first venue listing." />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Slug</TH>
                    <TH>Location</TH>
                    <TH>Guests</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((v) => (
                    <TR
                      key={v.id}
                      interactive
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/venues/${v.id}`)}
                      title="Click to edit"
                    >
                      <TD className="font-medium text-slate-900">{v.name}</TD>
                      <TD className="text-slate-600">{v.slug}</TD>
                      <TD>{v.location_label || v.city || "-"}</TD>
                      <TD>{guestLabel(v.guest_min, v.guest_max)}</TD>
                      <TD>
                        <Badge variant={isVenuePublished(v) ? "success" : "neutral"}>
                          {isVenuePublished(v) ? "Published" : "Hidden"}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
