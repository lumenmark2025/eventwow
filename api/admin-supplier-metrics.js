import { createClient } from "@supabase/supabase-js";

function toStartOfDayIso(input) {
  const d = input ? new Date(`${input}T00:00:00.000Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function toEndOfDayIso(input) {
  const d = input ? new Date(`${input}T23:59:59.999Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function secondsBetween(a, b) {
  if (!a || !b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 1000);
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
    return { ok: true, admin: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) };
  }

  if (!headerKey || !adminKey || headerKey !== adminKey) {
    return { ok: false, status: 401, body: { ok: false, error: "Unauthorized" } };
  }
  return { ok: true, admin: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) };
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

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const from =
      toStartOfDayIso(typeof req.query?.from === "string" ? req.query.from : null) || toStartOfDayIso(defaultFrom.toISOString().slice(0, 10));
    const to =
      toEndOfDayIso(typeof req.query?.to === "string" ? req.query.to : null) || toEndOfDayIso(now.toISOString().slice(0, 10));

    const { data: quotes, error: quoteErr } = await auth.admin
      .from("quotes")
      .select("id,supplier_id,status,sent_at,accepted_at,declined_at,closed_at")
      .not("supplier_id", "is", null)
      .gte("sent_at", from)
      .lte("sent_at", to)
      .order("sent_at", { ascending: false });

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Failed to load quote metrics", details: quoteErr.message });
    }

    const supplierIds = [...new Set((quotes || []).map((q) => q.supplier_id).filter(Boolean))];
    const metricsMap = new Map();
    for (const supplierId of supplierIds) {
      metricsMap.set(supplierId, {
        supplier_id: supplierId,
        quotes_sent: 0,
        quotes_accepted: 0,
        quotes_declined: 0,
        quotes_closed: 0,
        acceptance_rate: 0,
        avg_time_to_accept_seconds: null,
        avg_time_to_decline_seconds: null,
        last_quote_sent_at: null,
      });
    }

    const acceptTimes = new Map();
    const declineTimes = new Map();

    for (const quote of quotes || []) {
      const row = metricsMap.get(quote.supplier_id);
      if (!row) continue;
      row.quotes_sent += 1;

      if (!row.last_quote_sent_at || new Date(quote.sent_at).getTime() > new Date(row.last_quote_sent_at).getTime()) {
        row.last_quote_sent_at = quote.sent_at;
      }

      if (quote.accepted_at) {
        row.quotes_accepted += 1;
        const seconds = secondsBetween(quote.sent_at, quote.accepted_at);
        if (seconds != null) {
          const arr = acceptTimes.get(quote.supplier_id) || [];
          arr.push(seconds);
          acceptTimes.set(quote.supplier_id, arr);
        }
      }

      if (quote.declined_at) {
        row.quotes_declined += 1;
        const seconds = secondsBetween(quote.sent_at, quote.declined_at);
        if (seconds != null) {
          const arr = declineTimes.get(quote.supplier_id) || [];
          arr.push(seconds);
          declineTimes.set(quote.supplier_id, arr);
        }
      }

      if (quote.closed_at) row.quotes_closed += 1;
    }

    const { data: suppliers, error: supErr } =
      supplierIds.length > 0
        ? await auth.admin.from("suppliers").select("id,business_name,slug").in("id", supplierIds)
        : { data: [], error: null };

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }

    const supplierMap = new Map((suppliers || []).map((s) => [s.id, s]));
    const rows = [...metricsMap.values()].map((row) => {
      const accepts = acceptTimes.get(row.supplier_id) || [];
      const declines = declineTimes.get(row.supplier_id) || [];
      const avgAccept = accepts.length > 0 ? Math.round(accepts.reduce((a, b) => a + b, 0) / accepts.length) : null;
      const avgDecline = declines.length > 0 ? Math.round(declines.reduce((a, b) => a + b, 0) / declines.length) : null;
      const acceptanceRate = row.quotes_sent > 0 ? Number((row.quotes_accepted / row.quotes_sent).toFixed(4)) : 0;
      return {
        ...row,
        acceptance_rate: acceptanceRate,
        avg_time_to_accept_seconds: avgAccept,
        avg_time_to_decline_seconds: avgDecline,
        supplier: supplierMap.get(row.supplier_id)
          ? {
              id: supplierMap.get(row.supplier_id).id,
              business_name: supplierMap.get(row.supplier_id).business_name,
              slug: supplierMap.get(row.supplier_id).slug,
            }
          : null,
      };
    });

    rows.sort((a, b) => b.quotes_sent - a.quotes_sent || b.acceptance_rate - a.acceptance_rate);

    return res.status(200).json({
      ok: true,
      from,
      to,
      rows,
    });
  } catch (err) {
    console.error("admin-supplier-metrics crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
