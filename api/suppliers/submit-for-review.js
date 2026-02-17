import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../_lib/requireUser.js";

function hasMin(value, min) {
  return String(value || "").trim().length >= min;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const auth = await requireUser(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });
    if (!auth.emailConfirmedAt) {
      return res.status(403).json({ ok: false, error: "Verify your email before submitting for review" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ ok: false, error: "Missing server env vars" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const resp = await admin
      .from("suppliers")
      .select("id,business_name,public_email,public_phone,location_label,listing_categories,short_description,about,onboarding_status,status,is_published")
      .eq("auth_user_id", auth.userId)
      .maybeSingle();

    if (resp.error) return res.status(500).json({ ok: false, error: "Failed to load supplier", details: resp.error.message });
    if (!resp.data) return res.status(404).json({ ok: false, error: "Supplier not found" });

    const s = resp.data;
    const missing = [];
    if (!hasMin(s.business_name, 2)) missing.push("business name");
    if (!hasMin(s.public_email, 5)) missing.push("contact email");
    if (!hasMin(s.public_phone, 6)) missing.push("phone");
    if (!hasMin(s.location_label, 3)) missing.push("service area");
    if (!Array.isArray(s.listing_categories) || s.listing_categories.length === 0) missing.push("categories");
    if (!hasMin(s.short_description, 30)) missing.push("short description");
    if (!hasMin(s.about, 120)) missing.push("about");

    if (missing.length > 0) {
      return res.status(400).json({ ok: false, error: `Profile incomplete: ${missing.join(", ")}` });
    }

    const update = await admin
      .from("suppliers")
      .update({
        onboarding_status: "pending_review",
        status: "pending_review",
        submitted_at: new Date().toISOString(),
        is_published: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id)
      .eq("auth_user_id", auth.userId)
      .select("id,slug,business_name,onboarding_status,status,submitted_at,is_published")
      .single();

    if (update.error) return res.status(500).json({ ok: false, error: "Failed to submit for review", details: update.error.message });

    return res.status(200).json({ ok: true, supplier: update.data });
  } catch (err) {
    console.error("suppliers/submit-for-review crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
