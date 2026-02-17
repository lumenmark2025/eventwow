import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });
    }

    const id = String(req.query?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing enquiry id" });

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

    const enquiryResp = await admin
      .from("enquiries")
      .select(
        "id,status,match_source,event_type,enquiry_category_slug,event_date,start_time,event_postcode,guest_count,budget_range,budget_amount,budget_unit,venue_known,venue_name,venue_postcode,indoor_outdoor,power_available,dietary_requirements,contact_preference,urgency,message,message_quality_score,message_quality_flags,structured_answers,source_page,created_at,customers(full_name,email,phone),venues(name)"
      )
      .eq("id", id)
      .maybeSingle();

    if (enquiryResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load enquiry", details: enquiryResp.error.message });
    }
    if (!enquiryResp.data) {
      return res.status(404).json({ ok: false, error: "Enquiry not found" });
    }

    const invitesResp = await admin
      .from("enquiry_suppliers")
      .select("id,supplier_id,supplier_status,invited_at,viewed_at,responded_at,declined_reason,suppliers(business_name)")
      .eq("enquiry_id", id)
      .order("invited_at", { ascending: true });

    if (invitesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load invites", details: invitesResp.error.message });
    }

    return res.status(200).json({
      ok: true,
      enquiry: enquiryResp.data,
      invites: invitesResp.data || [],
    });
  } catch (err) {
    console.error("admin enquiry detail crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
