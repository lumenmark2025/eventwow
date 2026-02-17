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

export default async function handler(req, res) {
  try {
    if (req.method !== "PATCH") {
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

    const body = parseBody(req);
    const orderedIdsRaw = Array.isArray(body?.ordered_ids) ? body.ordered_ids : [];
    const orderedIds = orderedIdsRaw.map((id) => String(id || "").trim()).filter(Boolean);
    if (orderedIds.length === 0) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "ordered_ids is required" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();

    for (let i = 0; i < orderedIds.length; i += 1) {
      const id = orderedIds[i];
      const order = i + 1;
      const updateResp = await admin
        .from("supplier_category_options")
        .update({ is_featured: true, featured_order: order, updated_at: nowIso })
        .eq("id", id);
      if (updateResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to reorder featured categories", details: updateResp.error.message });
      }
    }

    return res.status(200).json({ ok: true, ordered_ids: orderedIds });
  } catch (err) {
    console.error("admin/categories/reorder-featured crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

