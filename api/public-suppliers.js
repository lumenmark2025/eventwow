import { createClient } from "@supabase/supabase-js";
import { buildPublicSupplierDto } from "./_lib/supplierListing.js";
import { computeSupplierGateFromData } from "./_lib/supplierGate.js";
import { buildPerformanceSignals } from "./_lib/performanceSignals.js";

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
    recommendedScore: supplier.is_verified ? 2 : 1,
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

    const q = String(req.query?.q || "").trim().toLowerCase();
    const category = String(req.query?.category || "").trim().toLowerCase();
    const sort = normalizeSort(req.query?.sort);
    const limitRaw = Number(req.query?.limit ?? 24);
    const offsetRaw = Number(req.query?.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, limitRaw)) : 24;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: suppliers, error } = await admin
      .from("suppliers")
      .select(
        "id,slug,business_name,description,short_description,about,services,location_label,listing_categories,base_city,base_postcode,listed_publicly,is_verified,created_at,updated_at"
      )
      .eq("listed_publicly", true)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: error.message });
    }

    const supplierRows = suppliers || [];
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
    if (q) {
      rows = rows.filter((r) =>
        [r.name, r.shortDescription, r.locationLabel, ...(r.categoryBadges || [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if (category && category !== "all") {
      rows = rows.filter((r) => (r.categoryBadges || []).some((c) => c.toLowerCase() === category));
    }

    if (sort === "newest") {
      rows = [...rows].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else {
      rows = [...rows].sort((a, b) => {
        if (b.recommendedScore !== a.recommendedScore) return b.recommendedScore - a.recommendedScore;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    }

    const totalCount = rows.length;
    const paged = rows.slice(offset, offset + limit).map(({ recommendedScore, ...rest }) => rest);

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
