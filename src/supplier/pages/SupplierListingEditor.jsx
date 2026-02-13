import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";
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
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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
    categories: Array.isArray(supplier?.categories) ? supplier.categories : [],
    listedPublicly: !!supplier?.listedPublicly,
  };
}

export default function SupplierListingEditor({ supplierId }) {
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
      source.listedPublicly === draft.listedPublicly &&
      arraysEqual(source.services, draft.services) &&
      arraysEqual(source.categories, draft.categories)
    );
  }, [profile, draft]);

  const canPublish = useMemo(() => {
    if (!draft) return false;
    const heroCount = media?.hero ? 1 : 0;
    const galleryCount = Array.isArray(media?.gallery) ? media.gallery.length : 0;
    const servicesCount = Array.isArray(draft.services) ? draft.services.filter((x) => String(x || "").trim().length > 0).length : 0;
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

  const publishMissing = useMemo(() => {
    if (!draft) return [];
    const missing = [];
    if (String(draft.shortDescription || "").trim().length < 30) missing.push("short description (>=30 chars)");
    if (String(draft.about || "").trim().length < 120) missing.push("about section (>=120 chars)");
    if (!Array.isArray(draft.categories) || draft.categories.length === 0) missing.push("at least one category");
    if (String(draft.locationLabel || "").trim().length < 3) missing.push("location label (>=3 chars)");
    if (!media?.hero) missing.push("hero image");
    if (!Array.isArray(media?.gallery) || media.gallery.length < 2) missing.push("at least 2 gallery images");
    if (!Array.isArray(draft.services) || draft.services.filter((x) => String(x || "").trim().length > 0).length < 3) {
      missing.push("at least 3 services");
    }
    return missing;
  }, [draft, media]);

  async function loadProfile() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      const resp = await authFetch("/api/supplier-public-profile");
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load listing");

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setCategoryOptions(Array.isArray(json?.categoryOptions) ? json.categoryOptions : []);
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

  function onToggleListedPublicly(checked) {
    if (checked && !canPublish) {
      const detail =
        publishMissing.length > 0
          ? `Add ${publishMissing.join(" and ")} before publishing.`
          : "Complete required listing fields before publishing.";
      setErr(detail);
      return;
    }
    updateDraft("listedPublicly", checked);
  }

  function toggleCategory(name) {
    setDraft((prev) => {
      const existing = Array.isArray(prev?.categories) ? prev.categories : [];
      const next = existing.includes(name) ? existing.filter((x) => x !== name) : [...existing, name];
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
      if (current.some((x) => x.toLowerCase() === value.toLowerCase())) return prev;
      return { ...(prev || {}), services: [...current, value] };
    });
    setNewService("");
    setErr("");
    setOk("");
  }

  function removeService(index) {
    setDraft((prev) => {
      const current = Array.isArray(prev?.services) ? prev.services : [];
      return { ...(prev || {}), services: current.filter((_, idx) => idx !== index) };
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
          categories: draft.categories,
          listedPublicly: draft.listedPublicly && canPublish,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (json?.supplier || json?.media) {
          setProfile(json?.supplier || null);
          setMedia(json?.media || { hero: null, gallery: [] });
          setCategoryOptions(Array.isArray(json?.categoryOptions) ? json.categoryOptions : []);
          setDraft(normalizeDraft(json?.supplier || {}));
        }
        const gateReason = Array.isArray(json?.gate?.reasons) ? json.gate.reasons.join(" ") : "";
        throw new Error(gateReason || json?.details || json?.error || "Failed to save listing");
      }

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setCategoryOptions(Array.isArray(json?.categoryOptions) ? json.categoryOptions : []);
      setDraft(normalizeDraft(json?.supplier || {}));
      setOk("Listing updated.");
    } catch (e) {
      setErr(e?.message || "Failed to save listing");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file, type) {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
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
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to upload image");

      setProfile(json?.supplier || null);
      setMedia(json?.media || { hero: null, gallery: [] });
      setCategoryOptions(Array.isArray(json?.categoryOptions) ? json.categoryOptions : []);
      setDraft(normalizeDraft(json?.supplier || {}));
      setOk(type === "hero" ? "Hero image updated." : "Gallery image uploaded.");
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
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to delete image");

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
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to reorder gallery");

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
          <Skeleton className="h-[620px] xl:col-span-2" />
          <Skeleton className="h-[620px]" />
        </div>
      </div>
    );
  }

  if (!profile || !draft) {
    return <EmptyState title="Listing unavailable" description={err || "Could not load your public listing."} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Public listing"
        subtitle="Control your supplier profile copy, images, and listing visibility."
        actions={[{ key: "refresh", label: "Refresh", variant: "secondary", onClick: loadProfile }]}
      />

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div> : null}
      {ok ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={draft.listedPublicly ? "success" : "neutral"}>
                  {draft.listedPublicly ? "Listed publicly" : "Hidden from directory"}
                </Badge>
                {!canPublish ? <Badge variant="warning">Complete required fields to publish</Badge> : null}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={draft.listedPublicly}
                  onChange={(e) => onToggleListedPublicly(e.target.checked)}
                />
                Show this supplier in the public directory
              </label>
              {!canPublish ? (
                <p className="text-xs text-amber-700">
                  Required before publish: {publishMissing.join(" and ")}.
                </p>
              ) : null}
              <div className="text-xs text-slate-500">
                Slug: <span className="font-medium text-slate-700">{profile.slug || "Not set"}</span> (read-only)
              </div>
              <div className="text-xs text-slate-500">
                Business name: <span className="font-medium text-slate-700">{profile.name || "-"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile copy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Short description</label>
                <Input
                  value={draft.shortDescription}
                  onChange={(e) => updateDraft("shortDescription", e.target.value)}
                  maxLength={160}
                  placeholder="One-line summary customers see in cards"
                />
                <p className="mt-1 text-xs text-slate-500">{draft.shortDescription.length}/160</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">About</label>
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  value={draft.about}
                  onChange={(e) => updateDraft("about", e.target.value)}
                  maxLength={4000}
                  placeholder="Describe your style, experience, and what customers can expect"
                />
                <p className="mt-1 text-xs text-slate-500">{draft.about.length}/4000</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Location / service area</label>
                <Input
                  value={draft.locationLabel}
                  onChange={(e) => updateDraft("locationLabel", e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Manchester and North West"
                />
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
                  <span key={`${service}-${idx}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
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
                <Button type="button" variant="secondary" onClick={addService} disabled={(draft.services || []).length >= 12}>
                  Add
                </Button>
              </div>
              <p className="text-xs text-slate-500">{(draft.services || []).length}/12 services</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(categoryOptions || []).map((name) => {
                  const checked = (draft.categories || []).includes(name);
                  return (
                    <label key={name} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
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

          <div className="flex items-center gap-2">
            <Button type="button" onClick={saveProfile} disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
            {dirty ? <span className="text-sm text-amber-700">Unsaved changes</span> : <span className="text-sm text-slate-500">All changes saved</span>}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hero image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                  onChange={(e) => uploadImage(e.target.files?.[0], "hero")}
                />
                <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {uploadingHero ? "Uploading..." : "Upload hero image"}
                </span>
              </label>
              {media.hero?.id ? (
                <Button type="button" variant="ghost" className="w-full" onClick={() => deleteImage(media.hero.id)}>
                  Delete hero image
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gallery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => uploadImage(e.target.files?.[0], "gallery")}
                />
                <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {uploadingGallery ? "Uploading..." : "Add gallery image"}
                </span>
              </label>

              {(media.gallery || []).length === 0 ? (
                <p className="text-sm text-slate-500">No gallery images yet.</p>
              ) : (
                <div className="space-y-2">
                  {media.gallery.map((img, idx) => (
                    <div key={img.id} className="rounded-xl border border-slate-200 p-2">
                      <img src={img.url} alt={img.caption || "Gallery"} className="h-24 w-full rounded-lg object-cover" />
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={idx === 0}
                          onClick={() => moveGalleryItem(idx, "up")}
                        >
                          Up
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={idx === media.gallery.length - 1}
                          onClick={() => moveGalleryItem(idx, "down")}
                        >
                          Down
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
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
