import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import { UUID_RE, parseBody } from "../../../message-utils.js";
import { computeSupplierGateFromData } from "../../../_lib/supplierGate.js";
import { buildEditableListingDto, loadSupplierCategoryOptions } from "../../../_lib/supplierListing.js";

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

async function loadSupplier(admin, supplierId) {
  return admin
    .from("suppliers")
    .select("id,slug,business_name,short_description,about,services,location_label,listing_categories,is_published,created_at,updated_at")
    .eq("id", supplierId)
    .maybeSingle();
}

async function loadImages(admin, supplierId) {
  return admin
    .from("supplier_images")
    .select("id,supplier_id,type,path,caption,sort_order,created_at")
    .eq("supplier_id", supplierId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}

export default async function handler(req, res) {
  try {
    const method = String(req.method || "").toUpperCase();
    if (method !== "POST" && method !== "DELETE") {
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

    const supplierId = String(req.query?.supplierId || "").trim();
    if (!supplierId || !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid supplierId" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const supplierLookup = await loadSupplier(admin, supplierId);
    if (supplierLookup.error) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supplierLookup.error.message });
    }
    if (!supplierLookup.data) return res.status(404).json({ ok: false, error: "Supplier not found" });

    if (method === "DELETE") {
      const body = parseBody(req);
      const imageId = String(body?.imageId || "").trim();
      if (!UUID_RE.test(imageId)) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid imageId" });
      }

      const imageLookup = await admin
        .from("supplier_images")
        .select("id,supplier_id,path")
        .eq("id", imageId)
        .eq("supplier_id", supplierId)
        .maybeSingle();

      if (imageLookup.error) {
        return res.status(500).json({ ok: false, error: "Failed to load image", details: imageLookup.error.message });
      }
      if (!imageLookup.data) return res.status(404).json({ ok: false, error: "Image not found" });

      await admin.storage.from("supplier-gallery").remove([imageLookup.data.path]);
      const deleteResp = await admin.from("supplier_images").delete().eq("id", imageLookup.data.id).eq("supplier_id", supplierId);
      if (deleteResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to delete image", details: deleteResp.error.message });
      }

      const freshImagesResp = await loadImages(admin, supplierId);
      if (freshImagesResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: freshImagesResp.error.message });
      }

      const images = freshImagesResp.data || [];
      const gate = computeSupplierGateFromData({ supplier: supplierLookup.data, images });
      const categoryOptions = await loadSupplierCategoryOptions(admin);
      const dto = buildEditableListingDto(supplierLookup.data, images, categoryOptions, SUPABASE_URL);

      return res.status(200).json({ ok: true, ...dto, supplier: { ...dto.supplier, canPublish: gate.canPublish }, gate });
    }

    const body = parseBody(req);
    const type = String(body?.type || body?.kind || "").trim().toLowerCase();
    const mimeType = String(body?.mimeType || "").trim().toLowerCase();
    const caption = String(body?.caption || "").trim() || null;
    const buffer = decodeBase64Payload(body?.dataBase64);

    if (!["hero", "gallery"].includes(type)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "type must be hero or gallery" });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Unsupported image type" });
    }
    if (!buffer || !buffer.length) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing image payload" });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Image must be 5MB or smaller" });
    }

    const currentImagesResp = await loadImages(admin, supplierId);
    if (currentImagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: currentImagesResp.error.message });
    }
    const currentImages = currentImagesResp.data || [];

    if (type === "gallery") {
      const galleryCount = currentImages.filter((img) => img.type === "gallery").length;
      if (galleryCount >= 12) {
        return res.status(409).json({ ok: false, error: "Cannot upload image", details: "Gallery supports up to 12 images" });
      }
    }

    const ext = EXT_BY_MIME[mimeType] || "jpg";
    const objectPath = `${supplierId}/${crypto.randomUUID()}.${ext}`;
    const uploadResp = await admin.storage.from("supplier-gallery").upload(objectPath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

    if (uploadResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to upload image", details: uploadResp.error.message });
    }

    if (type === "hero") {
      const previousHero = currentImages.find((img) => img.type === "hero");
      if (previousHero) {
        await admin.storage.from("supplier-gallery").remove([previousHero.path]);
        await admin.from("supplier_images").delete().eq("id", previousHero.id).eq("supplier_id", supplierId);
      }
    }

    const nextSortOrder =
      type === "gallery"
        ? currentImages.filter((img) => img.type === "gallery").reduce((max, img) => Math.max(max, Number(img.sort_order || 0)), 0) + 1
        : 0;

    const insertResp = await admin
      .from("supplier_images")
      .insert([{ supplier_id: supplierId, type, path: objectPath, caption, sort_order: nextSortOrder }])
      .select("id,supplier_id,type,path,caption,sort_order,created_at")
      .single();

    if (insertResp.error) {
      await admin.storage.from("supplier-gallery").remove([objectPath]);
      return res.status(500).json({ ok: false, error: "Failed to save image metadata", details: insertResp.error.message });
    }

    const freshImagesResp = await loadImages(admin, supplierId);
    if (freshImagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: freshImagesResp.error.message });
    }

    const images = freshImagesResp.data || [];
    const gate = computeSupplierGateFromData({ supplier: supplierLookup.data, images });
    const categoryOptions = await loadSupplierCategoryOptions(admin);
    const dto = buildEditableListingDto(supplierLookup.data, images, categoryOptions, SUPABASE_URL);

    return res.status(200).json({ ok: true, ...dto, supplier: { ...dto.supplier, canPublish: gate.canPublish }, gate });
  } catch (err) {
    console.error("admin supplier images crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
