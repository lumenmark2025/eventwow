import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "./_lib/supplierListing.js";

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

    const slug = String(req.query?.slug || "")
      .trim()
      .toLowerCase();
    if (!slug) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing slug" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: supplier, error } = await admin
      .from("suppliers")
      .select(
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,listed_publicly,created_at,updated_at"
      )
      .eq("slug", slug)
      .eq("listed_publicly", true)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier profile", details: error.message });
    }
    if (!supplier) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const imagesResp = await admin
      .from("supplier_images")
      .select("id,supplier_id,type,path,caption,sort_order,created_at")
      .eq("supplier_id", supplier.id);

    if (imagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier profile images",
        details: imagesResp.error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      supplier: buildPublicSupplierDto(supplier, imagesResp.data || [], SUPABASE_URL),
    });
  } catch (err) {
    console.error("public-supplier crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
