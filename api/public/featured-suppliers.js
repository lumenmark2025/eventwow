import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "../_lib/supplierListing.js";

function clampLimit(raw, fallback = 12) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(24, Math.trunc(n)));
}

function daySeed() {
  return new Date().toISOString().slice(0, 10);
}

function tieRandomScore(seed, id) {
  const text = `${seed}:${String(id || "")}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    const limit = clampLimit(req.query?.limit, 12);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const suppliersResp = await admin
      .from("suppliers")
      .select("id,slug,business_name,short_description,description,about,services,location_label,listing_categories,base_city,base_postcode,is_published,is_insured,fsa_rating_url,fsa_rating_value,fsa_rating_date,created_at,updated_at")
      .eq("is_published", true)
      .not("slug", "is", null)
      .limit(500);

    if (suppliersResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    }

    const suppliers = (suppliersResp.data || []).filter((row) => String(row.slug || "").trim() && String(row.business_name || "").trim());
    const supplierIds = suppliers.map((row) => row.id);

    const [imagesResp, reviewStatsResp] = await Promise.all([
      supplierIds.length > 0
        ? admin
            .from("supplier_images")
            .select("supplier_id,path,type,sort_order,caption,created_at")
            .in("supplier_id", supplierIds)
        : { data: [], error: null },
      supplierIds.length > 0
        ? admin
            .from("supplier_review_stats")
            .select("supplier_id,average_rating,review_count")
            .in("supplier_id", supplierIds)
        : { data: [], error: null },
    ]);

    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier images", details: imagesResp.error.message });
    }
    if (reviewStatsResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load review stats", details: reviewStatsResp.error.message });
    }

    const imagesBySupplier = new Map();
    for (const image of imagesResp.data || []) {
      if (!imagesBySupplier.has(image.supplier_id)) imagesBySupplier.set(image.supplier_id, []);
      imagesBySupplier.get(image.supplier_id).push(image);
    }
    const reviewBySupplier = new Map((reviewStatsResp.data || []).map((row) => [row.supplier_id, row]));

    const seed = daySeed();
    const rows = suppliers
      .map((supplier) => {
        const profile = buildPublicSupplierDto(supplier, imagesBySupplier.get(supplier.id) || [], SUPABASE_URL);
        const review = reviewBySupplier.get(supplier.id);
        const ratingNum = Number(profile.fsaRatingValue);
        const fsaSort = Number.isFinite(ratingNum) ? ratingNum : -1;
        const categories = Array.isArray(profile.categories) ? profile.categories : [];
        const primaryCategory = categories.length > 0 ? categories[0]?.name || null : null;

        return {
          id: profile.id,
          slug: profile.slug,
          name: profile.name,
          short_description: profile.shortDescription,
          shortDescription: profile.shortDescription,
          location_label: profile.locationLabel,
          locationLabel: profile.locationLabel,
          hero_image_url: profile.heroImageUrl,
          heroImageUrl: profile.heroImageUrl,
          primary_category: primaryCategory,
          primaryCategory,
          is_insured: profile.isInsured,
          isInsured: profile.isInsured,
          fsa_rating_value: profile.fsaRatingValue,
          fsaRatingValue: profile.fsaRatingValue,
          fsa_rating_url: profile.fsaRatingUrl,
          fsaRatingUrl: profile.fsaRatingUrl,
          fsa_rating_badge_key: profile.fsaRatingBadgeKey,
          fsaRatingBadgeKey: profile.fsaRatingBadgeKey,
          fsa_rating_badge_url: profile.fsaRatingBadgeUrl,
          fsaRatingBadgeUrl: profile.fsaRatingBadgeUrl,
          review_rating: Number.isFinite(Number(review?.average_rating)) ? Number(review.average_rating) : null,
          review_count: Number.isFinite(Number(review?.review_count)) ? Number(review.review_count) : 0,
          _insuredSort: profile.isInsured ? 1 : 0,
          _fsaSort: fsaSort,
          _tie: tieRandomScore(seed, profile.id),
        };
      })
      .sort((a, b) => {
        if (b._insuredSort !== a._insuredSort) return b._insuredSort - a._insuredSort;
        if (b._fsaSort !== a._fsaSort) return b._fsaSort - a._fsaSort;
        if (a._tie !== b._tie) return a._tie - b._tie;
        return String(a.id || "").localeCompare(String(b.id || ""));
      })
      .slice(0, limit)
      .map(({ _insuredSort, _fsaSort, _tie, ...row }) => row);

    return res.status(200).json({ ok: true, suppliers: rows, limit });
  } catch (err) {
    console.error("public featured suppliers crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
