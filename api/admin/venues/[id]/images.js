import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import { getPublicImageUrl } from "../../../_lib/publicImage.js";
import {
  VENUE_IMAGES_BUCKET,
  ensureBucketExists,
} from "../../../_lib/storageBuckets.js";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function normalizeMimeType(value) {
  const raw = String(value || "").trim().toLowerCase();
  const base = raw.split(";")[0].trim();
  if (base === "image/jpg") return "image/jpeg";
  if (base === "image/x-png") return "image/png";
  return base;
}

function inferMimeTypeFromFileName(value) {
  const fileName = String(value || "").trim().toLowerCase();
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".webp")) return "image/webp";
  return "";
}

function inferMimeTypeFromBuffer(buffer) {
  if (!buffer || !buffer.length) return "";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  return body || {};
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseMultipart(rawBuffer, boundary) {
  const boundaryToken = `--${boundary}`;
  const raw = rawBuffer.toString("latin1");
  const parts = raw.split(boundaryToken).slice(1, -1);
  const fields = {};
  let file = null;

  for (const part of parts) {
    const normalized = part.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const separatorIndex = normalized.indexOf("\r\n\r\n");
    if (separatorIndex < 0) continue;
    const headerText = normalized.slice(0, separatorIndex);
    let valueText = normalized.slice(separatorIndex + 4);
    if (valueText.endsWith("\r\n")) valueText = valueText.slice(0, -2);

    const dispositionLine = headerText
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-disposition"));
    if (!dispositionLine) continue;
    const nameMatch = dispositionLine.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const fileNameMatch = dispositionLine.match(/filename="([^"]*)"/i);

    if (fileNameMatch) {
      const contentTypeLine = headerText
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-type:"));
      const contentType = contentTypeLine ? contentTypeLine.split(":")[1].trim().toLowerCase() : "application/octet-stream";
      file = {
        fieldName,
        fileName: fileNameMatch[1],
        mimeType: contentType,
        buffer: Buffer.from(valueText, "latin1"),
      };
    } else {
      fields[fieldName] = valueText;
    }
  }

  return { fields, file };
}

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

function sanitizeFilename(value, fallback = "upload") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export default async function handler(req, res) {
  try {
    if (!["POST", "DELETE"].includes(req.method)) {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const venueId = String(req.query?.id || "").trim();
    if (!venueId) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing venue id" });
    }

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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const venueResp = await admin.from("venues").select("id").eq("id", venueId).maybeSingle();
    if (venueResp.error) return res.status(500).json({ ok: false, error: "Venue lookup failed", details: venueResp.error.message });
    if (!venueResp.data) return res.status(404).json({ ok: false, error: "Venue not found" });

    if (req.method === "DELETE") {
      const imageId = String(req.query?.imageId || "").trim();
      if (!imageId) return res.status(400).json({ ok: false, error: "Bad request", details: "imageId is required" });

      const imageResp = await admin
        .from("venue_images")
        .select("id,path")
        .eq("id", imageId)
        .eq("venue_id", venueId)
        .maybeSingle();
      if (imageResp.error) return res.status(500).json({ ok: false, error: "Failed to load image", details: imageResp.error.message });
      if (!imageResp.data) return res.status(404).json({ ok: false, error: "Image not found" });

      await admin.storage.from(VENUE_IMAGES_BUCKET).remove([imageResp.data.path]);
      const deleteResp = await admin.from("venue_images").delete().eq("id", imageResp.data.id).eq("venue_id", venueId);
      if (deleteResp.error) return res.status(500).json({ ok: false, error: "Failed to delete image", details: deleteResp.error.message });

      return res.status(200).json({ ok: true, imageId: imageResp.data.id });
    }

    const ensureResp = await ensureBucketExists(admin, VENUE_IMAGES_BUCKET, { public: true });
    if (!ensureResp.ok) {
      return res.status(500).json({ ok: false, error: "Failed to ensure venue images bucket", details: ensureResp.error });
    }

    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    let type = "gallery";
    let caption = null;
    let mimeType = "";
    let sourceName = "";
    let fileBuffer = null;

    if (contentType.includes("multipart/form-data")) {
      const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
      if (!boundaryMatch?.[1]) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "Missing multipart boundary" });
      }
      const rawBody = await readRawBody(req);
      const boundary = boundaryMatch[1].replace(/^"|"$/g, "");
      const parsed = parseMultipart(rawBody, boundary);
      type = String(parsed.fields?.type || "gallery").trim().toLowerCase();
      caption = String(parsed.fields?.caption || "").trim() || null;
      mimeType = normalizeMimeType(parsed.file?.mimeType || parsed.fields?.mimeType || "");
      sourceName = parsed.file?.fileName || parsed.fields?.fileName || "";
      fileBuffer = parsed.file?.buffer || null;
    } else {
      const body = parseJsonBody(req);
      type = String(body?.type || "gallery").trim().toLowerCase();
      caption = String(body?.caption || "").trim() || null;
      mimeType = normalizeMimeType(body?.mimeType);
      sourceName = String(body?.fileName || "");
      fileBuffer = decodeBase64Payload(body?.dataBase64);
    }

    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = inferMimeTypeFromBuffer(fileBuffer) || inferMimeTypeFromFileName(sourceName);
    }

    if (!["hero", "gallery"].includes(type)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "type must be hero or gallery" });
    }
    if (!fileBuffer || !fileBuffer.length) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing image payload" });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: `Unsupported image type (${mimeType || "unknown"})` });
    }
    if (fileBuffer.length > MAX_BYTES) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Image must be 5MB or smaller" });
    }

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
    const now = Date.now();
    const baseName = sanitizeFilename(sourceName.replace(/\.[^.]+$/, ""), "image");
    const objectPath = `venues/${venueId}/${now}-${baseName}.${ext}`;
    const uploadResp = await admin.storage
      .from(VENUE_IMAGES_BUCKET)
      .upload(objectPath, fileBuffer, { contentType: mimeType, upsert: true });
    if (uploadResp.error) return res.status(500).json({ ok: false, error: "Failed to upload image", details: uploadResp.error.message });

    if (type === "hero") {
      const previousHero = currentImages.find((img) => img.type === "hero");
      if (previousHero) {
        await admin.storage.from(VENUE_IMAGES_BUCKET).remove([previousHero.path]);
        await admin.from("venue_images").delete().eq("id", previousHero.id).eq("venue_id", venueId);
      }
    }

    const nextSortOrder =
      type === "gallery"
        ? currentImages
            .filter((img) => img.type === "gallery")
            .reduce((max, img) => Math.max(max, toInt(img.sort_order, 0)), 0) + 1
        : 0;

    const insertResp = await admin
      .from("venue_images")
      .insert([{ venue_id: venueId, type, path: objectPath, caption, sort_order: nextSortOrder }])
      .select("id,venue_id,type,path,caption,sort_order,created_at")
      .single();
    if (insertResp.error) {
      await admin.storage.from(VENUE_IMAGES_BUCKET).remove([objectPath]);
      return res.status(500).json({ ok: false, error: "Failed to save image metadata", details: insertResp.error.message });
    }

    const image = insertResp.data;
    return res.status(200).json({
      ok: true,
      image: {
        id: image.id,
        type: image.type,
        storage_path: image.path,
        public_url: getPublicImageUrl(SUPABASE_URL, VENUE_IMAGES_BUCKET, image.path),
        caption: image.caption || null,
        sort_order: Number(image.sort_order || 0),
      },
    });
  } catch (err) {
    console.error("admin venue images endpoint crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
