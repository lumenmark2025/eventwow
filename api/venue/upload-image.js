import crypto from "node:crypto";
import { ensureBucketExists, VENUE_IMAGES_BUCKET } from "../_lib/storageBuckets.js";
import { assertVenueOwnership, requireVenueOwner } from "../_lib/venueOwnerAuth.js";

function sanitizeFilename(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "image";
}

function extFromFileName(value) {
  const name = String(value || "").toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (name.endsWith(".webp")) return "webp";
  return "jpg";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireVenueOwner(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const venueId = String(req.query?.venueId || "").trim();
    const fileNameInput = String(req.query?.fileName || "").trim();
    const type = String(req.query?.type || "gallery").trim().toLowerCase();

    if (!venueId || !fileNameInput) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "venueId and fileName are required" });
    }
    if (!["hero", "gallery"].includes(type)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "type must be hero or gallery" });
    }

    const ownership = await assertVenueOwnership(auth.admin, auth.userId, venueId);
    if (!ownership.ok) return res.status(ownership.code).json({ ok: false, error: ownership.error, details: ownership.details });

    const ensureResp = await ensureBucketExists(auth.admin, VENUE_IMAGES_BUCKET, { public: false });
    if (!ensureResp.ok) {
      return res.status(500).json({ ok: false, error: "Failed to ensure bucket", details: ensureResp.error });
    }
    const bucketsResp = await auth.admin.storage.listBuckets();
    if (bucketsResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to inspect storage bucket", details: bucketsResp.error.message });
    }
    const venueBucket = (bucketsResp.data || []).find((b) => b?.name === VENUE_IMAGES_BUCKET);
    if (venueBucket && venueBucket.public === true) {
      const updateBucketResp = await auth.admin.storage.updateBucket(VENUE_IMAGES_BUCKET, {
        public: false,
        allowedMimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
        fileSizeLimit: "5MB",
      });
      if (updateBucketResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to enforce private venue bucket", details: updateBucketResp.error.message });
      }
    }

    const base = sanitizeFilename(fileNameInput).replace(/\.[^.]+$/, "");
    const ext = extFromFileName(fileNameInput);
    const objectPath = `venues/${venueId}/${Date.now()}-${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const signedUploadResp = await auth.admin.storage.from(VENUE_IMAGES_BUCKET).createSignedUploadUrl(objectPath);
    if (signedUploadResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to create signed upload URL", details: signedUploadResp.error.message });
    }

    if (type === "hero") {
      await auth.admin.from("venue_images").delete().eq("venue_id", venueId).eq("type", "hero");
    }

    const currentGalleryResp = await auth.admin
      .from("venue_images")
      .select("id,sort_order")
      .eq("venue_id", venueId)
      .eq("type", "gallery")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (currentGalleryResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to inspect gallery ordering", details: currentGalleryResp.error.message });
    }
    const nextSort = type === "gallery" ? Number(currentGalleryResp.data?.[0]?.sort_order || 0) + 1 : 0;

    const insertResp = await auth.admin
      .from("venue_images")
      .insert({
        venue_id: venueId,
        type,
        path: objectPath,
        sort_order: nextSort,
      })
      .select("id,venue_id,type,path,sort_order,created_at")
      .maybeSingle();
    if (insertResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to register image metadata", details: insertResp.error.message });
    }

    return res.status(200).json({
      ok: true,
      venueId,
      type,
      objectPath,
      token: signedUploadResp.data?.token || null,
      signedUrl: signedUploadResp.data?.signedUrl || null,
      uploadUrl: signedUploadResp.data?.signedUrl
        ? `${auth.supabaseUrl.replace(/\/+$/, "")}/storage/v1${signedUploadResp.data.signedUrl}`
        : null,
      image: insertResp.data || null,
    });
  } catch (err) {
    console.error("venue/upload-image crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
