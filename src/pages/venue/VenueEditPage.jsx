import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  const headers = {
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  const resp = await fetch(path, { ...options, headers });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

function toStatusLabel(venue) {
  if (venue?.requires_review) return { label: "Pending Review", variant: "warning" };
  if (venue?.is_published) return { label: "Published", variant: "success" };
  return { label: "Draft", variant: "neutral" };
}

export default function VenueEditPage() {
  const { venueId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [venue, setVenue] = useState(null);
  const [form, setForm] = useState({
    shortDescription: "",
    description: "",
    guestMin: "",
    guestMax: "",
    facilitiesText: "",
  });

  const status = useMemo(() => toStatusLabel(venue), [venue]);

  async function loadVenue() {
    if (!venueId) return;
    setLoading(true);
    setError("");
    try {
      const json = await apiFetch("/api/venue/my-venues");
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      const found = rows.find((row) => String(row.id) === String(venueId)) || null;
      if (!found) {
        setVenue(null);
        setError("Venue not found or not owned by your account.");
        return;
      }
      setVenue(found);
      setForm({
        shortDescription: found.short_description || "",
        description: found.description || "",
        guestMin: found.guest_min ?? "",
        guestMax: found.guest_max ?? "",
        facilitiesText: Array.isArray(found.facilities) ? found.facilities.join(", ") : "",
      });
    } catch (err) {
      setVenue(null);
      setError(err?.message || "Failed to load venue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVenue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function saveVenue() {
    if (!venueId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const facilities = String(form.facilitiesText || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      const json = await apiFetch("/api/venue/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          description: form.description,
          shortDescription: form.shortDescription,
          guestMin: form.guestMin === "" ? null : Number(form.guestMin),
          guestMax: form.guestMax === "" ? null : Number(form.guestMax),
          facilities,
        }),
      });

      if (json?.venue) {
        setVenue((prev) => ({ ...(prev || {}), ...json.venue, status: json.venue.requires_review ? "pending_review" : prev?.status }));
      }
      setSuccess("Changes submitted for review.");
      await loadVenue();
    } catch (err) {
      setError(err?.message || "Failed to save venue");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file, type) {
    if (!file || !venueId) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }
    setUploading(type);
    setError("");
    setSuccess("");
    try {
      const prep = await apiFetch(
        `/api/venue/upload-image?venueId=${encodeURIComponent(venueId)}&fileName=${encodeURIComponent(file.name)}&type=${encodeURIComponent(type)}`
      );

      const uploadUrl = prep?.uploadUrl || prep?.signedUrl;
      if (!uploadUrl) throw new Error("Upload URL unavailable.");

      const putResp = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putResp.ok) {
        const details = await putResp.text().catch(() => "");
        throw new Error(`Image upload failed (${putResp.status}). ${details}`.trim());
      }

      setSuccess("Image uploaded and queued for review.");
      await loadVenue();
    } catch (err) {
      setError(err?.message || "Failed to upload image");
    } finally {
      setUploading("");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!venue) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-rose-600">{error || "Venue not found."}</p>
          <Button as={Link} to="/venue" variant="secondary">Back to my venues</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${venue.name || "venue"}`}
        subtitle="Owner changes are submitted for admin review before publication updates."
        actions={[
          { key: "back", label: "Back", variant: "secondary", onClick: () => navigate("/venue") },
          { key: "save", label: saving ? "Submitting..." : "Submit for review", onClick: saveVenue, disabled: saving || !!uploading },
        ]}
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Venue status
            <Badge variant={status.variant}>{status.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            {venue.requires_review
              ? "Your latest changes are pending admin review."
              : "Make changes and submit when ready. Publication visibility is controlled by admins."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Venue details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              type="number"
              value={form.guestMin}
              onChange={(e) => setForm((prev) => ({ ...prev, guestMin: e.target.value }))}
              placeholder="Guest minimum"
            />
            <Input
              type="number"
              value={form.guestMax}
              onChange={(e) => setForm((prev) => ({ ...prev, guestMax: e.target.value }))}
              placeholder="Guest maximum"
            />
          </div>
          <Input
            value={form.facilitiesText}
            onChange={(e) => setForm((prev) => ({ ...prev, facilitiesText: e.target.value }))}
            placeholder="Facilities (comma-separated)"
          />
          <textarea
            value={form.shortDescription}
            onChange={(e) => setForm((prev) => ({ ...prev, shortDescription: e.target.value }))}
            className="min-h-[90px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            placeholder="Short description"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            placeholder="Description"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Upload hero image
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
            {uploading ? <Badge variant="neutral">Uploading...</Badge> : null}
          </div>

          {venue.hero_image?.signed_url || venue.hero_image?.public_url ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <img
                src={venue.hero_image?.signed_url || venue.hero_image?.public_url}
                alt="Venue hero"
                className="h-48 w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No hero image uploaded yet.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(venue.gallery || []).map((img) => (
              <div key={img.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <img
                  src={img.signed_url || img.public_url}
                  alt={img.caption || venue.name || "Gallery image"}
                  className="h-24 w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

