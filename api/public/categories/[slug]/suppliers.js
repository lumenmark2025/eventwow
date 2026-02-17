import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "../../../_lib/supplierListing.js";
import { computeSupplierGateFromData } from "../../../_lib/supplierGate.js";
import { buildPerformanceSignals } from "../../../_lib/performanceSignals.js";
import { toSlug } from "../../../_lib/ranking.js";

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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
    recommendedScore: supplier.is_verified ? 2 : 1,
  };
}

function matchesCategorySlug(listingCategories, categorySlug) {
  const needle = toSlug(categorySlug);
  if (!needle) return false;
  const values = Array.isArray(listingCategories) ? listingCategories : [];
  return values.some((value) => toSlug(value) === needle);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: "Missing server env vars" });
    }

    const categorySlug = toSlug(req.query?.slug || "");
    if (!categorySlug) {
      return res.status(400).json({ error: "Bad request", details: "Missing category slug" });
    }

    const page = clampInt(req.query?.page, 1, 1, 2000);
    const pageSize = clampInt(req.query?.pageSize, 24, 1, 60);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const categoryResp = await admin
      .from("supplier_category_options")
      .select("slug,display_name,label,short_description,is_active")
      .eq("slug", categorySlug)
      .eq("is_active", true)
      .maybeSingle();

    if (categoryResp.error) {
      return res.status(500).json({ error: "Failed to load category", details: categoryResp.error.message });
    }
    if (!categoryResp.data) {
      return res.status(404).json({ error: "Category not found" });
    }

    const categoryName = String(categoryResp.data.display_name || categoryResp.data.label || "").trim();
    if (!categoryName) {
      return res.status(404).json({ error: "Category not found" });
    }

    const suppliersResp = await admin
      .from("suppliers")
      .select(
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,is_published,is_verified,is_insured,fsa_rating_url,fsa_rating_value,fsa_rating_date,created_at,updated_at"
      )
      .eq("is_published", true)
      .contains("listing_categories", [categoryName])
      .order("is_verified", { ascending: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(2000);

    if (suppliersResp.error) {
      return res.status(500).json({ error: "Failed to load suppliers", details: suppliersResp.error.message });
    }

    const filteredSuppliers = (suppliersResp.data || [])
      .filter((supplier) => matchesCategorySlug(supplier.listing_categories, categorySlug))
      .filter((supplier) => String(supplier.slug || "").trim().length > 0 && String(supplier.business_name || "").trim().length > 0);

    const supplierIds = filteredSuppliers.map((supplier) => supplier.id);
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
      return res.status(500).json({ error: "Failed to load supplier images", details: imagesResp.error.message });
    }
    if (reviewStatsResp.error) {
      return res.status(500).json({ error: "Failed to load supplier review stats", details: reviewStatsResp.error.message });
    }
    if (perfResp.error) {
      const code = String(perfResp.error.code || "");
      const message = String(perfResp.error.message || "").toLowerCase();
      const missingView = code === "42P01" || message.includes("supplier_performance_30d");
      if (!missingView) {
        return res.status(500).json({ error: "Failed to load supplier performance", details: perfResp.error.message });
      }
    }

    const imagesBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }
    const perfBySupplier = new Map(((perfResp.data || [])).map((row) => [row.supplier_id, buildPerformanceSignals(row)]));
    const reviewBySupplier = new Map((reviewStatsResp.data || []).map((row) => [row.supplier_id, row]));

    const ordered = filteredSuppliers
      .map((supplier) => {
        const review = reviewBySupplier.get(supplier.id);
        return {
          ...supplier,
          _images: imagesBySupplier.get(supplier.id) || [],
          _reviewAverage: review?.average_rating ?? null,
          _reviewCount: review?.review_count ?? 0,
        };
      })
      .filter((supplier) => computeSupplierGateFromData({ supplier, images: supplier._images }).canPublish)
      .map((supplier) => toCardRow(supplier, SUPABASE_URL, perfBySupplier.get(supplier.id) || buildPerformanceSignals(null)))
      .sort((a, b) => {
        if (b.recommendedScore !== a.recommendedScore) return b.recommendedScore - a.recommendedScore;
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        const nameCmp = String(a.name || "").localeCompare(String(b.name || ""));
        if (nameCmp !== 0) return nameCmp;
        return String(a.id || "").localeCompare(String(b.id || ""));
      });

    const total = ordered.length;
    const offset = (page - 1) * pageSize;
    const paged = ordered.slice(offset, offset + pageSize).map(({ recommendedScore, ...dto }) => dto);

    return res.status(200).json({
      category: {
        display_name: categoryName,
        slug: categorySlug,
        short_description: categoryResp.data.short_description || null,
      },
      suppliers: paged,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (err) {
    console.error("public/categories/[slug]/suppliers crashed:", err);
    return res.status(500).json({ error: "Internal Server Error", details: String(err?.message || err) });
  }
}
