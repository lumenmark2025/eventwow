import { createClient } from "@supabase/supabase-js";
import { computeSupplierGateFromData } from "./_lib/supplierGate.js";

function toCategoryObject(name) {
  const value = String(name || "").trim();
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    id: slug || value,
    name: value,
    slug: slug || value.toLowerCase(),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
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

    const supplierSlug = String(req.query?.supplierSlug || "")
      .trim()
      .toLowerCase();
    if (!supplierSlug) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing supplierSlug" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const supplierResp = await admin
      .from("suppliers")
      .select("id,slug,business_name,short_description,about,services,listing_categories,location_label,is_published")
      .eq("slug", supplierSlug)
      .eq("is_published", true)
      .maybeSingle();

    if (supplierResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier",
        details: supplierResp.error.message,
      });
    }
    if (!supplierResp.data) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const imagesResp = await admin
      .from("supplier_images")
      .select("id,type")
      .eq("supplier_id", supplierResp.data.id);

    if (imagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier media",
        details: imagesResp.error.message,
      });
    }

    const gate = computeSupplierGateFromData({
      supplier: supplierResp.data,
      images: imagesResp.data || [],
    });

    if (!gate.canPublish) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const categories = (Array.isArray(supplierResp.data.listing_categories)
      ? supplierResp.data.listing_categories
      : []
    )
      .map(toCategoryObject)
      .filter((x) => x.name);

    return res.status(200).json({
      ok: true,
      supplierId: supplierResp.data.id,
      supplierSlug: supplierResp.data.slug,
      supplierName: supplierResp.data.business_name || "Supplier",
      activeCategories: categories,
      activeCategoryCount: categories.length,
    });
  } catch (err) {
    console.error("public-supplier-request-context crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
