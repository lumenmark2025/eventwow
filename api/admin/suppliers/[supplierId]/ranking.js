import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import {
  baseQualityScore,
  categoryMatchStrength,
  computeRank,
  locationMatchStrength,
  rankingExplanation,
  toSlug,
} from "../../../_lib/ranking.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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
    if (!supplierId) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing supplierId" });
    }

    const categorySlug = toSlug(req.query?.category_slug || "");
    const locationSlug = toSlug(req.query?.location_slug || "");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const [supplierResp, featureResp, marketResp] = await Promise.all([
      admin.from("suppliers").select("id,business_name,listing_categories,location_label,base_city,is_verified").eq("id", supplierId).maybeSingle(),
      admin.from("supplier_rank_features_30d").select("supplier_id,quotes_sent_30d,accepted_30d,response_time_median_minutes_30d,last_active_at,is_verified,plan_type,acceptance_rate_30d,smoothed_acceptance,response_score,activity_score,volume_score,base_quality").eq("supplier_id", supplierId).maybeSingle(),
      admin.from("marketplace_stats_30d").select("global_acceptance_rate_30d").maybeSingle(),
    ]);

    if (supplierResp.error) return res.status(500).json({ ok: false, error: "Failed to load supplier", details: supplierResp.error.message });
    if (!supplierResp.data) return res.status(404).json({ ok: false, error: "Supplier not found" });
    if (featureResp.error) return res.status(500).json({ ok: false, error: "Failed to load rank features", details: featureResp.error.message });
    if (marketResp.error) return res.status(500).json({ ok: false, error: "Failed to load marketplace stats", details: marketResp.error.message });

    const fr = featureResp.data || {};
    const features = Number.isFinite(Number(fr.base_quality))
      ? {
          smoothedAcceptance: Number(fr.smoothed_acceptance || 0),
          responseScore: Number(fr.response_score || 0),
          activityScore: Number(fr.activity_score || 0),
          volumeScore: Number(fr.volume_score || 0),
          baseQuality: Number(fr.base_quality || 0),
        }
      : baseQualityScore({
          accepted30d: fr.accepted_30d || 0,
          quotesSent30d: fr.quotes_sent_30d || 0,
          globalAcceptanceRate30d: Number(marketResp.data?.global_acceptance_rate_30d || 0),
          responseMinutes30d: fr.response_time_median_minutes_30d,
          lastActiveAt: fr.last_active_at,
        });

    const categoryMatch = categoryMatchStrength(categorySlug, supplierResp.data.listing_categories || []);
    const locationMatch = locationMatchStrength(locationSlug, {
      locationLabel: supplierResp.data.location_label,
      baseCity: supplierResp.data.base_city,
    });
    const rank = computeRank({
      features,
      categoryMatch,
      locationMatch,
      isVerified: !!(fr.is_verified ?? supplierResp.data.is_verified),
      planType: fr.plan_type || "free",
    });

    return res.status(200).json({
      ok: true,
      supplier: {
        id: supplierResp.data.id,
        name: supplierResp.data.business_name || "Supplier",
      },
      context: {
        category_slug: categorySlug || null,
        location_slug: locationSlug || null,
      },
      raw: {
        quotes_sent_30d: Number(fr.quotes_sent_30d || 0),
        accepted_30d: Number(fr.accepted_30d || 0),
        acceptance_rate_30d: Number(fr.acceptance_rate_30d || 0),
        response_time_median_minutes_30d: fr.response_time_median_minutes_30d == null ? null : Number(fr.response_time_median_minutes_30d),
        last_active_at: fr.last_active_at || null,
        is_verified: !!(fr.is_verified ?? supplierResp.data.is_verified),
        plan_type: fr.plan_type || "free",
      },
      components: {
        smoothed_acceptance: features.smoothedAcceptance,
        response_score: features.responseScore,
        activity_score: features.activityScore,
        volume_score: features.volumeScore,
        base_quality: features.baseQuality,
      },
      match: {
        category_match: categoryMatch,
        location_match: locationMatch,
        match: rank.match,
      },
      final: {
        verified_bonus: rank.verifiedBonus,
        plan_multiplier: rank.planMultiplier,
        rank_score: rank.rankScore,
      },
      explanations: rankingExplanation({
        rank,
        features,
        categoryMatch,
        locationMatch,
        quotesSent30d: fr.quotes_sent_30d || 0,
        accepted30d: fr.accepted_30d || 0,
      }),
    });
  } catch (err) {
    console.error("admin supplier ranking crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
