import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin-create-supplier
 * Body (preferred): { business_name, public_email, slug?, base_city?, base_postcode?, website?, created_by_user_id? }
 * Also accepts legacy aliases: { name, email }
 *
 * Secured: requires Authorization: Bearer <user_jwt> and admin role in public.user_roles
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: "Missing server env vars",
        details: {
          SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
        },
      });
    }

    // --- Verify caller is admin (using caller's JWT) ---
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res
        .status(401)
        .json({ error: "Missing Authorization Bearer token" });
    }

    // Client using anon permissions but authenticated as the user
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    // Validate token
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return res
        .status(401)
        .json({ error: "Invalid session", details: userErr?.message });
    }

    const userId = userData.user.id;

    // Check admin role
    const { data: roleRow, error: roleErr } = await supabaseUser
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr) {
      return res
        .status(500)
        .json({ error: "Role check failed", details: roleErr.message });
    }
    if (!roleRow) {
      return res.status(403).json({ error: "Forbidden (admin only)" });
    }

    // --- Service role client for privileged operations ---
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ---- Parse body safely ----
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }
    const b = body || {};

    // ---- Normalize inputs to your DB schema ----
    const business_name = String(
      b.business_name ?? b.name ?? b.businessName ?? ""
    ).trim();

    const public_email = String(
      b.public_email ?? b.email ?? b.login_email ?? b.loginEmail ?? ""
    ).trim();

    const slug = (b.slug ?? "").toString().trim() || null;
    const base_city = (b.base_city ?? "").toString().trim() || null;
    const base_postcode = (b.base_postcode ?? "").toString().trim() || null;
    const website = (b.website ?? "").toString().trim() || null;

    // If you store who created the supplier
    const created_by_user_id = b.created_by_user_id ?? null;

    if (!business_name || !public_email) {
      return res.status(400).json({
        error: "Missing required fields: business_name, public_email",
        receivedKeys: Object.keys(b),
      });
    }

    // 1) Create auth user (using public_email as login for now)
    const { data: createdUser, error: createUserErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: public_email,
        email_confirm: true,
      });

    if (createUserErr) {
      return res.status(400).json({
        error: "Failed to create auth user",
        details: createUserErr.message,
      });
    }

    const authUserId = createdUser.user.id;

    // 2) Insert supplier row linked to auth user
    // IMPORTANT: only include columns that exist in your suppliers table.
    const insertPayload = {
      business_name,
      public_email,
      auth_user_id: authUserId,
    };

    if (slug) insertPayload.slug = slug;
    if (base_city) insertPayload.base_city = base_city;
    if (base_postcode) insertPayload.base_postcode = base_postcode;
    if (website) insertPayload.website = website;
    if (created_by_user_id) insertPayload.created_by_user_id = created_by_user_id;

    const { data: supplierRow, error: supplierErr } = await supabaseAdmin
      .from("suppliers")
      .insert([insertPayload])
      .select("*")
      .single();

    if (supplierErr) {
      // Roll back auth user if supplier insert fails
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return res.status(400).json({
        error: "Failed to create supplier row",
        details: supplierErr.message,
        hint: "Check column names and NOT NULL constraints on public.suppliers",
      });
    }

    return res.status(200).json({
      ok: true,
      supplier: supplierRow,
      auth_user_id: authUserId,
    });
  } catch (err) {
    console.error("admin-create-supplier crashed:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      details: String(err?.message || err),
    });
  }
}
