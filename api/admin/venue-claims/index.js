import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";

function normalizeStatus(value) {
  const v = String(value || "pending").trim().toLowerCase();
  if (["pending", "approved", "rejected", "expired"].includes(v)) return v;
  if (v === "all") return "all";
  return "pending";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const status = normalizeStatus(req.query?.status);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let query = admin
      .from("venue_claim_requests")
      .select("id,venue_id,requester_email,requester_name,role_at_venue,message,status,created_at,reviewed_at,reviewed_by_user_id,approved_user_id,token_expires_at,venues(name,slug)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to load venue claims", details: error.message });
    }

    const rows = (data || []).map((row) => ({
      id: row.id,
      venue_id: row.venue_id,
      venue_name: row.venues?.name || "Venue",
      venue_slug: row.venues?.slug || null,
      requester_email: row.requester_email,
      requester_name: row.requester_name,
      role_at_venue: row.role_at_venue || null,
      message: row.message || null,
      status: row.status,
      created_at: row.created_at || null,
      reviewed_at: row.reviewed_at || null,
      reviewed_by_user_id: row.reviewed_by_user_id || null,
      approved_user_id: row.approved_user_id || null,
      token_expires_at: row.token_expires_at || null,
    }));

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    console.error("admin venue-claims list crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

