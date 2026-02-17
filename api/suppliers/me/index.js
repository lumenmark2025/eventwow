import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../../_lib/requireUser.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireUser(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const resp = await admin
      .from("suppliers")
      .select("id,auth_user_id,slug,business_name,public_email,public_phone,location_label,listing_categories,short_description,about,description,website_url,instagram_url,onboarding_status,status,submitted_at,approved_at,rejected_at,admin_notes,is_published,credits_balance,created_at,updated_at")
      .eq("auth_user_id", auth.userId)
      .maybeSingle();

    if (resp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier", details: resp.error.message });
    }
    if (!resp.data) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    let supplier = resp.data;
    const onboardingStatus = String(supplier.onboarding_status || "").toLowerCase();
    if (auth.emailConfirmedAt && onboardingStatus === "awaiting_email_verification") {
      const update = await admin
        .from("suppliers")
        .update({ onboarding_status: "profile_incomplete", updated_at: new Date().toISOString() })
        .eq("id", supplier.id)
        .select("id,auth_user_id,slug,business_name,public_email,public_phone,location_label,listing_categories,short_description,about,description,website_url,instagram_url,onboarding_status,status,submitted_at,approved_at,rejected_at,admin_notes,is_published,credits_balance,created_at,updated_at")
        .single();
      if (!update.error && update.data) supplier = update.data;
    }

    return res.status(200).json({ ok: true, supplier });
  } catch (err) {
    console.error("suppliers/me crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
