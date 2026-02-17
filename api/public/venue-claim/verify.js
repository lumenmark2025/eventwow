import { createClient } from "@supabase/supabase-js";
import { hashClaimToken } from "../../_lib/venueClaims.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const token = String(req.query?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing token" });

    const tokenHash = hashClaimToken(token);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const claimResp = await admin
      .from("venue_claim_requests")
      .select("id,status,token_expires_at,requester_email,venues(id,name,slug)")
      .eq("token_hash", tokenHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (claimResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to verify token", details: claimResp.error.message });
    }
    const claim = claimResp.data;
    if (!claim?.id) return res.status(404).json({ ok: false, error: "Invalid or expired token" });

    const expired = !claim.token_expires_at || new Date(claim.token_expires_at).getTime() < Date.now();
    if (expired || claim.status !== "pending") {
      return res.status(400).json({ ok: false, error: "Claim is not pending", status: claim.status || "expired" });
    }

    return res.status(200).json({
      ok: true,
      claim_request_id: claim.id,
      requester_email: claim.requester_email || null,
      venue: claim.venues
        ? {
            id: claim.venues.id,
            name: claim.venues.name,
            slug: claim.venues.slug,
          }
        : null,
      status: claim.status,
    });
  } catch (err) {
    console.error("public venue-claim verify crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

