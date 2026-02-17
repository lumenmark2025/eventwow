import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";

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
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const resp = await admin
      .from("suppliers")
      .select("id,business_name,slug,public_email,public_phone,location_label,listing_categories,short_description,about,onboarding_status,status,submitted_at,is_published,admin_notes,created_at,updated_at")
      .eq("onboarding_status", "pending_review")
      .eq("is_published", false)
      .order("submitted_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(500);

    if (resp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load pending suppliers", details: resp.error.message });
    }

    return res.status(200).json({ ok: true, rows: resp.data || [] });
  } catch (err) {
    console.error("admin/suppliers/pending crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
