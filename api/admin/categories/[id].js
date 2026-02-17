import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";

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

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
    if (!["PATCH", "DELETE"].includes(req.method)) {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const id = String(req.query?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing id" });

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

    if (req.method === "DELETE") {
      const softDeleteResp = await admin
        .from("supplier_category_options")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,slug,label,display_name,short_description,is_featured,featured_order,is_active,created_at,updated_at")
        .maybeSingle();
      if (softDeleteResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to deactivate category", details: softDeleteResp.error.message });
      }
      if (!softDeleteResp.data) return res.status(404).json({ ok: false, error: "Category not found" });
      return res.status(200).json({ ok: true, row: toDto(softDeleteResp.data) });
    }

    const body = parseBody(req);
    const patch = { updated_at: new Date().toISOString() };

    if (Object.prototype.hasOwnProperty.call(body, "display_name")) {
      const displayName = String(body.display_name || "").trim().slice(0, 80);
      if (!displayName) return res.status(400).json({ ok: false, error: "Bad request", details: "display_name cannot be empty" });
      patch.display_name = displayName;
      patch.label = displayName;
    }
    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (!slug) return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid slug" });
      patch.slug = slug;
    }
    if (Object.prototype.hasOwnProperty.call(body, "short_description")) {
      const shortDescription = String(body.short_description || "").trim().slice(0, 180);
      if (!shortDescription) return res.status(400).json({ ok: false, error: "Bad request", details: "short_description cannot be empty" });
      patch.short_description = shortDescription;
    }
    if (Object.prototype.hasOwnProperty.call(body, "is_featured")) {
      patch.is_featured = !!body.is_featured;
    }
    if (Object.prototype.hasOwnProperty.call(body, "featured_order")) {
      patch.featured_order = Number.isFinite(Number(body.featured_order)) ? Math.trunc(Number(body.featured_order)) : 0;
    }
    if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
      patch.is_active = !!body.is_active;
    }

    const updateResp = await admin
      .from("supplier_category_options")
      .update(patch)
      .eq("id", id)
      .select("id,slug,label,display_name,short_description,is_featured,featured_order,is_active,created_at,updated_at")
      .maybeSingle();

    if (updateResp.error) {
      const details = String(updateResp.error.message || "");
      if (updateResp.error.code === "23505") {
        return res.status(409).json({ ok: false, error: "Slug already exists", details });
      }
      return res.status(500).json({ ok: false, error: "Failed to update category", details });
    }
    if (!updateResp.data) return res.status(404).json({ ok: false, error: "Category not found" });

    return res.status(200).json({ ok: true, row: toDto(updateResp.data) });
  } catch (err) {
    console.error("admin/categories/[id] crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

