import { createClient } from "@supabase/supabase-js";
import { computeSupplierGateFromData } from "./_lib/supplierGate.js";
import { toLinkedSupplierDto, toVenueProfileDto } from "./_lib/venues.js";

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

    const slug = String(req.query?.slug || "").trim().toLowerCase();
    if (!slug) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing slug" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const venueResp = await admin
      .from("venues")
      .select("id,name,slug,location_label,city,guest_min,guest_max,short_description,description,about,website_url,facilities,is_published")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (venueResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load venue", details: venueResp.error.message });
    }
    if (!venueResp.data) return res.status(404).json({ ok: false, error: "Venue not found" });

    const venue = venueResp.data;

    const imagesResp = await admin
      .from("venue_images")
      .select("id,venue_id,type,path,caption,sort_order,created_at")
      .eq("venue_id", venue.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load venue images", details: imagesResp.error.message });
    }

    const linksResp = await admin
      .from("venue_suppliers_link")
      .select("supplier_id")
      .eq("venue_id", venue.id);

    if (linksResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load linked suppliers", details: linksResp.error.message });
    }

    const supplierIds = Array.from(new Set((linksResp.data || []).map((r) => r.supplier_id).filter(Boolean)));

    const suppliersResp =
      supplierIds.length > 0
        ? await admin
            .from("suppliers")
            .select("id,slug,business_name,short_description,description,about,services,location_label,listing_categories,base_city,is_published")
            .in("id", supplierIds)
            .eq("is_published", true)
        : { data: [], error: null };
    if (suppliersResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    }

    const publicSuppliers = suppliersResp.data || [];
    const publicIds = publicSuppliers.map((s) => s.id);

    const [supplierImagesResp, perfResp] = await Promise.all([
      publicIds.length > 0
        ? admin
            .from("supplier_images")
            .select("supplier_id,type,path,sort_order")
            .in("supplier_id", publicIds)
        : { data: [], error: null },
      publicIds.length > 0
        ? admin
            .from("supplier_performance_30d")
            .select("supplier_id,invites_count,quotes_sent_count,quotes_accepted_count,acceptance_rate,response_time_seconds_median,last_quote_sent_at,last_active_at")
            .in("supplier_id", publicIds)
        : { data: [], error: null },
    ]);
    const reviewStatsResp =
      publicIds.length > 0
        ? await admin
            .from("supplier_review_stats")
            .select("supplier_id,average_rating,review_count")
            .in("supplier_id", publicIds)
        : { data: [], error: null };

    if (supplierImagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: supplierImagesResp.error.message });
    }
    if (perfResp.error) {
      const code = String(perfResp.error.code || "");
      const message = String(perfResp.error.message || "");
      const missingView = code === "42P01" || message.toLowerCase().includes("supplier_performance_30d");
      if (!missingView) {
        return res.status(500).json({ ok: false, error: "Failed to load supplier performance", details: perfResp.error.message });
      }
    }
    if (reviewStatsResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier review stats", details: reviewStatsResp.error.message });
    }

    const imagesBySupplier = new Map();
    for (const img of supplierImagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }

    const heroBySupplier = new Map();
    for (const [sid, imgs] of imagesBySupplier.entries()) {
      const hero = (imgs || [])
        .filter((x) => x.type === "hero")
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))[0];
      heroBySupplier.set(sid, hero?.path || null);
    }

    const perfBySupplier = new Map((perfResp.data || []).map((row) => [row.supplier_id, row]));
    const reviewsBySupplier = new Map((reviewStatsResp.data || []).map((row) => [row.supplier_id, row]));

    const linkedSuppliers = publicSuppliers
      .filter((supplier) => {
        const gate = computeSupplierGateFromData({
          supplier,
          images: imagesBySupplier.get(supplier.id) || [],
        });
        return gate.canPublish;
      })
      .map((supplier) =>
        toLinkedSupplierDto(
          supplier,
          heroBySupplier.get(supplier.id),
          perfBySupplier.get(supplier.id),
          SUPABASE_URL,
          reviewsBySupplier.get(supplier.id)
        )
      );

    return res.status(200).json({
      ok: true,
      venue: toVenueProfileDto(venue, imagesResp.data || [], SUPABASE_URL),
      linkedSuppliers,
    });
  } catch (err) {
    console.error("public-venue crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
