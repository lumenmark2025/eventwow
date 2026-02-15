import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import { UUID_RE, parseBody } from "../../../message-utils.js";
import { computeSupplierGateFromData } from "../../../_lib/supplierGate.js";
import {
  buildEditableListingDto,
  loadSupplierCategoryOptions,
  validateListingPayload,
} from "../../../_lib/supplierListing.js";

async function loadSupplier(admin, supplierId) {
  return admin
    .from("suppliers")
    .select("id,slug,business_name,short_description,about,services,location_label,listing_categories,listed_publicly,created_at,updated_at,last_active_at")
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
    if (method !== "GET" && method !== "PATCH") {
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
    const categoryOptions = await loadSupplierCategoryOptions(admin);

    if (method === "PATCH") {
      const body = parseBody(req);
      const validated = validateListingPayload(body, { allowedCategories: categoryOptions });
      if (!validated.ok) {
        return res.status(400).json({ ok: false, error: "Bad request", details: validated.error });
      }

      const next = validated.value;
      const requestedPublish = !!next.listedPublicly;

      const supplierLookup = await loadSupplier(admin, supplierId);
      if (supplierLookup.error) {
        return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supplierLookup.error.message });
      }
      if (!supplierLookup.data) return res.status(404).json({ ok: false, error: "Supplier not found" });

      const { data: updatedSupplier, error: updateErr } = await admin
        .from("suppliers")
        .update({
          short_description: next.shortDescription,
          about: next.about,
          services: next.services,
          location_label: next.locationLabel,
          listing_categories: next.categories,
          listed_publicly: false,
          updated_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        })
        .eq("id", supplierId)
        .select("id,slug,business_name,short_description,about,services,location_label,listing_categories,listed_publicly,created_at,updated_at,last_active_at")
        .single();

      if (updateErr) {
        return res.status(500).json({ ok: false, error: "Failed to save listing", details: updateErr.message });
      }

      const imagesResp = await loadImages(admin, supplierId);
      if (imagesResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: imagesResp.error.message });
      }

      const images = imagesResp.data || [];
      const gate = computeSupplierGateFromData({ supplier: updatedSupplier, images });

      let finalSupplier = updatedSupplier;
      if (requestedPublish && gate.canPublish) {
        const publishResp = await admin
          .from("suppliers")
          .update({
            listed_publicly: true,
            updated_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          })
          .eq("id", supplierId)
          .select("id,slug,business_name,short_description,about,services,location_label,listing_categories,listed_publicly,created_at,updated_at,last_active_at")
          .single();

        if (publishResp.error) {
          return res.status(500).json({ ok: false, error: "Failed to publish listing", details: publishResp.error.message });
        }
        finalSupplier = publishResp.data;
      }

      const dto = buildEditableListingDto(finalSupplier, images, categoryOptions, SUPABASE_URL);

      if (requestedPublish && !gate.canPublish) {
        return res.status(409).json({
          ok: false,
          error: "Cannot publish listing",
          details: "Micro content gate failed.",
          gate,
          ...dto,
          supplier: {
            ...dto.supplier,
            canPublish: false,
          },
        });
      }

      return res.status(200).json({
        ok: true,
        ...dto,
        supplier: { ...dto.supplier, canPublish: gate.canPublish },
        gate,
      });
    }

    const supplierResp = await loadSupplier(admin, supplierId);
    if (supplierResp.error) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supplierResp.error.message });
    }
    if (!supplierResp.data) return res.status(404).json({ ok: false, error: "Supplier not found" });

    const imagesResp = await loadImages(admin, supplierId);
    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: imagesResp.error.message });
    }

    const images = imagesResp.data || [];
    const gate = computeSupplierGateFromData({ supplier: supplierResp.data, images });
    const dto = buildEditableListingDto(supplierResp.data, images, categoryOptions, SUPABASE_URL);

    return res.status(200).json({
      ok: true,
      ...dto,
      supplier: { ...dto.supplier, canPublish: gate.canPublish },
      gate,
    });
  } catch (err) {
    console.error("admin supplier listing crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
