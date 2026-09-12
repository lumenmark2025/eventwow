import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import {
  Badge,
  Button,
  Input,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Feedback,
  FormField,
  FormActions,
  EmptyState,
} from "../../components/workspace/AdminPrimitives";
import WorkspaceImage from "../../components/workspace/WorkspaceImage";

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
  if (!resp.ok)
    throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

function toStatusLabel(venue) {
  if (venue?.requires_review)
    return { label: "Pending Review", variant: "warning" };
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
      const found =
        rows.find((row) => String(row.id) === String(venueId)) || null;
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
        facilitiesText: Array.isArray(found.facilities)
          ? found.facilities.join(", ")
          : "",
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
        setVenue((prev) => ({
          ...(prev || {}),
          ...json.venue,
          status: json.venue.requires_review ? "pending_review" : prev?.status,
        }));
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
        `/api/venue/upload-image?venueId=${encodeURIComponent(venueId)}&fileName=${encodeURIComponent(file.name)}&type=${encodeURIComponent(type)}`,
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
        throw new Error(
          `Image upload failed (${putResp.status}). ${details}`.trim(),
        );
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
      <div className="space-y-6">
        <PageHeader title="Edit venue" subtitle="Loading your venue details." />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit venue" subtitle="Manage your venue listing." />
        <Feedback onRetry={loadVenue}>{error || "Venue not found."}</Feedback>
        <Button as={Link} to="/venue" variant="secondary">
          Back to my venues
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${venue.name || "venue"}`}
        subtitle="Update your listing details and submit them for review."
        actions={[
          {
            key: "back",
            label: "Back to my venues",
            variant: "secondary",
            onClick: () => navigate("/venue"),
          },
          {
            key: "save",
            label: saving ? "Submitting..." : "Submit for review",
            onClick: saveVenue,
            disabled: saving || !!uploading,
          },
        ]}
      />
      {error && <Feedback>{error}</Feedback>}
      {success && <Feedback tone="success">{success}</Feedback>}

      <Card>
        <CardHeader>
          <CardTitle>Listing status</CardTitle>
        </CardHeader>
        <CardContent className="grid items-start gap-6 md:grid-cols-2">
          <WorkspaceImage
            src={venue.hero_image?.signed_url || venue.hero_image?.public_url}
            alt={`${venue.name || "Venue"} hero`}
          />
          <div className="space-y-3">
            <Badge variant={status.variant}>{status.label}</Badge>
            {venue.location_label && <p>{venue.location_label}</p>}
            <p className="ew-form-help">
              {venue.requires_review
                ? "Your latest changes are pending admin review."
                : "Make changes and submit when ready. Publication visibility is controlled by admins."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About your venue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            label="Short description"
            help="A brief introduction to your venue."
          >
            <Textarea
              rows={3}
              value={form.shortDescription}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  shortDescription: e.target.value,
                }))
              }
            />
          </FormField>
          <FormField
            label="Description"
            help="Describe the spaces and events your venue can accommodate."
          >
            <Textarea
              rows={6}
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </FormField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Capacity and facilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Guest minimum">
              <Input
                type="number"
                value={form.guestMin}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, guestMin: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Guest maximum">
              <Input
                type="number"
                value={form.guestMax}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, guestMax: e.target.value }))
                }
              />
            </FormField>
          </div>
          <FormField label="Facilities" help="Separate facilities with commas.">
            <Input
              value={form.facilitiesText}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, facilitiesText: e.target.value }))
              }
            />
          </FormField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Venue images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="ew-form-help">
            Upload JPEG, PNG or WebP images up to 5MB. Uploading reloads your
            venue details; submit any text changes first.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Upload hero image">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={saving || !!uploading}
                onChange={(e) => uploadImage(e.target.files?.[0], "hero")}
              />
            </FormField>
            <FormField label="Upload gallery image">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={saving || !!uploading}
                onChange={(e) => uploadImage(e.target.files?.[0], "gallery")}
              />
            </FormField>
          </div>
          {uploading && <p role="status">Uploading {uploading} image...</p>}
          {(venue.gallery || []).length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {venue.gallery.map((img) => (
                <WorkspaceImage
                  key={img.id}
                  src={img.signed_url || img.public_url}
                  alt={img.caption || venue.name || "Gallery image"}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No gallery images"
              description="Add images to show the spaces and atmosphere of your venue."
            />
          )}
        </CardContent>
      </Card>
      <FormActions>
        <Button
          variant="secondary"
          onClick={() => navigate("/venue")}
          disabled={saving || !!uploading}
        >
          Cancel
        </Button>
        <Button onClick={saveVenue} disabled={saving || !!uploading}>
          {saving ? "Submitting..." : "Submit for review"}
        </Button>
      </FormActions>
    </div>
  );
}
