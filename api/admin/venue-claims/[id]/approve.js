import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import { publicSiteUrl } from "../../../_lib/venueClaims.js";
import { sendEmail } from "../../../_lib/email.js";
import { venueClaimApprovedEmail } from "../../../_lib/emailTemplates.js";

async function ensureUserForEmail(admin, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, error: "Missing requester email" };

  const existingResp = await admin.rpc("find_auth_user_by_email", { p_email: normalizedEmail });
  if (existingResp.error) {
    return { ok: false, error: `Failed to resolve auth user by email: ${existingResp.error.message}` };
  }
  if (existingResp.data) {
    return { ok: true, userId: existingResp.data, created: false };
  }

  const createResp = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: crypto.randomBytes(24).toString("hex"),
    email_confirm: true,
  });
  if (createResp.error || !createResp.data?.user?.id) {
    return { ok: false, error: createResp.error?.message || "Failed to create auth user" };
  }
  return { ok: true, userId: createResp.data.user.id, created: true };
}

async function ensureVenueOwnerRole(admin, userId) {
  const existingRoleResp = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "venue_owner")
    .maybeSingle();
  if (existingRoleResp.error) {
    return { ok: false, error: `Failed to check user role: ${existingRoleResp.error.message}` };
  }
  if (!existingRoleResp.data) {
    const insResp = await admin.from("user_roles").insert({ user_id: userId, role: "venue_owner" });
    if (insResp.error) {
      return { ok: false, error: `Failed to assign venue_owner role: ${insResp.error.message}` };
    }
  }

  const profileResp = await admin.from("user_profiles").select("role").eq("user_id", userId).maybeSingle();
  if (!profileResp.error) {
    const currentRole = String(profileResp.data?.role || "").toLowerCase();
    const shouldSetVenueOwner = !currentRole || currentRole === "customer" || currentRole === "venue";
    if (shouldSetVenueOwner) {
      const upsertResp = await admin.from("user_profiles").upsert(
        {
          user_id: userId,
          role: "venue_owner",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (upsertResp.error) {
        return { ok: false, error: `Failed to update user profile role: ${upsertResp.error.message}` };
      }
    }
  }

  return { ok: true };
}

async function createMagicLink(admin, email) {
  const redirectTo = `${publicSiteUrl()}/auth/callback`;
  const linkResp = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: String(email || "").trim().toLowerCase(),
    options: { redirectTo },
  });
  if (linkResp.error) return { ok: false, error: linkResp.error.message };
  const actionLink = linkResp.data?.properties?.action_link || linkResp.data?.action_link || null;
  return { ok: true, actionLink: actionLink || `${publicSiteUrl()}/login` };
}

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
      .select("id,venue_id,requester_email,requester_name,role_at_venue,status,token_expires_at,venues(name,slug)")
      .eq("id", claimId)
      .maybeSingle();

    if (claimResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load claim", details: claimResp.error.message });
    }
    const claim = claimResp.data;
    if (!claim) return res.status(404).json({ ok: false, error: "Claim not found" });
    if (claim.status !== "pending") {
      return res.status(400).json({ ok: false, error: "Claim is not pending" });
    }

    const isExpired = !claim.token_expires_at || new Date(claim.token_expires_at).getTime() < Date.now();
    if (isExpired) {
      await admin
        .from("venue_claim_requests")
        .update({
          status: "expired",
          reviewed_at: new Date().toISOString(),
          reviewed_by_user_id: auth.userId,
        })
        .eq("id", claim.id);
      return res.status(400).json({ ok: false, error: "Claim token expired" });
    }

    const ensureUser = await ensureUserForEmail(admin, claim.requester_email);
    if (!ensureUser.ok) return res.status(500).json({ ok: false, error: ensureUser.error });

    const ensureRole = await ensureVenueOwnerRole(admin, ensureUser.userId);
    if (!ensureRole.ok) return res.status(500).json({ ok: false, error: ensureRole.error });

    const ownerLinkResp = await admin
      .from("venue_owners_link")
      .insert({
        venue_id: claim.venue_id,
        user_id: ensureUser.userId,
        role_at_venue: claim.role_at_venue || null,
      })
      .select("id")
      .maybeSingle();
    if (ownerLinkResp.error && ownerLinkResp.error.code !== "23505") {
      return res.status(500).json({ ok: false, error: "Failed to link venue owner", details: ownerLinkResp.error.message });
    }

    const claimUpdateResp = await admin
      .from("venue_claim_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: auth.userId,
        approved_user_id: ensureUser.userId,
      })
      .eq("id", claim.id)
      .select("id")
      .single();
    if (claimUpdateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to mark claim approved", details: claimUpdateResp.error.message });
    }

    const magic = await createMagicLink(admin, claim.requester_email);
    const template = venueClaimApprovedEmail({
      requesterName: claim.requester_name,
      venueName: claim.venues?.name,
      loginUrl: magic.ok ? magic.actionLink : `${publicSiteUrl()}/login`,
    });
    await sendEmail({
      to: claim.requester_email,
      subject: template.subject,
      html: template.html,
      eventKey: "venue_claim_approved",
    });

    return res.status(200).json({
      ok: true,
      claim_id: claim.id,
      approved_user_id: ensureUser.userId,
      user_created: ensureUser.created,
    });
  } catch (err) {
    console.error("admin venue-claims approve crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
