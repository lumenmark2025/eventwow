import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "../../_lib/supplierListing.js";
import { buildPerformanceSignals } from "../../_lib/performanceSignals.js";
import {
  baseQualityScore,
  categoryMatchStrength,
  computeRank,
  locationMatchStrength,
  rankingExplanation,
  toSlug,
  toTitle,
} from "../../_lib/ranking.js";

function resolveCategoryAndLocationFromSlug(slug, locationSlugs) {
  const normalized = toSlug(slug);
  if (!normalized) return { categorySlug: "", locationSlug: "" };
  const orderedLocations = [...new Set(locationSlugs.map(toSlug).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const loc of orderedLocations) {
    if (normalized === loc) continue;
    if (normalized.endsWith(`-${loc}`)) {
      const categorySlug = normalized.slice(0, normalized.length - loc.length - 1);
      if (categorySlug) return { categorySlug, locationSlug: loc };
    }
  }
  return { categorySlug: "", locationSlug: "" };
}

function toPublicCard(profile, perf, row, rank) {
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    shortDescription: profile.shortDescription,
    locationLabel: profile.locationLabel,
    categoryBadges: (profile.categories || []).map((c) => c.name),
    heroImageUrl: profile.heroImageUrl,
    performance: perf,
    reviewRating: Number.isFinite(Number(row._reviewAverage)) ? Number(row._reviewAverage) : null,
    reviewCount: Number.isFinite(Number(row._reviewCount)) ? Number(row._reviewCount) : 0,
    badges: perf?.badges || [],
    rankHint: rank.rankScore >= 80 ? "Top match" : rank.rankScore >= 60 ? "Strong match" : "Good match",
  };
}

function buildItemListSchema({ canonical, title, rows }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    itemListOrder: "http://schema.org/ItemListOrderDescending",
    numberOfItems: rows.length,
    itemListElement: rows.map((row, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `https://eventwow.co.uk/suppliers/${row.slug}`,
      name: row.name,
    })),
    url: canonical,
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    let categorySlug = toSlug(req.query?.category_slug || "");
    let locationSlug = toSlug(req.query?.location_slug || "");
    const slug = toSlug(req.query?.slug || "");

    if ((!categorySlug || !locationSlug) && slug) {
      const locResp = await admin.from("seo_location_slugs").select("location_slug").limit(1000);
      if (locResp.error) return res.status(500).json({ ok: false, error: "Failed to resolve SEO slug", details: locResp.error.message });
      const resolved = resolveCategoryAndLocationFromSlug(slug, (locResp.data || []).map((r) => r.location_slug));
      if (!categorySlug) categorySlug = resolved.categorySlug;
      if (!locationSlug) locationSlug = resolved.locationSlug;
    }

    if (!categorySlug || !locationSlug) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing category_slug/location_slug or resolvable slug" });
    }

    const pageRaw = Number(req.query?.page ?? 1);
    const pageSizeRaw = Number(req.query?.pageSize ?? 24);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.max(1, Math.min(60, Math.floor(pageSizeRaw))) : 24;

    const [suppliersResp, reviewResp, imagesResp, featuresResp, marketResp] = await Promise.all([
      admin
        .from("suppliers")
        .select("id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,is_published,is_verified,created_at,updated_at")
        .eq("is_published", true)
        .limit(2000),
      admin.from("supplier_review_stats").select("supplier_id,average_rating,review_count"),
      admin.from("supplier_images").select("id,supplier_id,type,path,sort_order,caption,created_at"),
      admin.from("supplier_rank_features_30d").select("supplier_id,quotes_sent_30d,accepted_30d,response_time_median_minutes_30d,last_active_at,is_verified,plan_type,acceptance_rate_30d,smoothed_acceptance,response_score,activity_score,volume_score,base_quality"),
      admin.from("marketplace_stats_30d").select("global_acceptance_rate_30d").maybeSingle(),
    ]);

    if (suppliersResp.error) return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    if (reviewResp.error) return res.status(500).json({ ok: false, error: "Failed to load review stats", details: reviewResp.error.message });
    if (imagesResp.error) return res.status(500).json({ ok: false, error: "Failed to load images", details: imagesResp.error.message });
    if (featuresResp.error) return res.status(500).json({ ok: false, error: "Failed to load rank features", details: featuresResp.error.message });
    if (marketResp.error) return res.status(500).json({ ok: false, error: "Failed to load marketplace stats", details: marketResp.error.message });

    const globalAcceptance = Number(marketResp.data?.global_acceptance_rate_30d || 0);
    const reviewsBySupplier = new Map((reviewResp.data || []).map((r) => [r.supplier_id, r]));
    const featuresBySupplier = new Map((featuresResp.data || []).map((r) => [r.supplier_id, r]));
    const imagesBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }

    const ranked = (suppliersResp.data || [])
      .filter((s) => String(s.slug || "").trim().length > 0 && String(s.business_name || "").trim().length > 0)
      .map((s) => {
        const categoryMatch = categoryMatchStrength(categorySlug, s.listing_categories || []);
        const locationMatch = locationMatchStrength(locationSlug, { locationLabel: s.location_label, baseCity: s.base_city });
        const featureRow = featuresBySupplier.get(s.id) || {};
        const features = Number.isFinite(Number(featureRow.base_quality))
          ? {
              smoothedAcceptance: Number(featureRow.smoothed_acceptance || 0),
              responseScore: Number(featureRow.response_score || 0),
              activityScore: Number(featureRow.activity_score || 0),
              volumeScore: Number(featureRow.volume_score || 0),
              baseQuality: Number(featureRow.base_quality || 0),
            }
          : baseQualityScore({
              accepted30d: featureRow.accepted_30d || 0,
              quotesSent30d: featureRow.quotes_sent_30d || 0,
              globalAcceptanceRate30d: globalAcceptance,
              responseMinutes30d: featureRow.response_time_median_minutes_30d,
              lastActiveAt: featureRow.last_active_at,
            });
        const rank = computeRank({
          features,
          categoryMatch,
          locationMatch,
          isVerified: !!(featureRow.is_verified ?? s.is_verified),
          planType: featureRow.plan_type || "free",
        });
        const perfSignals = buildPerformanceSignals({
          acceptance_rate: featureRow.acceptance_rate_30d,
          response_time_seconds_median: Number(featureRow.response_time_median_minutes_30d || 0) * 60,
          last_active_at: featureRow.last_active_at,
          quotes_sent_count: featureRow.quotes_sent_30d,
          quotes_accepted_count: featureRow.accepted_30d,
        });
        const profile = buildPublicSupplierDto(s, imagesBySupplier.get(s.id) || [], SUPABASE_URL);
        const review = reviewsBySupplier.get(s.id);
        const dto = toPublicCard(profile, perfSignals, { _reviewAverage: review?.average_rating, _reviewCount: review?.review_count }, rank);
        return {
          ...dto,
          _supplierId: s.id,
          _rankScore: rank.rankScore,
          _match: rank.match,
          _lastActiveAt: featureRow.last_active_at || null,
        };
      })
      .filter((row) => row._match > 0)
      .sort((a, b) =>
        b._rankScore - a._rankScore ||
        b._match - a._match ||
        new Date(b._lastActiveAt || 0).getTime() - new Date(a._lastActiveAt || 0).getTime() ||
        String(a._supplierId).localeCompare(String(b._supplierId))
      );

    const totalCount = ranked.length;
    const offset = (page - 1) * pageSize;
    const rows = ranked.slice(offset, offset + pageSize).map(({ _supplierId, _rankScore, _match, _lastActiveAt, ...rest }) => rest);

    const categoryTitle = toTitle(categorySlug);
    const locationTitle = toTitle(locationSlug);
    const seoSlug = `${categorySlug}-${locationSlug}`;
    const title = `${categoryTitle} in ${locationTitle} | Eventwow`;
    const description = `Browse ${categoryTitle.toLowerCase()} suppliers in ${locationTitle}. Request quotes from trusted local vendors on Eventwow.`;
    const canonical = `https://eventwow.co.uk/${seoSlug}`;
    const schema = buildItemListSchema({ canonical, title: `${categoryTitle} in ${locationTitle}`, rows });

    return res.status(200).json({
      ok: true,
      page,
      pageSize,
      totalCount,
      category_slug: categorySlug,
      location_slug: locationSlug,
      meta: { title, description, canonical },
      schema,
      rows,
    });
  } catch (err) {
    console.error("public/seo/suppliers crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
