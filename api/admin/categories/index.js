import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const v = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (["false", "0", "no", "off"].includes(v)) return false;
  return fallback;
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function toDto(row) {
  return {
    id: row.id,
    slug: row.slug,
    display_name: row.display_name || row.label || "",
    short_description: row.short_description || "",
    is_featured: !!row.is_featured,
    featured_order: Number(row.featured_order || 0),
    is_active: row.is_active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export default async function handler(req, res) {
  try {
    if (!["GET", "POST"].includes(req.method)) {
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

    if (req.method === "GET") {
      const q = String(req.query?.q || "").trim().slice(0, 80);
      const activeOnly = toBool(req.query?.activeOnly, false);

      let query = admin
        .from("supplier_category_options")
        .select("id,slug,label,display_name,short_description,is_featured,featured_order,is_active,created_at,updated_at")
        .order("featured_order", { ascending: true })
        .order("display_name", { ascending: true })
        .order("label", { ascending: true });

      if (activeOnly) query = query.eq("is_active", true);
      if (q) {
        const like = `%${q.replace(/[%_]/g, " ").trim()}%`;
        query = query.or(`display_name.ilike.${like},label.ilike.${like},slug.ilike.${like}`);
      }

      const { data, error } = await query.limit(500);
      if (error) return res.status(500).json({ ok: false, error: "Failed to load categories", details: error.message });
      return res.status(200).json({ ok: true, rows: (data || []).map(toDto) });
    }

    const body = parseBody(req);
    const displayName = String(body?.display_name || "").trim().slice(0, 80);
    const slugInput = String(body?.slug || "").trim();
    const shortDescription = String(body?.short_description || "").trim().slice(0, 180);
    const isFeatured = !!body?.is_featured;
    const featuredOrder = Number.isFinite(Number(body?.featured_order)) ? Math.trunc(Number(body.featured_order)) : 0;
    const isActive = body?.is_active === undefined ? true : !!body.is_active;

    if (!displayName) return res.status(400).json({ ok: false, error: "Bad request", details: "display_name is required" });
    if (!shortDescription) return res.status(400).json({ ok: false, error: "Bad request", details: "short_description is required" });

    const slug = normalizeSlug(slugInput || displayName);
    if (!slug) return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid slug" });

    const nowIso = new Date().toISOString();
    const insertResp = await admin
      .from("supplier_category_options")
      .insert({
        slug,
        label: displayName,
        display_name: displayName,
        short_description: shortDescription,
        is_featured: isFeatured,
        featured_order: featuredOrder,
        is_active: isActive,
        updated_at: nowIso,
      })
      .select("id,slug,label,display_name,short_description,is_featured,featured_order,is_active,created_at,updated_at")
      .single();

    if (insertResp.error) {
      const details = String(insertResp.error.message || "");
      if (insertResp.error.code === "23505") {
        return res.status(409).json({ ok: false, error: "Slug already exists", details });
      }
      return res.status(500).json({ ok: false, error: "Failed to create category", details });
    }

    return res.status(200).json({ ok: true, row: toDto(insertResp.data) });
  } catch (err) {
    console.error("admin/categories crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

