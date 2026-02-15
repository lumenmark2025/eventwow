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

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const imagesResp = await admin
      .from("supplier_images")
      .select("id,supplier_id,type,path,caption,sort_order,created_at")
      .eq("supplier_id", supplierLookup.data.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (imagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier images",
        details: imagesResp.error.message,
      });
    }

    const images = imagesResp.data || [];
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
      supplier: {
        ...dto.supplier,
        canPublish: gate.canPublish,
      },
      gate,
    });
  } catch (err) {
    console.error("supplier-public-profile crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
