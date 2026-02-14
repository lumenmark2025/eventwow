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

    const reviewId = String(req.query?.id || "").trim();
    if (!reviewId) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing review id" });

    const body = parseBody(req);
    const action = String(body?.action || "").trim().toLowerCase();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    if (action === "approve") {
      const { error } = await admin.from("supplier_reviews").update({ is_approved: true }).eq("id", reviewId);
      if (error) return res.status(500).json({ ok: false, error: "Failed to approve review", details: error.message });
      return res.status(200).json({ ok: true, status: "approved" });
    }

    if (action === "reject") {
      const { error } = await admin.from("supplier_reviews").delete().eq("id", reviewId);
      if (error) return res.status(500).json({ ok: false, error: "Failed to reject review", details: error.message });
      return res.status(200).json({ ok: true, status: "rejected" });
    }

    return res.status(400).json({ ok: false, error: "Bad request", details: "action must be 'approve' or 'reject'" });
  } catch (err) {
    console.error("admin/reviews PATCH crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
