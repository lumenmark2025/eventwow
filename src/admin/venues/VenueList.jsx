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
import { formatVenueGuestCapacity, getVenueAttentionFlags } from "../../lib/venueDisplay";
import {
  buildVenueDuplicateKey,
  findVenueTypeByName,
  inferVenueTypeName,
  parseVenueCsv,
  slugifyVenueText,
} from "../../lib/venueBulk";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BULK_CONCURRENCY = 3;
const BULK_BATCH_DELAY_MS = 300;

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  const headers = {
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  return fetch(path, { ...options, headers });
}

function getApiErrorMessage(payload, fallback = "Request failed") {
  const json = payload && typeof payload === "object" ? payload : {};
  if (typeof json.details === "string" && json.details.trim()) return json.details;
  if (typeof json.error === "string" && json.error.trim()) return json.error;
  if (json.details && typeof json.details === "object") {
    const fields = Object.entries(json.details)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
    if (fields) return fields;
  }
  if (json.error && typeof json.error === "object") {
    const msg = json.error.message || json.error.type;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTypeForAi(typeName) {
  return String(typeName || "").trim().toLowerCase() || "other";
}

function VenueEditor({ venueId, onBack, autoOpenAi, venueTypes = [] }) {
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
  const [editorVenueTypes, setEditorVenueTypes] = useState(Array.isArray(venueTypes) ? venueTypes : []);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    locationLabel: "",
    address: "",
    city: "",
    postcode: "",
    type: "",
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

  const aiTypeOptions = useMemo(() => {
    const source = Array.isArray(editorVenueTypes) ? editorVenueTypes : [];
    const fromTable = source
      .map((row) => String(row?.name || "").trim())
      .filter(Boolean);
    if (fromTable.length) return fromTable;
    return ["Hotel", "Wedding Barn", "Village Hall", "Country House", "Restaurant", "Outdoor", "Other"];
  }, [editorVenueTypes]);

  useEffect(() => {
    setEditorVenueTypes(Array.isArray(venueTypes) ? venueTypes : []);
  }, [venueTypes]);

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
        setEditorVenueTypes(Array.isArray(json?.venueTypes) ? json.venueTypes : []);
        setForm({
          name: venue.name || "",
          slug: venue.slug || "",
          locationLabel: venue.locationLabel || "",
          address: venue.address || "",
          city: venue.city || "",
          postcode: venue.postcode || "",
          type: venue.type || "",
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
        type: nextForm.type || null,
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
      venue_type: normalizeTypeForAi(form.type),
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
      if (!resp.ok) throw new Error(getApiErrorMessage(json, "Failed to generate draft"));
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
      type: form.type || "",
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
            <select
              value={form.type}
              onChange={(e) => setField("type", e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">Type (optional)</option>
              {aiTypeOptions.map((typeName) => (
                <option key={typeName} value={typeName}>{typeName}</option>
              ))}
            </select>
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
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-blue-500 focus:ring-2"
            >
              {aiTypeOptions.map((typeName) => (
                <option key={`ai-type-${typeName}`} value={normalizeTypeForAi(typeName)}>{typeName}</option>
              ))}
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
  const params = useParams();
  const id = params.venueId || params.id;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [listError, setListError] = useState("");
  const [listSuccess, setListSuccess] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [venueTypes, setVenueTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [typeError, setTypeError] = useState("");
  const [typeSuccess, setTypeSuccess] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkError, setBulkError] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");
  const [defaultTypeName, setDefaultTypeName] = useState("");
  const [autoCreateMissingTypes, setAutoCreateMissingTypes] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkSummary, setBulkSummary] = useState({ created: 0, skipped: 0, failed: 0 });
  const [draftToDelete, setDraftToDelete] = useState(null);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const notPublishedCount = useMemo(() => rows.filter((venue) => !isVenuePublished(venue)).length, [rows]);

  async function loadVenues() {
    setLoading(true);
    setListError("");
    setListSuccess("");
    try {
      const resp = await apiFetch("/api/admin-venues");
      const json = await resp.json().catch(() => ({}));
      if (import.meta.env.DEV) {
        console.log("[admin-venues] response shape", json);
      }
      if (!resp.ok) throw new Error(`Failed to load venues (${resp.status}): ${json?.details || json?.error || "Request failed"}`);
      if (!Array.isArray(json?.rows)) throw new Error("Invalid venues response shape (expected { rows: [] })");
      setRows(json.rows);
      setVenueTypes(Array.isArray(json?.venueTypes) ? json.venueTypes : []);
    } catch (err) {
      setRows([]);
      setVenueTypes([]);
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

  async function deleteDraftVenue() {
    if (!draftToDelete?.id) return;
    setDeletingDraft(true);
    setListError("");
    setListSuccess("");
    try {
      const resp = await apiFetch(`/api/admin/venues/drafts/${encodeURIComponent(draftToDelete.id)}`, {
        method: "DELETE",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(getApiErrorMessage(json, "Failed to delete draft"));
      setRows((prev) => prev.filter((row) => row.id !== draftToDelete.id));
      setListSuccess(`Deleted draft: ${draftToDelete.name || "Venue"}.`);
      setDraftToDelete(null);
    } catch (err) {
      setListError(err?.message || "Failed to delete draft");
    } finally {
      setDeletingDraft(false);
    }
  }

  async function createVenueType(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const existing = findVenueTypeByName(venueTypes, trimmed);
    if (existing) return existing;

    const resp = await apiFetch("/api/admin-venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_venue_type", name: trimmed }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(getApiErrorMessage(json, "Failed to create venue type"));
    const nextTypes = Array.isArray(json?.venueTypes) ? json.venueTypes : venueTypes;
    setVenueTypes(nextTypes);
    return findVenueTypeByName(nextTypes, trimmed) || json?.venueType || null;
  }

  async function addVenueType(e) {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    setAddingType(true);
    setTypeError("");
    setTypeSuccess("");
    try {
      const created = await createVenueType(newTypeName);
      setTypeSuccess(created?.name ? `Type ready: ${created.name}` : "Type created.");
      setNewTypeName("");
    } catch (err) {
      setTypeError(err?.message || "Failed to create venue type");
    } finally {
      setAddingType(false);
    }
  }

  function buildDuplicateReason(row) {
    const rowKey = buildVenueDuplicateKey(row.name, row.town);
    const slugCandidate = slugifyVenueText(`${row.name}-${row.town}`);
    for (const existing of rows) {
      const existingTown = existing?.city || existing?.location_label || "";
      if (buildVenueDuplicateKey(existing?.name, existingTown) === rowKey) {
        return "Duplicate name + town";
      }
      if (slugCandidate && String(existing?.slug || "").trim().toLowerCase() === slugCandidate) {
        return "Duplicate slug candidate";
      }
    }
    return "";
  }

  function previewResolvedType(row) {
    if (row.typeMatchName) return { name: row.typeMatchName, source: "csv" };
    if (row.inferredTypeMatchName) return { name: row.inferredTypeMatchName, source: "inferred" };
    if (defaultTypeName) return { name: defaultTypeName, source: "default" };
    return { name: "", source: "blank" };
  }

  function previewBulkRows() {
    const parsed = parseVenueCsv(bulkCsv);
    setBulkError("");
    setBulkNotice("");
    setBulkSummary({ created: 0, skipped: 0, failed: 0 });
    setBulkProgress({ done: 0, total: 0 });
    if (parsed.error) {
      setBulkRows([]);
      setBulkError(parsed.error);
      return;
    }
    const nextRows = parsed.rows.map((row, idx) => {
      const typeMatch = findVenueTypeByName(venueTypes, row.type);
      const inferredType = inferVenueTypeName({ name: row.name, url: row.url });
      const inferredTypeMatch = findVenueTypeByName(venueTypes, inferredType);
      const duplicateReason = buildDuplicateReason(row);
      const warnings = [];
      if (row.type && !typeMatch && !autoCreateMissingTypes) {
        warnings.push("CSV type not found; will use inferred/default/blank");
      }
      if (!row.type && inferredType && !inferredTypeMatch && !autoCreateMissingTypes) {
        warnings.push("Inferred type not in list; will use default/blank");
      }
      const resolvedPreview = previewResolvedType({
        typeMatchName: typeMatch?.name || "",
        inferredTypeMatchName: inferredTypeMatch?.name || "",
      });
      const canRun = row.errors.length === 0 && !duplicateReason;
      return {
        id: `${idx}-${row.rowNumber}`,
        rowNumber: row.rowNumber,
        name: row.name,
        url: row.url,
        town: row.town,
        csvType: row.type,
        typeMatchName: typeMatch?.name || "",
        inferredType: inferredType || "",
        inferredTypeMatchName: inferredTypeMatch?.name || "",
        previewType: resolvedPreview.name,
        previewTypeSource: resolvedPreview.source,
        errors: row.errors,
        warnings,
        duplicateReason,
        include: canRun,
        status: canRun ? "ready" : duplicateReason ? "skipped" : "failed",
        message: duplicateReason || row.errors.join("; ") || "",
        venueId: "",
      };
    });
    setBulkRows(nextRows);
    if (!nextRows.length) setBulkNotice("No data rows found.");
  }

  async function resolveTypeForRow(row) {
    if (row.csvType) {
      const csvMatch = findVenueTypeByName(venueTypes, row.csvType);
      if (csvMatch) return { name: csvMatch.name, source: "csv", note: "" };
      if (autoCreateMissingTypes) {
        const created = await createVenueType(row.csvType);
        if (created?.name) return { name: created.name, source: "csv", note: "Type auto-created from CSV" };
      }
    }

    const inferredName = row.inferredType || inferVenueTypeName({ name: row.name, url: row.url });
    if (inferredName) {
      const inferredMatch = findVenueTypeByName(venueTypes, inferredName);
      if (inferredMatch) return { name: inferredMatch.name, source: "inferred", note: "" };
      if (autoCreateMissingTypes) {
        const created = await createVenueType(inferredName);
        if (created?.name) return { name: created.name, source: "inferred", note: "Type auto-created from inference" };
      }
    }

    if (defaultTypeName) {
      const defaultMatch = findVenueTypeByName(venueTypes, defaultTypeName);
      if (defaultMatch) return { name: defaultMatch.name, source: "default", note: "" };
    }

    return {
      name: "",
      source: "blank",
      note: row.csvType ? "Unknown type from CSV; saved without type." : "",
    };
  }

  async function processBulkRow(row) {
    const typeResult = await resolveTypeForRow(row);
    const aiInput = {
      venue_name: row.name,
      town_or_city: row.town,
      county_or_region: "",
      venue_type: normalizeTypeForAi(typeResult.name),
      website_url: row.url,
      notes: typeResult.name ? `Preferred venue type: ${typeResult.name}` : "",
      bulk_mode: true,
    };

    const draftResp = await apiFetch("/api/admin/venues/ai-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiInput),
    });
    const draftJson = await draftResp.json().catch(() => ({}));
    if (!draftResp.ok) throw new Error(getApiErrorMessage(draftJson, "Failed to generate draft"));

    const aiDraft = {
      name_suggestion: draftJson?.name_suggestion || row.name,
      slug_suggestion: draftJson?.slug_suggestion || "",
      location_label: draftJson?.location_label || row.town,
      short_description: draftJson?.short_description || "",
      about: draftJson?.about || "",
      guest_min: draftJson?.guest_min ?? null,
      guest_max: draftJson?.guest_max ?? null,
      capacity_confidence: draftJson?.capacity_confidence || "low",
      tags: Array.isArray(draftJson?.tags) ? draftJson.tags : [],
      hero_image_search_terms: Array.isArray(draftJson?.hero_image_search_terms) ? draftJson.hero_image_search_terms : [],
      suggested_supplier_categories: Array.isArray(draftJson?.suggested_supplier_categories) ? draftJson.suggested_supplier_categories : [],
      disclaimers: Array.isArray(draftJson?.disclaimers) ? draftJson.disclaimers : [],
    };

    const nowIso = new Date().toISOString();
    const saveResp = await apiFetch("/api/admin-venue-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: aiDraft.name_suggestion || row.name,
        slug: aiDraft.slug_suggestion || "",
        locationLabel: aiDraft.location_label || row.town,
        city: row.town,
        type: typeResult.name || null,
        websiteUrl: row.url,
        shortDescription: aiDraft.short_description || "",
        about: aiDraft.about || "",
        guestMin: aiDraft.guest_min,
        guestMax: aiDraft.guest_max,
        listedPublicly: false,
        aiTags: aiDraft.tags,
        aiSuggestedSearchTerms: aiDraft.hero_image_search_terms,
        aiDraftMeta: {
          source: "ai_venue_builder",
          modelInput: { ...aiInput, website_url: aiInput.website_url || null },
          modelOutput: aiDraft,
          capacity_confidence: aiDraft.capacity_confidence || "low",
          suggested_supplier_categories: aiDraft.suggested_supplier_categories,
          disclaimers: aiDraft.disclaimers,
        },
        aiGeneratedAt: nowIso,
      }),
    });
    const saveJson = await saveResp.json().catch(() => ({}));
    if (!saveResp.ok) throw new Error(getApiErrorMessage(saveJson, "Failed to save draft venue"));

    return {
      venueId: saveJson?.venueId || "",
      typeName: typeResult.name || "",
      typeSource: typeResult.source,
      note: typeResult.note || "",
    };
  }

  async function runBulkGeneration(mode = "all") {
    const targets = bulkRows.filter((row) => {
      if (!row.include) return false;
      if (row.errors.length > 0 || row.duplicateReason) return false;
      if (mode === "failed") return row.status === "failed";
      return row.status === "ready" || row.status === "failed";
    });
    if (targets.length === 0) {
      setBulkNotice(mode === "failed" ? "No failed rows to retry." : "No valid selected rows to process.");
      return;
    }

    setBulkRunning(true);
    setBulkError("");
    setBulkNotice("");
    setBulkProgress({ done: 0, total: targets.length });

    const idSet = new Set(targets.map((row) => row.id));
    setBulkRows((prev) =>
      prev.map((row) => (idSet.has(row.id) ? { ...row, status: "pending", message: "", venueId: "" } : row))
    );

    let done = 0;
    let created = 0;
    let skipped = bulkRows.filter((row) => row.duplicateReason).length;
    let failed = 0;

    for (let i = 0; i < targets.length; i += BULK_CONCURRENCY) {
      const batch = targets.slice(i, i + BULK_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (row) => {
          try {
            const outcome = await processBulkRow(row);
            return { id: row.id, ok: true, outcome };
          } catch (err) {
            return { id: row.id, ok: false, error: err?.message || "Unknown error" };
          }
        })
      );

      done += results.length;
      setBulkProgress({ done, total: targets.length });
      created += results.filter((result) => result.ok).length;
      failed += results.filter((result) => !result.ok).length;

      const resultById = new Map(results.map((result) => [result.id, result]));
      setBulkRows((prev) =>
        prev.map((row) => {
          const result = resultById.get(row.id);
          if (!result) return row;
          if (result.ok) {
            return {
              ...row,
              status: "success",
              venueId: result.outcome.venueId,
              previewType: result.outcome.typeName || row.previewType,
              previewTypeSource: result.outcome.typeSource || row.previewTypeSource,
              message: result.outcome.note || "Created draft",
            };
          }
          return { ...row, status: "failed", message: result.error || "Failed" };
        })
      );

      if (i + BULK_CONCURRENCY < targets.length) {
        await delay(BULK_BATCH_DELAY_MS);
      }
    }

    setBulkSummary({ created, skipped, failed });
    setBulkRunning(false);
    await loadVenues();
  }

  function updateBulkRowInclude(rowId, checked) {
    setBulkRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, include: checked } : row)));
  }

  async function loadCsvFile(file) {
    if (!file) return;
    const text = await file.text();
    setBulkCsv(text);
  }

  if (id) {
    const searchParams = new URLSearchParams(location.search || "");
    const autoOpenAi = searchParams.get("ai") === "1";
    return <VenueEditor venueId={id} onBack={() => navigate("/admin/venues")} autoOpenAi={autoOpenAi} venueTypes={venueTypes} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Venues" subtitle="Manage public venue listings, media, and linked suppliers." />

      <Card>
        <CardHeader>
          <CardTitle>Create venue</CardTitle>
          <CardDescription>Add a new venue record, run AI draft, or bulk-create draft venues from CSV.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <Button type="button" variant="secondary" disabled={creating} onClick={() => setBulkOpen(true)}>
              Bulk Add Venues (AI)
            </Button>
          </form>
          {createError ? <p className="mt-2 text-sm text-rose-600">{createError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage venue types</CardTitle>
          <CardDescription>Add and maintain venue type options used by AI tools and admin editors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addVenueType} className="flex flex-col gap-3 md:flex-row">
            <Input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="New venue type (e.g. Wedding Barn)"
            />
            <Button type="submit" disabled={addingType || !newTypeName.trim()}>
              {addingType ? "Adding..." : "Add type"}
            </Button>
          </form>
          {typeError ? <p className="text-sm text-rose-600">{typeError}</p> : null}
          {typeSuccess ? <p className="text-sm text-emerald-700">{typeSuccess}</p> : null}
          <div className="flex flex-wrap gap-2">
            {venueTypes.length === 0 ? (
              <span className="text-sm text-slate-500">No venue types found.</span>
            ) : (
              venueTypes.map((type) => <Badge key={type.id || type.slug || type.name} variant="neutral">{type.name}</Badge>)
            )}
          </div>
        </CardContent>
      </Card>

      <Section
        title="Venue list"
        right={(
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{rows.length} total</Badge>
            <Badge variant="warning">{notPublishedCount} not published</Badge>
          </div>
        )}
      >
        <Card className="overflow-hidden">
          {listSuccess ? <p className="px-6 pt-4 text-sm text-emerald-700">{listSuccess}</p> : null}
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
                    <TH>Quality</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((v) => {
                    const attention = getVenueAttentionFlags(v);
                    return (
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
                        <TD>{formatVenueGuestCapacity(v.guest_min, v.guest_max) || "-"}</TD>
                        <TD>
                          {attention.needsAttention ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="warning">Needs attention</Badge>
                              {attention.issues.map((issue) => (
                                <Badge key={`${v.id}-${issue}`} variant="neutral">{issue}</Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TD>
                        <TD>
                          <Badge variant={isVenuePublished(v) ? "success" : "neutral"}>
                            {isVenuePublished(v) ? "Published" : "Hidden"}
                          </Badge>
                        </TD>
                        <TD className="text-right">
                          {!isVenuePublished(v) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="border-rose-200 text-rose-700 hover:bg-rose-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDraftToDelete(v);
                              }}
                            >
                              Delete
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </Section>

      <Modal
        open={!!draftToDelete}
        onClose={() => {
          if (deletingDraft) return;
          setDraftToDelete(null);
        }}
        title="Delete draft venue?"
        footer={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setDraftToDelete(null)} disabled={deletingDraft}>
              Cancel
            </Button>
            <Button type="button" onClick={deleteDraftVenue} disabled={deletingDraft}>
              {deletingDraft ? "Deleting..." : "Delete draft"}
            </Button>
          </div>
        )}
      >
        <p className="text-sm text-slate-700">
          This permanently deletes the unpublished draft
          {draftToDelete?.name ? ` "${draftToDelete.name}"` : ""} and removes any uploaded venue images.
        </p>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => {
          if (bulkRunning) return;
          setBulkOpen(false);
        }}
        title="Bulk Add Venues (AI)"
        footer={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={previewBulkRows} disabled={bulkRunning}>
              Preview CSV
            </Button>
            <Button type="button" onClick={() => runBulkGeneration("all")} disabled={bulkRunning || bulkRows.length === 0}>
              {bulkRunning ? "Generating..." : "Generate Drafts"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => runBulkGeneration("failed")}
              disabled={bulkRunning || bulkRows.every((row) => row.status !== "failed")}
            >
              Retry failed rows
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">CSV header required: <code>name,url,town,type</code>. The <code>type</code> column is optional.</p>
          <textarea
            className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            value={bulkCsv}
            onChange={(e) => setBulkCsv(e.target.value)}
            placeholder={"name,url,town,type\nThe Old Barn,https://example.com,Cartmel,Wedding Barn"}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => loadCsvFile(e.target.files?.[0])}
              />
            </label>
            <select
              value={defaultTypeName}
              onChange={(e) => setDefaultTypeName(e.target.value)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">Default type (optional)</option>
              {venueTypes.map((type) => (
                <option key={`default-${type.id || type.slug || type.name}`} value={type.name}>{type.name}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={autoCreateMissingTypes}
                onChange={(e) => setAutoCreateMissingTypes(e.target.checked)}
              />
              Auto-create missing types from CSV
            </label>
          </div>

          {bulkError ? <p className="text-sm text-rose-600">{bulkError}</p> : null}
          {bulkNotice ? <p className="text-sm text-slate-600">{bulkNotice}</p> : null}
          {bulkRunning ? (
            <p className="text-sm text-slate-700">Progress: {bulkProgress.done}/{bulkProgress.total}</p>
          ) : null}
          {(bulkSummary.created || bulkSummary.skipped || bulkSummary.failed) ? (
            <p className="text-sm text-slate-700">
              Created: {bulkSummary.created} | Skipped duplicates: {bulkSummary.skipped} | Failed: {bulkSummary.failed}
            </p>
          ) : null}

          {bulkRows.length > 0 ? (
            <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200">
              <Table>
                <THead>
                  <TR>
                    <TH>Include</TH>
                    <TH>Row</TH>
                    <TH>Name</TH>
                    <TH>Town</TH>
                    <TH>Type</TH>
                    <TH>Status</TH>
                    <TH>Details</TH>
                    <TH>Edit</TH>
                  </TR>
                </THead>
                <TBody>
                  {bulkRows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={!!row.include}
                          disabled={row.errors.length > 0 || !!row.duplicateReason || bulkRunning}
                          onChange={(e) => updateBulkRowInclude(row.id, e.target.checked)}
                        />
                      </TD>
                      <TD>{row.rowNumber}</TD>
                      <TD className="max-w-[180px] truncate">{row.name}</TD>
                      <TD className="max-w-[130px] truncate">{row.town}</TD>
                      <TD>
                        {row.previewType ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="neutral">{row.previewType}</Badge>
                            <span className="text-xs text-slate-500">{row.previewTypeSource}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">blank</span>
                        )}
                      </TD>
                      <TD>
                        {row.status === "success" ? <Badge variant="success">Success</Badge> : null}
                        {row.status === "failed" ? <Badge variant="danger">Failed</Badge> : null}
                        {row.status === "skipped" ? <Badge variant="warning">Skipped</Badge> : null}
                        {row.status === "pending" ? <Badge variant="brand">Pending</Badge> : null}
                        {row.status === "ready" ? <Badge variant="neutral">Ready</Badge> : null}
                      </TD>
                      <TD className="max-w-[240px]">
                        {row.errors.length ? <p className="text-xs text-rose-600">{row.errors.join("; ")}</p> : null}
                        {row.duplicateReason ? <p className="text-xs text-amber-700">{row.duplicateReason}</p> : null}
                        {row.warnings.length ? <p className="text-xs text-slate-600">{row.warnings.join("; ")}</p> : null}
                        {row.message ? <p className="text-xs text-slate-600">{row.message}</p> : null}
                      </TD>
                      <TD>
                        {row.venueId ? (
                          <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/admin/venues/${row.venueId}`)}>
                            Edit draft
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
