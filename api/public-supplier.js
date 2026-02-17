import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "./_lib/supplierListing.js";
import { computeSupplierGateFromData } from "./_lib/supplierGate.js";
import { buildPerformanceSignals } from "./_lib/performanceSignals.js";

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
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,is_published,is_insured,fsa_rating_url,fsa_rating_value,fsa_rating_date,created_at,updated_at"
      )
      .eq("slug", slug)
      .eq("is_published", true)
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

    const gate = computeSupplierGateFromData({ supplier, images: imagesResp.data || [] });
    if (!gate.canPublish) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const perfResp = await admin
      .from("supplier_performance_30d")
      .select(
        "supplier_id,invites_count,quotes_sent_count,quotes_accepted_count,acceptance_rate,response_time_seconds_median,last_quote_sent_at,last_active_at"
      )
      .eq("supplier_id", supplier.id)
      .maybeSingle();

    if (perfResp.error) {
      const code = String(perfResp.error.code || "");
      const message = String(perfResp.error.message || "");
      const missingView = code === "42P01" || message.toLowerCase().includes("supplier_performance_30d");
      if (!missingView) {
        return res.status(500).json({
          ok: false,
          error: "Failed to load supplier performance",
          details: perfResp.error.message,
        });
      }
    }

    const [reviewStatsResp, reviewsResp] = await Promise.all([
      admin.from("supplier_review_stats").select("average_rating,review_count").eq("supplier_id", supplier.id).maybeSingle(),
      admin
        .from("supplier_reviews")
        .select("rating,review_text,reviewer_name,created_at")
        .eq("supplier_id", supplier.id)
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (reviewStatsResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier review stats",
        details: reviewStatsResp.error.message,
      });
    }
    if (reviewsResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier reviews",
        details: reviewsResp.error.message,
      });
    }

    const profile = buildPublicSupplierDto(supplier, imagesResp.data || [], SUPABASE_URL);

    return res.status(200).json({
      ok: true,
      supplier: {
        ...profile,
        is_insured: !!supplier.is_insured,
        fsa_rating_value: supplier.fsa_rating_value || null,
        fsa_rating_url: supplier.fsa_rating_url || null,
        fsa_rating_date: supplier.fsa_rating_date || null,
        fsa_rating_badge_key: profile.fsaRatingBadgeKey || null,
        fsa_rating_badge_url: profile.fsaRatingBadgeUrl || null,
        performance: buildPerformanceSignals((perfResp && perfResp.data) || null),
        reviewRating: Number.isFinite(Number(reviewStatsResp.data?.average_rating))
          ? Number(reviewStatsResp.data.average_rating)
          : null,
        reviewCount: Number.isFinite(Number(reviewStatsResp.data?.review_count))
          ? Number(reviewStatsResp.data.review_count)
          : 0,
        reviews: (reviewsResp.data || []).map((row) => ({
          rating: Number(row.rating || 0),
          reviewText: row.review_text || "",
          reviewerName: row.reviewer_name || "Anonymous",
          createdAt: row.created_at || null,
        })),
      },
    });
  } catch (err) {
    console.error("public-supplier crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
