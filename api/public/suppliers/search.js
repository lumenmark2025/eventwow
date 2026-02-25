import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "../../_lib/supplierListing.js";
import { computeSupplierGateFromData } from "../../_lib/supplierGate.js";
import {
  buildPerformanceSignals,
  computeDeterministicSupplierScore,
  tokenizeKeywords,
} from "../../_lib/performanceSignals.js";
import {
  filterSuppliersByTravelRadius,
  geocodeUkPostcodeWithCache,
  getPostcodeFromQuery,
  stripUkPostcode,
} from "../../_lib/postcodeGeocode.js";

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeQuery(value) {
  return String(value || "").trim().slice(0, 80);
}

function toSearchableText(row) {
  return [
    row.business_name,
    row.short_description,
    row.description,
    row.location_label,
    row.base_city,
    ...(Array.isArray(row.listing_categories) ? row.listing_categories : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

    const qRaw = normalizeQuery(req.query?.q);
    const q = normalizeQuery(stripUkPostcode(qRaw));
    const queryTokens = tokenizeKeywords(q);
    const eventPostcode = getPostcodeFromQuery(req.query);
    const host = String(req.headers?.host || "").toLowerCase();
    const debugScore = String(req.query?.debugScore || "") === "1"
      && (host.includes("localhost") || host.includes("127.0.0.1"));
    const page = clampInt(req.query?.page, 1, 1, 2000);
    const pageSize = clampInt(req.query?.pageSize, 12, 1, 24);

    if (!q && !eventPostcode) {
      return res.status(200).json({
        ok: true,
        q: qRaw,
        suppliers: [],
        pagination: { page, pageSize, total: 0 },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let suppliersQuery = admin
      .from("suppliers")
      .select(
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,base_lat,base_lng,travel_radius_miles,is_published,is_verified,is_insured,fsa_rating_url,fsa_rating_value,fsa_rating_date,created_at,updated_at"
      )
      .eq("is_published", true)
      .order("is_verified", { ascending: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(500);
    if (q) {
      const ilike = `%${q.replace(/[%_]/g, " ").trim()}%`;
      suppliersQuery = suppliersQuery.or(`business_name.ilike.${ilike},location_label.ilike.${ilike},base_city.ilike.${ilike},short_description.ilike.${ilike},description.ilike.${ilike}`);
    }
    const suppliersResp = await suppliersQuery;

    if (suppliersResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    }

    const qLower = q.toLowerCase();
    let filtered = (suppliersResp.data || [])
      .filter((row) => String(row.slug || "").trim() && String(row.business_name || "").trim())
      .filter((row) => (qLower ? toSearchableText(row).includes(qLower) : true));

    if (eventPostcode) {
      const eventCoords = await geocodeUkPostcodeWithCache(admin, eventPostcode);
      if (eventCoords) {
        filtered = await filterSuppliersByTravelRadius(admin, filtered, eventCoords);
      }
    }

    const supplierIds = filtered.map((s) => s.id);
    const [imagesResp, reviewStatsResp, perfResp] = await Promise.all([
      supplierIds.length > 0
        ? admin
            .from("supplier_images")
            .select("id,supplier_id,type,path,sort_order,caption,created_at")
            .in("supplier_id", supplierIds)
        : { data: [], error: null },
      supplierIds.length > 0
        ? admin.from("supplier_review_stats").select("supplier_id,average_rating,review_count").in("supplier_id", supplierIds)
        : { data: [], error: null },
      supplierIds.length > 0
        ? admin
            .from("supplier_performance_30d")
            .select(
              "supplier_id,invites_count,quotes_sent_count,quotes_accepted_count,acceptance_rate,response_time_seconds_median,last_quote_sent_at,last_active_at"
            )
            .in("supplier_id", supplierIds)
        : { data: [], error: null },
    ]);

    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: imagesResp.error.message });
    }
    if (reviewStatsResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier review stats",
        details: reviewStatsResp.error.message,
      });
    }
    if (perfResp.error) {
      const code = String(perfResp.error.code || "");
      const message = String(perfResp.error.message || "").toLowerCase();
      const missingView = code === "42P01" || message.includes("supplier_performance_30d");
      if (!missingView) {
        return res.status(500).json({
          ok: false,
          error: "Failed to load supplier performance",
          details: perfResp.error.message,
        });
      }
    }

    const imagesBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }
    const reviewBySupplier = new Map((reviewStatsResp.data || []).map((row) => [row.supplier_id, row]));
    const perfBySupplier = new Map(((perfResp.data || [])).map((row) => [row.supplier_id, buildPerformanceSignals(row)]));

    const rows = filtered
      .map((supplier) => {
        const images = imagesBySupplier.get(supplier.id) || [];
        if (!computeSupplierGateFromData({ supplier, images }).canPublish) return null;
        const profile = buildPublicSupplierDto(supplier, images, SUPABASE_URL);
        const review = reviewBySupplier.get(supplier.id);
        const performance = perfBySupplier.get(supplier.id) || buildPerformanceSignals(null);
        const distanceMiles = Number.isFinite(Number(supplier?._distance_miles))
          ? Number(supplier._distance_miles)
          : null;
        const rank = computeDeterministicSupplierScore({
          supplier: {
            ...supplier,
            services: Array.isArray(supplier.services) ? supplier.services : [],
            travel_radius_miles: Number.isFinite(Number(supplier.travel_radius_miles)) ? Number(supplier.travel_radius_miles) : 30,
            shortDescription: profile.shortDescription,
          },
          queryTokens,
          distanceMiles,
          reviewRating: review?.average_rating,
          reviewCount: review?.review_count,
          performance,
        });
        return {
          id: profile.id,
          slug: profile.slug,
          name: profile.name,
          business_name: profile.name,
          shortDescription: profile.shortDescription,
          short_description: profile.shortDescription,
          locationLabel: profile.locationLabel,
          location_label: profile.locationLabel,
          heroImageUrl: profile.heroImageUrl,
          hero_image_url: profile.heroImageUrl,
          categoryBadges: (profile.categories || []).map((c) => c.name),
          reviewRating: Number.isFinite(Number(review?.average_rating)) ? Number(review.average_rating) : null,
          rating_avg: Number.isFinite(Number(review?.average_rating)) ? Number(review.average_rating) : null,
          reviewCount: Number.isFinite(Number(review?.review_count)) ? Number(review.review_count) : 0,
          review_count: Number.isFinite(Number(review?.review_count)) ? Number(review.review_count) : 0,
          isInsured: profile.isInsured,
          is_insured: profile.isInsured,
          fsaRatingValue: profile.fsaRatingValue,
          fsa_rating_value: profile.fsaRatingValue,
          fsaRatingUrl: profile.fsaRatingUrl,
          fsa_rating_url: profile.fsaRatingUrl,
          fsaRatingDate: profile.fsaRatingDate,
          fsa_rating_date: profile.fsaRatingDate,
          fsaRatingBadgeKey: profile.fsaRatingBadgeKey,
          fsa_rating_badge_key: profile.fsaRatingBadgeKey,
          fsaRatingBadgeUrl: profile.fsaRatingBadgeUrl,
          fsa_rating_badge_url: profile.fsaRatingBadgeUrl,
          performance,
          createdAt: profile.lastUpdatedAt || supplier.created_at || null,
          _score: rank.score,
          _scoreBreakdown: rank.breakdown,
          _distanceMiles: distanceMiles,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        const aDistance = Number.isFinite(Number(a._distanceMiles)) ? Number(a._distanceMiles) : Number.POSITIVE_INFINITY;
        const bDistance = Number.isFinite(Number(b._distanceMiles)) ? Number(b._distanceMiles) : Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });

    const total = rows.length;
    const offset = (page - 1) * pageSize;
    const paged = rows.slice(offset, offset + pageSize).map((row) => {
      const { _score, _scoreBreakdown, _distanceMiles, ...rest } = row;
      if (debugScore) {
        return {
          ...rest,
          debugScore: {
            score: _score ?? null,
            breakdown: _scoreBreakdown || null,
            distanceMiles: _distanceMiles ?? null,
          },
        };
      }
      return rest;
    });

    return res.status(200).json({
      ok: true,
      q: qRaw,
      suppliers: paged,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (err) {
    console.error("public/suppliers/search crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
