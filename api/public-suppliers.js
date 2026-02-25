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

const INTENT_CATEGORY_HINTS = {
  wedding: ["wedding", "venue", "venues", "photographer", "photographers", "catering", "florist", "florists", "dj", "djs", "band", "bands", "decor", "cake", "cakes", "entertainment"],
  corporate: ["corporate", "conference", "meeting", "venue", "venues", "catering", "entertainment", "photographer", "photographers"],
  birthday: ["birthday", "party", "catering", "cakes", "entertainment", "dj", "djs", "bands", "decor"],
  party: ["party", "entertainment", "dj", "djs", "bands", "catering", "cakes", "decor"],
};

const TERM_CATEGORY_HINTS = {
  photographer: ["photographer", "photographers"],
  photographers: ["photographer", "photographers"],
  dj: ["dj", "djs", "entertainment"],
  djs: ["dj", "djs", "entertainment"],
  catering: ["catering"],
  caterer: ["catering"],
  florists: ["florists", "flowers"],
  florist: ["florists", "flowers"],
  bands: ["bands", "entertainment"],
  band: ["bands", "entertainment"],
  cake: ["cakes", "cake"],
  cakes: ["cakes", "cake"],
};

function normalizeSort(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "newest" ? "newest" : "recommended";
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function buildSearchIntent(rawQuery) {
  const terms = tokenize(rawQuery);
  const intentTokens = terms.filter((term) => Object.prototype.hasOwnProperty.call(INTENT_CATEGORY_HINTS, term));
  const keywordTokens = terms.filter((term) => !intentTokens.includes(term));
  const categoryHints = new Set();
  for (const token of intentTokens) {
    for (const hint of INTENT_CATEGORY_HINTS[token] || []) categoryHints.add(hint);
  }
  for (const token of keywordTokens) {
    for (const hint of TERM_CATEGORY_HINTS[token] || []) categoryHints.add(hint);
  }
  return {
    terms,
    intentTokens,
    keywordTokens,
    categoryHints: [...categoryHints],
  };
}

function matchesLocation(row, locationValue) {
  const needle = normalizeText(locationValue);
  if (!needle) return true;
  const fields = [
    row.locationLabel,
    row.name,
    row.shortDescription,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return fields.some((field) => field.includes(needle) || needle.includes(field));
}

function matchesText(row, tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return false;
  const haystack = normalizeText([row.name, row.shortDescription, row.locationLabel, ...(row.categoryBadges || [])].join(" "));
  return tokens.some((token) => haystack.includes(token));
}

function matchesIntentOrKeyword(row, searchIntent) {
  const hasTokens = searchIntent.intentTokens.length > 0 || searchIntent.keywordTokens.length > 0;
  if (!hasTokens) return true;
  const categoryText = normalizeText((row.categoryBadges || []).join(" "));
  const contentText = normalizeText([row.name, row.shortDescription].join(" "));
  const hintMatch = searchIntent.categoryHints.some((hint) => categoryText.includes(hint) || contentText.includes(hint));
  const keywordMatch = searchIntent.keywordTokens.length > 0 && matchesText(row, searchIntent.keywordTokens);
  const genericMatch = searchIntent.terms.length > 0 && matchesText(row, searchIntent.terms);
  return hintMatch || keywordMatch || genericMatch;
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
    services: Array.isArray(supplier.services) ? supplier.services : [],
    travel_radius_miles: Number.isFinite(Number(supplier.travel_radius_miles)) ? Number(supplier.travel_radius_miles) : 30,
    _distanceMiles: Number.isFinite(Number(supplier._distance_miles)) ? Number(supplier._distance_miles) : null,
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

    const qRaw = String(req.query?.q || "").trim();
    const q = stripUkPostcode(qRaw).toLowerCase();
    const queryTokens = tokenizeKeywords(q);
    const searchIntent = buildSearchIntent(q);
    const locationFilter = String(req.query?.location || "").trim();
    const category = String(req.query?.category || "").trim().toLowerCase();
    const sort = normalizeSort(req.query?.sort);
    const host = String(req.headers?.host || "").toLowerCase();
    const debugScore = String(req.query?.debugScore || "") === "1"
      && (host.includes("localhost") || host.includes("127.0.0.1"));
    const limitRaw = Number(req.query?.limit ?? 24);
    const offsetRaw = Number(req.query?.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, limitRaw)) : 24;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: suppliers, error } = await admin
      .from("suppliers")
      .select(
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,base_lat,base_lng,travel_radius_miles,is_published,is_verified,is_insured,fsa_rating_url,fsa_rating_value,fsa_rating_date,created_at,updated_at"
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: error.message });
    }

    let supplierRows = suppliers || [];
    const eventPostcode = getPostcodeFromQuery(req.query);
    if (eventPostcode) {
      const eventCoords = await geocodeUkPostcodeWithCache(admin, eventPostcode);
      if (eventCoords) {
        supplierRows = await filterSuppliersByTravelRadius(admin, supplierRows, eventCoords);
      }
    }

    const supplierIds = supplierRows.map((s) => s.id);
    const imagesResp =
      supplierIds.length > 0
        ? await admin
            .from("supplier_images")
            .select("id,supplier_id,type,path,sort_order,caption,created_at")
            .in("supplier_id", supplierIds)
        : { data: [], error: null };

    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: imagesResp.error.message });
    }

    const imagesBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }

    const perfResp =
      supplierIds.length > 0
        ? await admin
            .from("supplier_performance_30d")
            .select(
              "supplier_id,invites_count,quotes_sent_count,quotes_accepted_count,acceptance_rate,response_time_seconds_median,last_quote_sent_at,last_active_at"
            )
            .in("supplier_id", supplierIds)
        : { data: [], error: null };

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

    const perfBySupplier = new Map(
      ((perfResp.data || [])).map((row) => [row.supplier_id, buildPerformanceSignals(row)])
    );

    const reviewStatsResp =
      supplierIds.length > 0
        ? await admin.from("supplier_review_stats").select("supplier_id,average_rating,review_count").in("supplier_id", supplierIds)
        : { data: [], error: null };
    if (reviewStatsResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier review stats",
        details: reviewStatsResp.error.message,
      });
    }
    const reviewBySupplier = new Map((reviewStatsResp.data || []).map((row) => [row.supplier_id, row]));

    const baseRows = supplierRows
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

    let rows = baseRows;
    if (category && category !== "all") {
      rows = rows.filter((r) => (r.categoryBadges || []).some((c) => c.toLowerCase() === category));
    }

    const intentRows = rows.filter((row) => matchesIntentOrKeyword(row, searchIntent));
    if (locationFilter) {
      const locationRows = intentRows.filter((row) => matchesLocation(row, locationFilter));
      if (locationRows.length > 0) {
        rows = locationRows;
      } else if (intentRows.length > 0) {
        rows = intentRows;
      } else {
        const fallbackTextRows = rows.filter((row) => matchesText(row, searchIntent.terms));
        rows = fallbackTextRows.length > 0 ? fallbackTextRows : rows;
      }
    } else if (intentRows.length > 0) {
      rows = intentRows;
    } else if (q) {
      const fallbackTextRows = rows.filter((row) => matchesText(row, searchIntent.terms));
      if (fallbackTextRows.length > 0) rows = fallbackTextRows;
    }

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

    const totalCount = rows.length;
    const paged = rows.slice(offset, offset + limit).map((row) => {
      const {
        _score,
        _scoreBreakdown,
        _distanceMiles,
        _services,
        _travel_radius_miles,
        ...rest
      } = row;
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
      rows: paged,
      totalCount,
      limit,
      offset,
    });
  } catch (err) {
    console.error("public-suppliers crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
