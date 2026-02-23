import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { parseBody, toVenueProfileDto } from "./_lib/venues.js";

function normalizeText(value, maxLen = 120) {
  return String(value || "").trim().slice(0, maxLen);
}

function slugifyTypeName(value) {
  return normalizeText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function loadVenueTypes(admin) {
  const resp = await admin
    .from("venue_types")
    .select("id,name,slug,created_at")
    .order("name", { ascending: true })
    .limit(300);
  if (resp.error) return { ok: false, error: resp.error.message, rows: [] };
  return { ok: true, rows: Array.isArray(resp.data) ? resp.data : [] };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    if (req.method === "POST") {
      const body = parseBody(req);
      const action = String(body?.action || "").trim().toLowerCase();
      if (action !== "create_venue_type") {
        return res.status(400).json({ ok: false, error: "Bad request", details: "Unsupported action" });
      }

      const name = normalizeText(body?.name, 80);
      if (!name) return res.status(400).json({ ok: false, error: "Bad request", details: "name is required" });

      const existing = await admin
        .from("venue_types")
        .select("id,name,slug,created_at")
        .ilike("name", name)
        .maybeSingle();
      if (existing.error && existing.error.code !== "PGRST116") {
        return res.status(500).json({ ok: false, error: "Failed to check venue type", details: existing.error.message });
      }
      if (existing.data) {
        const list = await loadVenueTypes(admin);
        if (!list.ok) return res.status(500).json({ ok: false, error: "Failed to load venue types", details: list.error });
        return res.status(200).json({ ok: true, venueType: existing.data, venueTypes: list.rows, existed: true });
      }

      const slug = slugifyTypeName(name);
      if (!slug) return res.status(400).json({ ok: false, error: "Bad request", details: "name is invalid" });

      const inserted = await admin
        .from("venue_types")
        .insert([{ name, slug }])
        .select("id,name,slug,created_at")
        .single();
      if (inserted.error) {
        return res.status(500).json({ ok: false, error: "Failed to create venue type", details: inserted.error.message });
      }

      const list = await loadVenueTypes(admin);
      if (!list.ok) return res.status(500).json({ ok: false, error: "Failed to load venue types", details: list.error });
      return res.status(200).json({ ok: true, venueType: inserted.data, venueTypes: list.rows, existed: false });
    }

    const venueId = String(req.query?.venueId || "").trim();
    const venueTypeList = await loadVenueTypes(admin);
    if (!venueTypeList.ok) {
      return res.status(500).json({ ok: false, error: "Failed to load venue types", details: venueTypeList.error });
    }

    if (!venueId) {
      const { data: venues, error } = await admin
        .from("venues")
        .select("id,name,slug,type,is_published,listed_publicly,guest_min,guest_max,location_label,city,short_description,about,updated_at,created_at")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: "Failed to load venues", details: error.message });

      const rows = venues || [];
      const ids = rows.map((row) => row.id).filter(Boolean);
      const heroResp =
        ids.length > 0
          ? await admin
              .from("venue_images")
              .select("venue_id")
              .eq("type", "hero")
              .in("venue_id", ids)
          : { data: [], error: null };
      if (heroResp.error) return res.status(500).json({ error: "Failed to load venue heroes", details: heroResp.error.message });

      const hasHero = new Set((heroResp.data || []).map((row) => row.venue_id).filter(Boolean));
      return res.status(200).json({
        rows: rows.map((row) => ({
          ...row,
          has_hero: hasHero.has(row.id),
        })),
        venueTypes: venueTypeList.rows,
      });
    }

    const venueResp = await admin
      .from("venues")
      .select("id,name,slug,type,location_label,address,city,postcode,guest_min,guest_max,short_description,description,about,website_url,facilities,is_published,listed_publicly,ai_tags,ai_suggested_search_terms,ai_draft_meta,ai_generated_at,created_at,updated_at")
      .eq("id", venueId)
      .maybeSingle();
    if (venueResp.error) return res.status(500).json({ ok: false, error: "Failed to load venue", details: venueResp.error.message });
    if (!venueResp.data) return res.status(404).json({ ok: false, error: "Venue not found" });

    const [imagesResp, linksResp] = await Promise.all([
      admin
        .from("venue_images")
        .select("id,venue_id,type,path,caption,sort_order,created_at")
        .eq("venue_id", venueId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("venue_suppliers_link")
        .select("supplier_id")
        .eq("venue_id", venueId),
    ]);

    if (imagesResp.error) return res.status(500).json({ ok: false, error: "Failed to load venue images", details: imagesResp.error.message });
    if (linksResp.error) return res.status(500).json({ ok: false, error: "Failed to load linked suppliers", details: linksResp.error.message });

    const suppliersResp = await admin
      .from("suppliers")
      .select("id,business_name,slug,is_published")
      .order("business_name", { ascending: true })
      .limit(1000);
    if (suppliersResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    }

    const profile = toVenueProfileDto(venueResp.data, imagesResp.data || [], SUPABASE_URL);
    return res.status(200).json({
      ok: true,
      venue: {
        ...profile,
        address: venueResp.data.address || null,
        city: venueResp.data.city || null,
        postcode: venueResp.data.postcode || null,
        type: venueResp.data.type || null,
        listedPublicly: !!(venueResp.data.is_published ?? venueResp.data.listed_publicly),
        aiTags: Array.isArray(venueResp.data.ai_tags) ? venueResp.data.ai_tags : [],
        aiSuggestedSearchTerms: Array.isArray(venueResp.data.ai_suggested_search_terms) ? venueResp.data.ai_suggested_search_terms : [],
        aiDraftMeta:
          venueResp.data.ai_draft_meta && typeof venueResp.data.ai_draft_meta === "object" && !Array.isArray(venueResp.data.ai_draft_meta)
            ? venueResp.data.ai_draft_meta
            : {},
        aiGeneratedAt: venueResp.data.ai_generated_at || null,
      },
      linkedSupplierIds: (linksResp.data || []).map((row) => row.supplier_id),
      suppliers: (suppliersResp.data || []).map((s) => ({
        id: s.id,
        name: s.business_name || "Supplier",
        slug: s.slug || null,
        listedPublicly: !!s.is_published,
      })),
      venueTypes: venueTypeList.rows,
    });
  } catch (err) {
    console.error("admin-venues crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
