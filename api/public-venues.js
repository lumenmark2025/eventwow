import { createClient } from "@supabase/supabase-js";
import { normalizeSort, toVenueCardDto } from "./_lib/venues.js";

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
    const sort = normalizeSort(req.query?.sort);
    const limitRaw = Number(req.query?.limit ?? 24);
    const offsetRaw = Number(req.query?.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, limitRaw)) : 24;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: venues, error } = await admin
      .from("venues")
      .select("id,name,slug,location_label,city,guest_min,guest_max,short_description,description,is_published,created_at,updated_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(600);

    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to load venues", details: error.message });
    }

    const rows = venues || [];
    const venueIds = rows.map((v) => v.id);
    const heroResp =
      venueIds.length > 0
        ? await admin
            .from("venue_images")
            .select("venue_id,path,sort_order")
            .eq("type", "hero")
            .in("venue_id", venueIds)
            .order("sort_order", { ascending: true })
        : { data: [], error: null };

    if (heroResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load venue images", details: heroResp.error.message });
    }

    const heroByVenue = new Map();
    for (const img of heroResp.data || []) {
      if (!heroByVenue.has(img.venue_id)) heroByVenue.set(img.venue_id, img.path || null);
    }

    let mapped = rows
      .filter((v) => String(v.slug || "").trim().length > 0 && String(v.name || "").trim().length > 0)
      .map((v) => toVenueCardDto(v, heroByVenue.get(v.id), SUPABASE_URL));

    if (q) {
      mapped = mapped.filter((v) =>
        [v.name, v.shortDescription, v.locationLabel].filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }

    if (sort === "newest") {
      mapped = [...mapped].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else {
      mapped = [...mapped].sort((a, b) => {
        const aHasHero = a.heroImageUrl ? 1 : 0;
        const bHasHero = b.heroImageUrl ? 1 : 0;
        if (aHasHero !== bHasHero) return bHasHero - aHasHero;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    }

    const totalCount = mapped.length;
    const paged = mapped.slice(offset, offset + limit);

    return res.status(200).json({ ok: true, rows: paged, totalCount, limit, offset });
  } catch (err) {
    console.error("public-venues crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
