import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Textarea,
  Skeleton,
  EmptyState,
  FormField,
  FormActions,
  Feedback,
} from "../../components/workspace/AdminPrimitives";
import { ExternalLink, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } =
    await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;

  let accessToken = sessionData?.session?.access_token || "";
  if (!accessToken) {
    const refreshResp = await supabase.auth.refreshSession();
    accessToken = refreshResp?.data?.session?.access_token || "";
    if (refreshResp?.error) {
      throw new Error("Session expired. Please sign in again.");
    }
  }

  if (!accessToken) {
    await supabase.auth.signOut();
    throw new Error("Session expired. Please sign in again.");
  }

  const resp = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });

  if (resp.status === 401) {
    await supabase.auth.signOut();
    throw new Error("Session expired. Please sign in again.");
  }

  return resp;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((v, idx) => v === b[idx]);
}

function normalizeDraft(supplier) {
  return {
    shortDescription: supplier?.shortDescription || "",
    about: supplier?.about || "",
    services: Array.isArray(supplier?.services) ? supplier.services : [],
    locationLabel: supplier?.locationLabel || "",
    basePostcode: supplier?.basePostcode || "",
    travelRadiusMiles: Number.isFinite(Number(supplier?.travelRadiusMiles))
      ? Math.max(
          10,
          Math.min(200, Math.trunc(Number(supplier.travelRadiusMiles))),
        )
      : 30,
    categories: Array.isArray(supplier?.categories) ? supplier.categories : [],
    isPublished: !!supplier?.isPublished,
  };
}

function normalizeUkPostcode(value) {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`.trim();
}

function isValidUkPostcode(value) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}$/.test(String(value || "").trim());
}

function getVisibilityState(draft, profile, supplier) {
  if (draft?.isPublished) {
    return {
      key: "live",
      badgeText: "Live in directory",
      badgeVariant: "success",
    };
  }
  const status = String(
    profile?.onboardingStatus ||
      profile?.onboarding_status ||
      profile?.status ||
      supplier?.onboarding_status ||
      supplier?.status ||
      "",
  ).toLowerCase();
  if (status === "pending_review") {
    return {
      key: "pending",
      badgeText: "Pending review",
      badgeVariant: "warning",
    };
  }
  return { key: "not_live", badgeText: "Not live", badgeVariant: "neutral" };
}

export default function SupplierListingEditor({ supplierId, supplier }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [profile, setProfile] = useState(null);
  const [media, setMedia] = useState({ hero: null, gallery: [] });
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [draft, setDraft] = useState(null);
  const [newService, setNewService] = useState("");

  const dirty = useMemo(() => {
    if (!profile || !draft) return false;
    const source = normalizeDraft(profile);
    return !(
      source.shortDescription === draft.shortDescription &&
      source.about === draft.about &&
      source.locationLabel === draft.locationLabel &&
      source.basePostcode === draft.basePostcode &&
      Number(source.travelRadiusMiles || 30) ===
        Number(draft.travelRadiusMiles || 30) &&
      source.isPublished === draft.isPublished &&
      arraysEqual(source.services, draft.services) &&
      arraysEqual(source.categories, draft.categories)
    );
  }, [profile, draft]);

  const canPublish = useMemo(() => {
    if (!draft) return false;
    const heroCount = media?.hero ? 1 : 0;
    const galleryCount = Array.isArray(media?.gallery)
      ? media.gallery.length
      : 0;
    const servicesCount = Array.isArray(draft.services)
      ? draft.services.filter((x) => String(x || "").trim().length > 0).length
      : 0;
    return (
      String(draft.shortDescription || "").trim().length >= 30 &&
      String(draft.about || "").trim().length >= 120 &&
      Array.isArray(draft.categories) &&
      draft.categories.length > 0 &&
      String(draft.locationLabel || "").trim().length >= 3 &&
      heroCount >= 1 &&
      galleryCount >= 2 &&
      servicesCount >= 3
    );
  }, [draft, media]);

  async function loadProfile() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      const resp = await authFetch("/api/supplier-public-profile");
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to load listing",
        );

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setCategoryOptions(
        Array.isArray(json?.categoryOptions) ? json.categoryOptions : [],
      );
      setDraft(normalizeDraft(json?.supplier || {}));
    } catch (e) {
      const message = e?.message || "Failed to load listing";
      setErr(message);
      if (message.toLowerCase().includes("session expired")) {
        window.location.assign("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  useEffect(() => {
    function onBeforeUnload(e) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...(prev || {}), [key]: value }));
    setErr("");
    setOk("");
  }

  function toggleCategory(name) {
    setDraft((prev) => {
      const existing = Array.isArray(prev?.categories) ? prev.categories : [];
      const next = existing.includes(name)
        ? existing.filter((x) => x !== name)
        : [...existing, name];
      return { ...(prev || {}), categories: next };
    });
    setErr("");
    setOk("");
  }

  function addService() {
    const value = String(newService || "").trim();
    if (!value) return;
    if (value.length > 80) {
      setErr("Service items must be 80 characters or less.");
      return;
    }
    setDraft((prev) => {
      const current = Array.isArray(prev?.services) ? prev.services : [];
      if (current.length >= 12) return prev;
      if (current.some((x) => x.toLowerCase() === value.toLowerCase()))
        return prev;
      return { ...(prev || {}), services: [...current, value] };
    });
    setNewService("");
    setErr("");
    setOk("");
  }

  function removeService(index) {
    setDraft((prev) => {
      const current = Array.isArray(prev?.services) ? prev.services : [];
      return {
        ...(prev || {}),
        services: current.filter((_, idx) => idx !== index),
      };
    });
    setErr("");
    setOk("");
  }

  async function saveProfile() {
    if (!draft || saving) return;
    if (draft.shortDescription.trim().length > 160) {
      setErr("Short description must be 160 characters or less.");
      return;
    }
    if (draft.about.trim().length > 4000) {
      setErr("About section must be 4000 characters or less.");
      return;
    }
    if ((draft.services || []).length > 12) {
      setErr("Services must contain 12 items or fewer.");
      return;
    }
    const normalizedPostcode = normalizeUkPostcode(draft.basePostcode || "");
    if (normalizedPostcode && !isValidUkPostcode(normalizedPostcode)) {
      setErr("Enter a valid UK postcode (for example LA1 1AA).");
      return;
    }
    const radius = Number(draft.travelRadiusMiles);
    if (
      !Number.isFinite(radius) ||
      Math.trunc(radius) < 10 ||
      Math.trunc(radius) > 200
    ) {
      setErr("Travel radius must be between 10 and 200 miles.");
      return;
    }

    setSaving(true);
    setErr("");
    setOk("");
    try {
      const resp = await authFetch("/api/supplier-public-profile-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortDescription: draft.shortDescription,
          about: draft.about,
          services: draft.services,
          locationLabel: draft.locationLabel,
          basePostcode: normalizedPostcode || null,
          travelRadiusMiles: Math.trunc(radius),
          categories: draft.categories,
          isPublished: draft.isPublished && canPublish,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (json?.supplier || json?.media) {
          setProfile(json?.supplier || null);
          setMedia(json?.media || { hero: null, gallery: [] });
          setCategoryOptions(
            Array.isArray(json?.categoryOptions) ? json.categoryOptions : [],
          );
          setDraft(normalizeDraft(json?.supplier || {}));
        }
        const gateReason = Array.isArray(json?.gate?.reasons)
          ? json.gate.reasons.join(" ")
          : "";
        throw new Error(
          gateReason ||
            json?.details ||
            json?.error ||
            "Failed to save listing",
        );
      }

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setCategoryOptions(
        Array.isArray(json?.categoryOptions) ? json.categoryOptions : [],
      );
      setDraft(normalizeDraft(json?.supplier || {}));
      if (json?.warning) {
        setOk(`Listing updated. ${json.warning}`);
      } else {
        setOk("Listing updated.");
      }
    } catch (e) {
      setErr(e?.message || "Failed to save listing");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file, type) {
    if (!file) return;
    if (
      !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      setErr("Only JPG, PNG, or WEBP images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Image must be 5MB or smaller.");
      return;
    }

    const setBusy = type === "hero" ? setUploadingHero : setUploadingGallery;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const dataBase64 = await toBase64(file);
      const resp = await authFetch("/api/supplier-upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          mimeType: file.type,
          fileName: file.name,
          dataBase64,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to upload image",
        );

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setCategoryOptions(
        Array.isArray(json?.categoryOptions) ? json.categoryOptions : [],
      );
      setDraft(normalizeDraft(json?.supplier || {}));
      setOk(
        type === "hero" ? "Hero image updated." : "Gallery image uploaded.",
      );
    } catch (e) {
      setErr(e?.message || "Failed to upload image");
    } finally {
      setBusy(false);
    }
  }

  async function deleteImage(imageId) {
    if (!imageId) return;
    setErr("");
    setOk("");
    try {
      const resp = await authFetch("/api/supplier-delete-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to delete image",
        );

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setDraft(normalizeDraft(json?.supplier || {}));
      setOk("Image removed.");
    } catch (e) {
      setErr(e?.message || "Failed to delete image");
    }
  }

  async function reorderGallery(nextOrderedIds) {
    setErr("");
    setOk("");
    try {
      const resp = await authFetch("/api/supplier-reorder-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedImageIds: nextOrderedIds }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to reorder gallery",
        );

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setDraft(normalizeDraft(json?.supplier || {}));
    } catch (e) {
      setErr(e?.message || "Failed to reorder gallery");
    }
  }

  function moveGalleryItem(index, direction) {
    const gallery = Array.isArray(media?.gallery) ? media.gallery : [];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= gallery.length) return;
    const next = [...gallery];
    const a = next[index];
    next[index] = next[target];
    next[target] = a;
    reorderGallery(next.map((img) => img.id));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-96 xl:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!profile || !draft) {
    return (
      <div className="ew-page-stack">
        <PageHeader title="Public listing" />
        {err ? (
          <Feedback onRetry={loadProfile}>{err}</Feedback>
        ) : (
          <EmptyState
            title="Listing unavailable"
            description="Could not load your public listing."
            actionLabel="Refresh"
            onAction={loadProfile}
          />
        )}
      </div>
    );
  }

  const visibility = getVisibilityState(draft, profile, supplier);
  const listingSlug = profile.slug || "not-set";
  const listingUrl = `https://eventwow.co.uk/suppliers/${listingSlug}`;

  return (
    <div className="ew-page-stack">
      <PageHeader
        title="Public listing"
        subtitle="Manage your profile copy, services and images. Publication is reviewed by an admin."
        actions={[
          {
            key: "refresh",
            label: "Refresh",
            variant: "secondary",
            onClick: loadProfile,
            disabled: saving || uploadingHero || uploadingGallery,
          },
        ]}
      />

      {err && <Feedback>{err}</Feedback>}
      {ok && <Feedback tone="success">{ok}</Feedback>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Directory visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={visibility.badgeVariant}>
                  {visibility.badgeText}
                </Badge>
              </div>
              {visibility.key === "live" ? (
                <p className="ew-form-help">
                  Your listing is visible to customers in the public directory.
                </p>
              ) : (
                <>
                  <p className="ew-form-help">
                    Only admins can publish listings. You can request to be
                    listed, and we'll review it.
                  </p>
                  {visibility.key === "pending" ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-sm font-medium text-slate-800">
                        Request sent
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        We've received your request. An admin will review your
                        listing before it goes live.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-sm font-medium text-slate-800">
                        Request listing
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        To request publication, contact support or update your
                        profile and we'll review it.
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="ew-form-help">
                <span className="mr-2">Listing URL</span>
                <a
                  href={listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ew-link inline-flex items-center gap-1 break-all"
                >
                  {listingUrl}
                  <ExternalLink
                    size={14}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                </a>
              </div>
              <div className="ew-form-help">
                Business name:{" "}
                <span className="font-medium text-slate-700">
                  {profile.name || "-"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile copy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                label="Short description"
                help={`${draft.shortDescription.length}/160 characters`}
              >
                <Input
                  value={draft.shortDescription}
                  onChange={(e) =>
                    updateDraft("shortDescription", e.target.value)
                  }
                  maxLength={160}
                  placeholder="One-line summary customers see in cards"
                />
              </FormField>
              <FormField
                label="About"
                help={`${draft.about.length}/4000 characters`}
              >
                <Textarea
                  rows={6}
                  value={draft.about}
                  onChange={(e) => updateDraft("about", e.target.value)}
                  maxLength={4000}
                  placeholder="Describe your style, experience, and what customers can expect"
                />
              </FormField>
              <FormField label="Location / service area">
                <Input
                  value={draft.locationLabel}
                  onChange={(e) => updateDraft("locationLabel", e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Manchester and North West"
                />
              </FormField>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  label="Base postcode"
                  error={
                    err.startsWith("Enter a valid UK postcode")
                      ? err
                      : undefined
                  }
                >
                  <Input
                    value={draft.basePostcode}
                    onChange={(e) =>
                      updateDraft(
                        "basePostcode",
                        normalizeUkPostcode(e.target.value),
                      )
                    }
                    maxLength={8}
                    placeholder="e.g. LA1 1AA"
                  />
                </FormField>
                <FormField label="Travel radius (miles)">
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    value={draft.travelRadiusMiles}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n))
                        return updateDraft("travelRadiusMiles", 30);
                      updateDraft(
                        "travelRadiusMiles",
                        Math.max(10, Math.min(200, Math.trunc(n))),
                      );
                    }}
                  />
                </FormField>
              </div>
              <div>
                <input
                  type="range"
                  aria-label="Adjust travel radius in miles"
                  aria-describedby="travel-radius-help"
                  min={10}
                  max={200}
                  step={1}
                  value={Number(draft.travelRadiusMiles || 30)}
                  onChange={(e) =>
                    updateDraft(
                      "travelRadiusMiles",
                      Math.max(
                        10,
                        Math.min(200, Math.trunc(Number(e.target.value) || 30)),
                      ),
                    )
                  }
                  className="w-full"
                  style={{ accentColor: "var(--ew-action)" }}
                />
                <p id="travel-radius-help" className="ew-form-help">
                  Used to match you to nearby enquiries and search results.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(draft.services || []).map((service, idx) => (
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
                      <X size={16} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="New service"
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  maxLength={80}
                  placeholder="Add a service bullet"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addService}
                  disabled={(draft.services || []).length >= 12}
                >
                  Add
                </Button>
              </div>
              <p className="ew-form-help">
                {(draft.services || []).length}/12 services
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryOptions.length === 0 && (
                <p className="ew-form-help">No categories available.</p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(categoryOptions || []).map((name) => {
                  const checked = (draft.categories || []).includes(name);
                  return (
                    <label key={name} className="ew-checkbox-label">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={checked}
                        onChange={() => toggleCategory(name)}
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <FormActions>
            <p className="ew-form-help mr-auto self-center" role="status">
              {dirty ? "Unsaved changes" : "All changes saved"}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={saving || !dirty}
              onClick={() => {
                setDraft(normalizeDraft(profile));
                setNewService("");
                setErr("");
                setOk("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveProfile}
              disabled={saving || !dirty}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </FormActions>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hero image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {media.hero?.url ? (
                <img
                  src={media.hero.url}
                  alt="Hero"
                  className="h-40 w-full rounded-xl object-cover"
                />
              ) : (
                <EmptyState
                  title="No hero image"
                  description="Add a photo to introduce your business."
                />
              )}
              <FormField
                label={uploadingHero ? "Uploading..." : "Upload hero image"}
                help="JPG, PNG or WEBP. Maximum 5MB."
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="ew-file-input"
                  disabled={uploadingHero}
                  onChange={(e) => uploadImage(e.target.files?.[0], "hero")}
                />
              </FormField>
              {media.hero?.id ? (
                <div className="ew-destructive-actions">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => deleteImage(media.hero.id)}
                  >
                    Delete hero image
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gallery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField
                label={uploadingGallery ? "Uploading..." : "Add gallery image"}
                help="JPG, PNG or WEBP. Maximum 5MB."
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="ew-file-input"
                  disabled={uploadingGallery}
                  onChange={(e) => uploadImage(e.target.files?.[0], "gallery")}
                />
              </FormField>

              {(media.gallery || []).length === 0 ? (
                <p className="text-sm text-slate-500">No gallery images yet.</p>
              ) : (
                <div className="space-y-2">
                  {media.gallery.map((img, idx) => (
                    <div
                      key={img.id}
                      className="rounded-xl border border-slate-200 p-2"
                    >
                      <img
                        src={img.url}
                        alt={img.caption || `Gallery image ${idx + 1}`}
                        className="h-24 w-full rounded-lg object-cover"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={`Move gallery image ${idx + 1} up`}
                          disabled={idx === 0}
                          onClick={() => moveGalleryItem(idx, "up")}
                        >
                          Up
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={`Move gallery image ${idx + 1} down`}
                          disabled={idx === media.gallery.length - 1}
                          onClick={() => moveGalleryItem(idx, "down")}
                        >
                          Down
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          aria-label={`Delete gallery image ${idx + 1}`}
                          onClick={() => deleteImage(img.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
