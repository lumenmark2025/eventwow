import { createClient } from "@supabase/supabase-js";

export async function requireAdmin(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const ADMIN_KEY = process.env.ADMIN_KEY;

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
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerKey = req.headers["x-admin-key"];

  if (!token) {
    if (headerKey && ADMIN_KEY && headerKey === ADMIN_KEY) {
      return { ok: true, userId: null };
    }
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, code: 401, error: "Unauthorized", details: userErr?.message || "Invalid session" };
  }

  const userId = userData.user.id;
  const { data: roleRow, error: roleErr } = await supabaseUser
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleErr) {
    return { ok: false, code: 500, error: "Role check failed", details: roleErr.message };
  }
  if (!roleRow) {
    return { ok: false, code: 403, error: "Forbidden (admin only)" };
  }

  return { ok: true, userId };
}

