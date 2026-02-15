import { createClient } from "@supabase/supabase-js";

export async function resolveAuthMe(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return {
      ok: false,
      code: 500,
      error: "Missing server env vars",
      details: {
        SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
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

  const userId = userData.user.id;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const profileResp = await admin.from("user_profiles").select("role").eq("user_id", userId).maybeSingle();
  let role = profileResp.error ? null : String(profileResp.data?.role || "").toLowerCase() || null;

  if (!role) {
    const legacyAdmin = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!legacyAdmin.error && legacyAdmin.data?.role) role = "admin";
  }
  if (!role) {
    const supplierResp = await admin.from("suppliers").select("id").eq("auth_user_id", userId).maybeSingle();
    if (!supplierResp.error && supplierResp.data?.id) role = "supplier";
  }
  if (!role) {
    const customerResp = await admin.from("customers").select("id").eq("user_id", userId).maybeSingle();
    if (!customerResp.error && customerResp.data?.id) role = "customer";
  }
  if (!role) role = "customer";

  if (!profileResp.error && !profileResp.data?.role && ["admin", "supplier", "customer", "venue"].includes(role)) {
    await admin.from("user_profiles").upsert(
      {
        user_id: userId,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  const [customerResp, supplierResp] = await Promise.all([
    admin.from("customers").select("id").eq("user_id", userId).maybeSingle(),
    admin.from("suppliers").select("id").eq("auth_user_id", userId).maybeSingle(),
  ]);

  return {
    ok: true,
    code: 200,
    data: {
      user_id: userId,
      role,
      customer_id: customerResp.error ? null : customerResp.data?.id || null,
      supplier_id: supplierResp.error ? null : supplierResp.data?.id || null,
      venue_id: null,
    },
    supabaseUrl: SUPABASE_URL,
    serviceKey: SERVICE_KEY,
  };
}
