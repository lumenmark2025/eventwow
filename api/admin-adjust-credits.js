import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin-adjust-credits
 * Body: { supplier_id: uuid, delta: number }
 *
 * Admin only (shared secret):
 * - requires X-Admin-Key header matching process.env.ADMIN_KEY
 *
 * Applies:
 * - credits_balance = max(0, credits_balance + delta)
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_KEY = process.env.ADMIN_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    // --- Verify caller is admin (Bearer token OR shared admin key) ---
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const headerKey = req.headers["x-admin-key"];

    let createdByUserId = null;
    let createdByName = null;
    if (token) {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });

      const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
      if (userErr || !userData?.user) {
        return res.status(401).json({ ok: false, error: "Unauthorized", details: userErr?.message });
      }

      const userId = userData.user.id;
      createdByUserId = userId;
      const meta = userData.user.user_metadata || {};
      const firstName =
        typeof meta.first_name === "string" && meta.first_name.trim()
          ? meta.first_name.trim()
          : null;
      const email = typeof userData.user.email === "string" ? userData.user.email : null;
      const emailPrefix = email && email.includes("@") ? email.split("@")[0] : null;
      createdByName = firstName || emailPrefix || "Admin";
      const { data: roleRow, error: roleErr } = await supabaseUser
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (roleErr) {
        return res.status(500).json({ ok: false, error: "Role check failed", details: roleErr.message });
      }
      if (!roleRow) {
        return res.status(403).json({ ok: false, error: "Forbidden (admin only)" });
      }
    } else {
      if (!headerKey || !ADMIN_KEY || headerKey !== ADMIN_KEY) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        return res.status(400).json({ ok: false, error: "Invalid JSON body" });
      }
    }

    const supplier_id = body?.supplier_id;
    const deltaRaw = body?.delta ?? body?.change;
    const reasonRaw = body?.reason;
    const delta = Number(deltaRaw);
    const reason =
      typeof reasonRaw === "string" && reasonRaw.trim()
        ? reasonRaw.trim()
        : "Admin adjustment";

    if (!supplier_id || !UUID_RE.test(String(supplier_id))) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid supplier_id" });
    }
    if (!Number.isFinite(delta)) {
      return res.status(400).json({
        ok: false,
        error: "Bad request",
        details: "delta/change must be a number",
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: supplier, error: supErr } = await supabaseAdmin
      .from("suppliers")
      .select("id, credits_balance")
      .eq("id", supplier_id)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const current = Number(supplier.credits_balance ?? 0);
    const next = Math.max(0, current + delta);
    const appliedDelta = next - current;

    const { data: ledgerResult, error: updErr } = await supabaseAdmin.rpc("apply_credit_delta", {
      p_supplier_id: supplier_id,
      p_delta: appliedDelta,
      p_reason: "admin_adjust",
      p_note: reason,
      p_related_type: "admin",
      p_related_id: null,
      p_created_by_user: createdByUserId,
    });

    if (updErr) {
      return res.status(500).json({ ok: false, error: "Failed to update credits", details: updErr.message });
    }

    const updated = Array.isArray(ledgerResult) ? ledgerResult[0] : null;

    const { error: txnErr } = await supabaseAdmin.from("credit_transactions").insert([
      {
        supplier_id,
        change: appliedDelta,
        reason,
        created_by_user_id: createdByUserId,
        created_by_name: createdByName,
      },
    ]);

    if (txnErr) {
      return res.status(500).json({ ok: false, error: "Failed to write credit transaction", details: txnErr.message });
    }

    return res.status(200).json({
      ok: true,
      supplier_id: updated?.supplier_id ?? supplier_id,
      credits_balance: updated?.credits_balance ?? next,
    });
  } catch (err) {
    console.error("admin-adjust-credits crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
