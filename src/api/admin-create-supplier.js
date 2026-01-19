const { createClient } = require("@supabase/supabase-js");

/**
 * Vercel Serverless Function
 * POST /api/admin-create-supplier
 *
 * Creates:
 * 1) Supabase Auth user (supplier)
 * 2) Supplier row in public.suppliers linked via auth_user_id
 *
 * Security:
 * - Requires a valid Supabase access token (Authorization: Bearer <jwt>)
 * - Caller must have role=admin in public.user_roles
 */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return res.status(500).json({
        error:
          "Missing server env vars. Required: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    // 1) Verify caller is an admin
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const callerId = userData.user.id;

    const { data: roleRow, error: roleErr } = await supabaseUser
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr) return res.status(500).json({ error: roleErr.message });
    if (!roleRow) return res.status(403).json({ error: "Admin access required" });

    // 2) Create supplier auth user (service role)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const email = String(body?.public_email || "").trim().toLowerCase();
    const business_name = String(body?.business_name || "").trim();
    const slug = String(body?.slug || "").trim();

    if (!email) return res.status(400).json({ error: "public_email is required" });
    if (!business_name) return res.status(400).json({ error: "business_name is required" });
    if (!slug) return res.status(400).json({ error: "slug is required" });

    const base_city = body?.base_city ?? null;
    const base_postcode = body?.base_postcode ?? null;
    const created_by_user_id = body?.created_by_user_id || callerId;

    const { data: createdUser, error: createUserErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (createUserErr || !createdUser?.user) {
      return res.status(400).json({
        error:
          createUserErr?.message ||
          "Failed to create auth user (is the email already registered?).",
      });
    }

    const auth_user_id = createdUser.user.id;

    // 3) Create supplier row linked to auth user
    const { data: supplierRow, error: supplierErr } = await supabaseAdmin
      .from("suppliers")
      .insert({
        business_name,
        slug,
        base_city,
        base_postcode,
        public_email: email,
        auth_user_id,
        created_by_user_id,
        updated_by_user_id: created_by_user_id,
        is_published: true,
        is_verified: false,
        country_code: "GB",
      })
      .select("id,business_name,slug,public_email,auth_user_id")
      .single();

    if (supplierErr) {
      // best-effort rollback
      await supabaseAdmin.auth.admin.deleteUser(auth_user_id);
      return res.status(400).json({ error: supplierErr.message });
    }

    return res.status(200).json({ supplier: supplierRow });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
};
