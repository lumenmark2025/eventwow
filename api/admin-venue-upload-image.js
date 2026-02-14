import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { parseBody } from "./_lib/venues.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024;

function decodeBase64Payload(dataBase64) {
  const raw = String(dataBase64 || "").trim();
  if (!raw) return null;
  const commaIdx = raw.indexOf(",");
  const payload = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw;
  try {
    return Buffer.from(payload, "base64");
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const body = parseBody(req);
    const venueId = String(body?.venueId || "").trim();
    const type = String(body?.type || "").trim().toLowerCase();
    const mimeType = String(body?.mimeType || "").trim().toLowerCase();
    const caption = String(body?.caption || "").trim() || null;
    const buffer = decodeBase64Payload(body?.dataBase64);

    if (!venueId) return res.status(400).json({ ok: false, error: "Bad request", details: "venueId is required" });
    if (!["hero", "gallery"].includes(type)) return res.status(400).json({ ok: false, error: "Bad request", details: "type must be hero or gallery" });
    if (!ALLOWED_TYPES.has(mimeType)) return res.status(400).json({ ok: false, error: "Bad request", details: "Unsupported image type" });
    if (!buffer || !buffer.length) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing image payload" });
    if (buffer.length > MAX_BYTES) return res.status(400).json({ ok: false, error: "Bad request", details: "Image must be 5MB or smaller" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const venueResp = await admin.from("venues").select("id").eq("id", venueId).maybeSingle();
    if (venueResp.error) return res.status(500).json({ ok: false, error: "Venue lookup failed", details: venueResp.error.message });
    if (!venueResp.data) return res.status(404).json({ ok: false, error: "Venue not found" });

    const currentResp = await admin
      .from("venue_images")
      .select("id,type,path,sort_order")
      .eq("venue_id", venueId)
      .order("sort_order", { ascending: true });
    if (currentResp.error) return res.status(500).json({ ok: false, error: "Failed to load venue images", details: currentResp.error.message });
    const currentImages = currentResp.data || [];

    if (type === "gallery") {
      const galleryCount = currentImages.filter((img) => img.type === "gallery").length;
      if (galleryCount >= 12) {
        return res.status(409).json({ ok: false, error: "Cannot upload image", details: "Gallery supports up to 12 images" });
      }
    }

    const ext = EXT_BY_MIME[mimeType] || "jpg";
    const objectPath = `${venueId}/${crypto.randomUUID()}.${ext}`;
    const uploadResp = await admin.storage
      .from("venue-gallery")
      .upload(objectPath, buffer, { contentType: mimeType, upsert: false });
    if (uploadResp.error) return res.status(500).json({ ok: false, error: "Failed to upload image", details: uploadResp.error.message });

    if (type === "hero") {
      const previousHero = currentImages.find((img) => img.type === "hero");
      if (previousHero) {
        await admin.storage.from("venue-gallery").remove([previousHero.path]);
        await admin.from("venue_images").delete().eq("id", previousHero.id).eq("venue_id", venueId);
      }
    }

    const nextSortOrder =
      type === "gallery"
        ? currentImages
            .filter((img) => img.type === "gallery")
            .reduce((max, img) => Math.max(max, Number(img.sort_order || 0)), 0) + 1
        : 0;

    const insertResp = await admin
      .from("venue_images")
      .insert([{ venue_id: venueId, type, path: objectPath, caption, sort_order: nextSortOrder }])
      .select("id")
      .single();
    if (insertResp.error) {
      await admin.storage.from("venue-gallery").remove([objectPath]);
      return res.status(500).json({ ok: false, error: "Failed to save image metadata", details: insertResp.error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("admin-venue-upload-image crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

