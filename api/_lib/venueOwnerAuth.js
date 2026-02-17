import { createClient } from "@supabase/supabase-js";
import { requireUser } from "./requireUser.js";

export async function requireVenueOwner(req) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      ok: false,
      code: 500,
      error: "Missing server env vars",
      details: {
        SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
      },
    };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const userId = auth.userId;

  const profileResp = await admin
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["venue_owner"])
    .maybeSingle();

  if (!profileResp.error && profileResp.data?.role === "venue_owner") {
    return { ok: true, code: 200, userId, admin, supabaseUrl: SUPABASE_URL };
  }

  const roleResp = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "venue_owner")
    .maybeSingle();

  if (!roleResp.error && roleResp.data?.role === "venue_owner") {
    return { ok: true, code: 200, userId, admin, supabaseUrl: SUPABASE_URL };
  }

  return { ok: false, code: 403, error: "Forbidden (venue owner only)" };
}

export async function assertVenueOwnership(admin, userId, venueId) {
  const ownerResp = await admin
    .from("venue_owners_link")
    .select("id")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (ownerResp.error) {
    return { ok: false, code: 500, error: "Failed ownership check", details: ownerResp.error.message };
  }
  if (!ownerResp.data?.id) {
    return { ok: false, code: 403, error: "Forbidden (not venue owner)" };
  }
  return { ok: true, code: 200 };
}

