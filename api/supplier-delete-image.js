import {
  buildEditableListingDto,
  SUPPLIER_CATEGORY_OPTIONS,
} from "./_lib/supplierListing.js";
import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
  parseBody,
  UUID_RE,
} from "./message-utils.js";

async function loadSupplierByAuthUser(admin, userId) {
  return admin
    .from("suppliers")
    .select(
      "id,slug,business_name,short_description,about,services,location_label,listing_categories,listed_publicly,created_at,updated_at"
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
    const imageId = String(body?.imageId || "").trim();
    if (!UUID_RE.test(imageId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid imageId" });
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

    const imageLookup = await admin
      .from("supplier_images")
      .select("id,supplier_id,path")
      .eq("id", imageId)
      .eq("supplier_id", supplierLookup.data.id)
      .maybeSingle();

    if (imageLookup.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load image",
        details: imageLookup.error.message,
      });
    }
    if (!imageLookup.data) {
      return res.status(404).json({ ok: false, error: "Image not found" });
    }

    await admin.storage.from("supplier-gallery").remove([imageLookup.data.path]);
    const deleteResp = await admin
      .from("supplier_images")
      .delete()
      .eq("id", imageLookup.data.id)
      .eq("supplier_id", supplierLookup.data.id);

    if (deleteResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to delete image",
        details: deleteResp.error.message,
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

    return res.status(200).json({
      ok: true,
      ...buildEditableListingDto(
        supplierLookup.data,
        freshImagesResp.data || [],
        SUPPLIER_CATEGORY_OPTIONS,
        SUPABASE_URL
      ),
    });
  } catch (err) {
    console.error("supplier-delete-image crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
