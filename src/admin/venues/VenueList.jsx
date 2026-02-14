import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
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

function VenueEditor({ venueId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [linkedSupplierIds, setLinkedSupplierIds] = useState([]);

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

  async function saveVenue() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        venueId,
        name: form.name,
        slug: form.slug,
        locationLabel: form.locationLabel,
        address: form.address,
        city: form.city,
        postcode: form.postcode,
        guestMin: form.guestMin === "" ? null : Number(form.guestMin),
        guestMax: form.guestMax === "" ? null : Number(form.guestMax),
        shortDescription: form.shortDescription,
        about: form.about,
        websiteUrl: form.websiteUrl,
        listedPublicly: form.listedPublicly,
      };
      const resp = await apiFetch("/api/admin-venue-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to save venue");
      setSuccess("Venue saved.");
      setDirty(false);
    } catch (err) {
      setError(err?.message || "Failed to save venue");
    } finally {
      setSaving(false);
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
      const resp = await apiFetch("/api/admin-venue-upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          type,
          mimeType: file.type || "image/jpeg",
          dataBase64,
          caption: null,
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
      const resp = await apiFetch("/api/admin-venue-delete-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
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
    </div>
  );
}

export default function VenueList() {
  const navigate = useNavigate();
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

  if (id) {
    return <VenueEditor venueId={id} onBack={() => navigate("/admin/venues")} />;
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
