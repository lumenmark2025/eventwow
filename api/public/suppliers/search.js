import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "../../_lib/supplierListing.js";
import { computeSupplierGateFromData } from "../../_lib/supplierGate.js";

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

    const q = normalizeQuery(req.query?.q);
    const page = clampInt(req.query?.page, 1, 1, 2000);
    const pageSize = clampInt(req.query?.pageSize, 12, 1, 24);

    if (!q) {
      return res.status(200).json({
        ok: true,
        q: "",
        suppliers: [],
        pagination: { page, pageSize, total: 0 },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const ilike = `%${q.replace(/[%_]/g, " ").trim()}%`;

    const suppliersResp = await admin
      .from("suppliers")
      .select(
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,is_published,is_verified,is_insured,fsa_rating_url,fsa_rating_value,fsa_rating_date,created_at,updated_at"
      )
      .eq("is_published", true)
      .or(`business_name.ilike.${ilike},location_label.ilike.${ilike},base_city.ilike.${ilike},short_description.ilike.${ilike},description.ilike.${ilike}`)
      .order("is_verified", { ascending: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(500);

    if (suppliersResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    }

    const qLower = q.toLowerCase();
    const filtered = (suppliersResp.data || [])
      .filter((row) => String(row.slug || "").trim() && String(row.business_name || "").trim())
      .filter((row) => toSearchableText(row).includes(qLower));

    const supplierIds = filtered.map((s) => s.id);
    const [imagesResp, reviewStatsResp] = await Promise.all([
      supplierIds.length > 0
        ? admin
            .from("supplier_images")
            .select("id,supplier_id,type,path,sort_order,caption,created_at")
            .in("supplier_id", supplierIds)
        : { data: [], error: null },
      supplierIds.length > 0
        ? admin.from("supplier_review_stats").select("supplier_id,average_rating,review_count").in("supplier_id", supplierIds)
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

    const imagesBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }
    const reviewBySupplier = new Map((reviewStatsResp.data || []).map((row) => [row.supplier_id, row]));

    const rows = filtered
      .map((supplier) => {
        const images = imagesBySupplier.get(supplier.id) || [];
        if (!computeSupplierGateFromData({ supplier, images }).canPublish) return null;
        const profile = buildPublicSupplierDto(supplier, images, SUPABASE_URL);
        const review = reviewBySupplier.get(supplier.id);
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
          performance: {},
          createdAt: profile.lastUpdatedAt || supplier.created_at || null,
          _isVerified: !!supplier.is_verified,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (Number(b._isVerified) !== Number(a._isVerified)) return Number(b._isVerified) - Number(a._isVerified);
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return String(a.id || "").localeCompare(String(b.id || ""));
      });

    const total = rows.length;
    const offset = (page - 1) * pageSize;
    const paged = rows.slice(offset, offset + pageSize).map(({ _isVerified, ...row }) => row);

    return res.status(200).json({
      ok: true,
      q,
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
