import {
  buildEditableListingDto,
  SUPPLIER_CATEGORY_OPTIONS,
  validateListingPayload,
} from "./_lib/supplierListing.js";
import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
  parseBody,
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
    const validated = validateListingPayload(body);
    if (!validated.ok) {
      return res.status(400).json({ ok: false, error: "Bad request", details: validated.error });
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

    const next = validated.value;
    const canPublish = Boolean(
      String(supplierLookup.data.business_name || "").trim() &&
        String(next.shortDescription || "").trim() &&
        Array.isArray(next.categories) &&
        next.categories.length > 0
    );

    const { data: updatedSupplier, error: updateErr } = await admin
      .from("suppliers")
      .update({
        short_description: next.shortDescription,
        about: next.about,
        services: next.services,
        location_label: next.locationLabel,
        listing_categories: next.categories,
        listed_publicly: next.listedPublicly && canPublish,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplierLookup.data.id)
      .select(
        "id,slug,business_name,short_description,about,services,location_label,listing_categories,listed_publicly,created_at,updated_at"
      )
      .single();

    if (updateErr) {
      return res.status(500).json({
        ok: false,
        error: "Failed to save listing",
        details: updateErr.message,
      });
    }

    const imagesResp = await loadImages(admin, supplierLookup.data.id);
    if (imagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier images",
        details: imagesResp.error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      ...buildEditableListingDto(
        updatedSupplier,
        imagesResp.data || [],
        SUPPLIER_CATEGORY_OPTIONS,
        SUPABASE_URL
      ),
    });
  } catch (err) {
    console.error("supplier-public-profile-save crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
