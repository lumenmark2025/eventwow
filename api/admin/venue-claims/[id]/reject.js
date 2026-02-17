import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import { sendEmail } from "../../../_lib/email.js";
import { publicSiteUrl } from "../../../_lib/venueClaims.js";
import { venueClaimRejectedEmail } from "../../../_lib/emailTemplates.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const claimId = String(req.query?.id || "").trim();
    if (!claimId) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing claim id" });

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
    const claimResp = await admin
      .from("venue_claim_requests")
      .select("id,status,requester_email,requester_name,venues(name)")
      .eq("id", claimId)
      .maybeSingle();

    if (claimResp.error) return res.status(500).json({ ok: false, error: "Failed to load claim", details: claimResp.error.message });
    if (!claimResp.data) return res.status(404).json({ ok: false, error: "Claim not found" });
    if (claimResp.data.status !== "pending") return res.status(400).json({ ok: false, error: "Claim is not pending" });

    const updateResp = await admin
      .from("venue_claim_requests")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: auth.userId,
      })
      .eq("id", claimId)
      .select("id")
      .single();
    if (updateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to reject claim", details: updateResp.error.message });
    }

    const template = venueClaimRejectedEmail({
      requesterName: claimResp.data.requester_name,
      venueName: claimResp.data.venues?.name,
      contactUrl: `${publicSiteUrl()}/contact`,
    });
    await sendEmail({
      to: claimResp.data.requester_email,
      subject: template.subject,
      html: template.html,
      eventKey: "venue_claim_rejected",
    });

    return res.status(200).json({ ok: true, claim_id: claimId, status: "rejected" });
  } catch (err) {
    console.error("admin venue-claims reject crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

