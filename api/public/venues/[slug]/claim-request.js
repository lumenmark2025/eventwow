import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../../../_lib/email.js";
import { claimTokenExpiryIso, createClaimToken, hashClaimToken, publicSiteUrl } from "../../../_lib/venueClaims.js";
import { venueClaimRequestLinkEmail } from "../../../_lib/emailTemplates.js";

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

function genericSuccess(res) {
  return res.status(200).json({
    ok: true,
    message: "Thanks - if this email matches a claim request, you'll receive a link shortly.",
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

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

    const slug = String(req.query?.slug || "").trim().toLowerCase();
    const body = parseBody(req);
    const requesterName = String(body?.requester_name || "").trim().slice(0, 120);
    const requesterEmail = String(body?.requester_email || "").trim().toLowerCase().slice(0, 320);
    const roleAtVenue = String(body?.role_at_venue || "").trim().slice(0, 120);
    const message = String(body?.message || "").trim().slice(0, 2000);

    if (!slug) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing venue slug" });
    if (!requesterName) return res.status(400).json({ ok: false, error: "Bad request", details: "Name is required" });
    if (!requesterEmail || !requesterEmail.includes("@")) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Valid email is required" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const venueResp = await admin
      .from("venues")
      .select("id,name,slug,is_published")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (venueResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to submit claim request", details: venueResp.error.message });
    }
    if (!venueResp.data?.id) {
      return genericSuccess(res);
    }

    const token = createClaimToken();
    const tokenHash = hashClaimToken(token);
    const tokenExpiresAt = claimTokenExpiryIso(7);

    const insertResp = await admin
      .from("venue_claim_requests")
      .insert({
        venue_id: venueResp.data.id,
        requester_email: requesterEmail,
        requester_name: requesterName,
        role_at_venue: roleAtVenue || null,
        message: message || null,
        status: "pending",
        token_hash: tokenHash,
        token_expires_at: tokenExpiresAt,
      })
      .select("id")
      .single();

    if (insertResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to submit claim request", details: insertResp.error.message });
    }

    const claimUrl = `${publicSiteUrl()}/claim/venue?token=${encodeURIComponent(token)}`;
    const template = venueClaimRequestLinkEmail({
      requesterName,
      venueName: venueResp.data.name,
      claimUrl,
    });

    await sendEmail({
      to: requesterEmail,
      subject: template.subject,
      html: template.html,
      eventKey: "venue_claim_request_link",
    });

    return genericSuccess(res);
  } catch (err) {
    console.error("public venue claim-request crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

