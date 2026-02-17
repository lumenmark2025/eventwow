import {
  buildEditableListingDto,
  loadSupplierCategoryOptions,
} from "./_lib/supplierListing.js";
import { computeSupplierGateFromData } from "./_lib/supplierGate.js";
import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
  parseBody,
} from "./message-utils.js";

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

async function loadSupplierByAuthUser(admin, userId) {
  return admin
    .from("suppliers")
    .select(
      "id,slug,business_name,short_description,about,services,location_label,listing_categories,is_published,created_at,updated_at"
    )
    .eq("auth_user_id", userId)
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
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const { SUPABASE_URL, SERVICE_KEY, ANON_KEY } = getEnv();
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const auth = await getAuthUserId(SUPABASE_URL, ANON_KEY, token);
    if (auth.error || !auth.userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: auth.error });
    }

    const body = parseBody(req);
    const type = String(body?.type || "").trim().toLowerCase();
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

    const admin = createAdminClient(SUPABASE_URL, SERVICE_KEY);
    const supplierLookup = await loadSupplierByAuthUser(admin, auth.userId);
    if (supplierLookup.error) {
      return res.status(500).json({
        ok: false,
        error: "Supplier lookup failed",
        details: supplierLookup.error.message,
      });
    }
    if (!supplierLookup.data) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const currentImagesResp = await loadImages(admin, supplierLookup.data.id);
    if (currentImagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier images",
        details: currentImagesResp.error.message,
      });
    }
    const currentImages = currentImagesResp.data || [];

    if (type === "gallery") {
      const galleryCount = currentImages.filter((img) => img.type === "gallery").length;
      if (galleryCount >= 12) {
        return res.status(409).json({
          ok: false,
          error: "Cannot upload image",
          details: "Gallery supports up to 12 images",
        });
      }
    }

    const ext = EXT_BY_MIME[mimeType] || "jpg";
    const objectPath = `${supplierLookup.data.id}/${crypto.randomUUID()}.${ext}`;
    const uploadResp = await admin.storage
      .from("supplier-gallery")
      .upload(objectPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to upload image",
        details: uploadResp.error.message,
      });
    }

    if (type === "hero") {
      const previousHero = currentImages.find((img) => img.type === "hero");
      if (previousHero) {
        await admin.storage.from("supplier-gallery").remove([previousHero.path]);
        await admin.from("supplier_images").delete().eq("id", previousHero.id).eq("supplier_id", supplierLookup.data.id);
      }
    }

    const nextSortOrder =
      type === "gallery"
        ? currentImages
            .filter((img) => img.type === "gallery")
            .reduce((max, img) => Math.max(max, Number(img.sort_order || 0)), 0) + 1
        : 0;

    const insertResp = await admin
      .from("supplier_images")
      .insert([
        {
          supplier_id: supplierLookup.data.id,
          type,
          path: objectPath,
          caption,
          sort_order: nextSortOrder,
        },
      ])
      .select("id,supplier_id,type,path,caption,sort_order,created_at")
      .single();

    if (insertResp.error) {
      await admin.storage.from("supplier-gallery").remove([objectPath]);
      return res.status(500).json({
        ok: false,
        error: "Failed to save image metadata",
        details: insertResp.error.message,
      });
    }

    const freshImagesResp = await loadImages(admin, supplierLookup.data.id);
    if (freshImagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier images",
        details: freshImagesResp.error.message,
      });
    }

    const images = freshImagesResp.data || [];
    const gate = computeSupplierGateFromData({ supplier: supplierLookup.data, images });
    const categoryOptions = await loadSupplierCategoryOptions(admin);
    const dto = buildEditableListingDto(
      supplierLookup.data,
      images,
      categoryOptions,
      SUPABASE_URL
    );

    return res.status(200).json({
      ok: true,
      ...dto,
      supplier: { ...dto.supplier, canPublish: gate.canPublish },
      gate,
    });
  } catch (err) {
    console.error("supplier-upload-image crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
