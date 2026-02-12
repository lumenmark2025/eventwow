import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseDateStart(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDateEnd(value) {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function requireAdmin(req, { supabaseUrl, anonKey, serviceKey, adminKey }) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerKey = req.headers["x-admin-key"];

  if (token) {
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return { ok: false, status: 401, body: { ok: false, error: "Unauthorized", details: userErr?.message } };
    }
    const { data: roleRow, error: roleErr } = await supabaseUser
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) {
      return { ok: false, status: 500, body: { ok: false, error: "Role check failed", details: roleErr.message } };
    }
    if (!roleRow) {
      return { ok: false, status: 403, body: { ok: false, error: "Forbidden (admin only)" } };
    }
    return {
      ok: true,
      adminUserId: userData.user.id,
      admin: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }),
    };
  }

  if (!headerKey || !adminKey || headerKey !== adminKey) {
    return { ok: false, status: 401, body: { ok: false, error: "Unauthorized" } };
  }

  return { ok: true, adminUserId: null, admin: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_KEY = process.env.ADMIN_KEY;

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const auth = await requireAdmin(req, {
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      serviceKey: SERVICE_KEY,
      adminKey: ADMIN_KEY,
    });
    if (!auth.ok) return res.status(auth.status).json(auth.body);

    const supplierId = typeof req.query?.supplierId === "string" ? req.query.supplierId.trim() : "";
    const reason = typeof req.query?.reason === "string" ? req.query.reason.trim() : "";
    const from = parseDateStart(typeof req.query?.from === "string" ? req.query.from : null);
    const to = parseDateEnd(typeof req.query?.to === "string" ? req.query.to : null);
    const limitRaw = Number(req.query?.limit ?? 50);
    const offsetRaw = Number(req.query?.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    if (supplierId && !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid supplierId" });
    }

    let query = auth.admin
      .from("credits_ledger")
      .select("id,supplier_id,delta,balance_after,reason,note,related_type,related_id,created_at,created_by_user", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (supplierId) query = query.eq("supplier_id", supplierId);
    if (reason) query = query.eq("reason", reason);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data: rows, error: rowsErr, count } = await query;
    if (rowsErr) {
      return res.status(500).json({ ok: false, error: "Failed to load credits ledger", details: rowsErr.message });
    }

    const supplierIds = [...new Set((rows || []).map((r) => r.supplier_id).filter(Boolean))];
    let supplierMap = new Map();
    if (supplierIds.length > 0) {
      const { data: suppliers, error: supErr } = await auth.admin
        .from("suppliers")
        .select("id,business_name,slug")
        .in("id", supplierIds);
      if (supErr) {
        return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
      }
      supplierMap = new Map((suppliers || []).map((s) => [s.id, s]));
    }

    const hydrated = (rows || []).map((row) => ({
      ...row,
      supplier: supplierMap.get(row.supplier_id)
        ? {
            id: supplierMap.get(row.supplier_id).id,
            business_name: supplierMap.get(row.supplier_id).business_name,
            slug: supplierMap.get(row.supplier_id).slug,
          }
        : null,
    }));

    return res.status(200).json({
      ok: true,
      rows: hydrated,
      totalCount: Number(count || 0),
      limit,
      offset,
    });
  } catch (err) {
    console.error("admin-credits-ledger crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
