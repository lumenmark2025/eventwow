import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "./_lib/supplierListing.js";
import { computeSupplierGateFromData } from "./_lib/supplierGate.js";
import {
  buildPerformanceSignals,
  computeDeterministicSupplierScore,
  tokenizeKeywords,
} from "./_lib/performanceSignals.js";
import {
  filterSuppliersByTravelRadius,
  geocodeUkPostcodeWithCache,
  getPostcodeFromQuery,
  stripUkPostcode,
} from "./_lib/postcodeGeocode.js";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toTitleCaseFromSlug(slug) {
  const s = normalizeSlug(slug);
  if (!s) return "";
  return s
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSort(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "newest" ? "newest" : "recommended";
}

function toCardRow(supplier, supabaseUrl, performance) {
  const profile = buildPublicSupplierDto(supplier, supplier._images || [], supabaseUrl);
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    shortDescription: profile.shortDescription,
    locationLabel: profile.locationLabel,
    categoryBadges: (profile.categories || []).map((c) => c.name),
    heroImageUrl: profile.heroImageUrl,
    createdAt: profile.lastUpdatedAt || supplier.created_at || null,
    performance,
    reviewRating: Number.isFinite(Number(supplier._reviewAverage)) ? Number(supplier._reviewAverage) : null,
    reviewCount: Number.isFinite(Number(supplier._reviewCount)) ? Number(supplier._reviewCount) : 0,
    services: Array.isArray(supplier.services) ? supplier.services : [],
    travel_radius_miles: Number.isFinite(Number(supplier.travel_radius_miles)) ? Number(supplier.travel_radius_miles) : 30,
    _distanceMiles: Number.isFinite(Number(supplier._distance_miles)) ? Number(supplier._distance_miles) : null,
  };
}

function includesLocation(supplier, locationSlug) {
  if (!locationSlug) return true;
  const needle = normalizeSlug(locationSlug);
  const fields = [supplier.location_label, supplier.base_city]
    .map((v) => normalizeSlug(v))
    .filter(Boolean);
  return fields.some((field) => field.includes(needle));
}

function includesCategory(supplier, categorySlug) {
  if (!categorySlug) return true;
  const needle = normalizeSlug(categorySlug);
  const categories = Array.isArray(supplier.listing_categories) ? supplier.listing_categories : [];
  return categories.some((c) => normalizeSlug(c) === needle);
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

    const categorySlug = normalizeSlug(req.query?.categorySlug || "");
    const locationSlug = normalizeSlug(req.query?.locationSlug || "");
    const sort = normalizeSort(req.query?.sort);
    const limitRaw = Number(req.query?.limit ?? 48);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(120, limitRaw)) : 48;
    const queryTokens = tokenizeKeywords(stripUkPostcode(String(req.query?.q || "")));
    const host = String(req.headers?.host || "").toLowerCase();
    const debugScore = String(req.query?.debugScore || "") === "1"
      && (host.includes("localhost") || host.includes("127.0.0.1"));

    if (!categorySlug && !locationSlug) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "categorySlug or locationSlug is required" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: suppliers, error } = await admin
      .from("suppliers")
      .select(
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,base_lat,base_lng,travel_radius_miles,is_published,is_verified,created_at,updated_at"
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: error.message });
    }

    let supplierRows = (suppliers || [])
      .filter((s) => includesCategory(s, categorySlug))
      .filter((s) => includesLocation(s, locationSlug));

    const eventPostcode = getPostcodeFromQuery(req.query);
    if (eventPostcode) {
      const eventCoords = await geocodeUkPostcodeWithCache(admin, eventPostcode);
      if (eventCoords) {
        supplierRows = await filterSuppliersByTravelRadius(admin, supplierRows, eventCoords);
      }
    }

    const supplierIds = supplierRows.map((s) => s.id);
    const [imagesResp, perfResp, reviewStatsResp] = await Promise.all([
      supplierIds.length > 0
        ? admin
            .from("supplier_images")
            .select("id,supplier_id,type,path,sort_order,caption,created_at")
            .in("supplier_id", supplierIds)
        : { data: [], error: null },
      supplierIds.length > 0
        ? admin
            .from("supplier_performance_30d")
            .select(
              "supplier_id,invites_count,quotes_sent_count,quotes_accepted_count,acceptance_rate,response_time_seconds_median,last_quote_sent_at,last_active_at"
            )
            .in("supplier_id", supplierIds)
        : { data: [], error: null },
      supplierIds.length > 0
        ? admin.from("supplier_review_stats").select("supplier_id,average_rating,review_count").in("supplier_id", supplierIds)
        : { data: [], error: null },
    ]);

    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: imagesResp.error.message });
    }
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
    if (reviewStatsResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier review stats",
        details: reviewStatsResp.error.message,
      });
    }

    const imagesBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }
    const perfBySupplier = new Map(((perfResp.data || [])).map((row) => [row.supplier_id, buildPerformanceSignals(row)]));
    const reviewBySupplier = new Map((reviewStatsResp.data || []).map((row) => [row.supplier_id, row]));

    let rows = supplierRows
      .filter((s) => String(s.slug || "").trim().length > 0 && String(s.business_name || "").trim().length > 0)
      .map((s) => {
        const stats = reviewBySupplier.get(s.id);
        return {
          ...s,
          _images: imagesBySupplier.get(s.id) || [],
          _reviewAverage: stats?.average_rating ?? null,
          _reviewCount: stats?.review_count ?? 0,
        };
      })
      .filter((s) => computeSupplierGateFromData({ supplier: s, images: s._images }).canPublish)
      .map((s) => toCardRow(s, SUPABASE_URL, perfBySupplier.get(s.id) || buildPerformanceSignals(null)));

    if (sort === "newest") {
      rows = [...rows].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else {
      rows = rows.map((row) => {
        const rank = computeDeterministicSupplierScore({
          supplier: row,
          queryTokens,
          distanceMiles: row._distanceMiles,
          reviewRating: row.reviewRating,
          reviewCount: row.reviewCount,
          performance: row.performance,
        });
        return {
          ...row,
          _score: rank.score,
          _scoreBreakdown: rank.breakdown,
        };
      });
      rows = [...rows].sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        const aDistance = Number.isFinite(Number(a._distanceMiles)) ? Number(a._distanceMiles) : Number.POSITIVE_INFINITY;
        const bDistance = Number.isFinite(Number(b._distanceMiles)) ? Number(b._distanceMiles) : Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
    }

    const responseRows = rows.slice(0, limit).map((row) => {
      const { _score, _scoreBreakdown, _distanceMiles, _services, _travel_radius_miles, ...rest } = row;
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
      categorySlug: categorySlug || null,
      categoryName: categorySlug ? toTitleCaseFromSlug(categorySlug) : null,
      locationSlug: locationSlug || null,
      locationName: locationSlug ? toTitleCaseFromSlug(locationSlug) : null,
      rows: responseRows,
      totalCount: rows.length,
    });
  } catch (err) {
    console.error("public-suppliers-by-category-location crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
