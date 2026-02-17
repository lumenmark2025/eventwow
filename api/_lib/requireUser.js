import { createClient } from "@supabase/supabase-js";

export async function requireUser(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !ANON_KEY) {
    return {
      ok: false,
      code: 500,
      error: "Missing server env vars",
      details: {
        SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
      },
    };
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { ok: false, code: 401, error: "Unauthorized" };

  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, code: 401, error: "Unauthorized", details: userErr?.message || "Invalid session" };
  }

  return {
    ok: true,
    code: 200,
    userId: userData.user.id,
    userEmail: userData.user.email || null,
    emailConfirmedAt: userData.user.email_confirmed_at || null,
    user: userData.user,
  };
}
