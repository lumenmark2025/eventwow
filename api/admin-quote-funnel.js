import { createClient } from "@supabase/supabase-js";

function toStartOfDayIso(input) {
  const d = input ? new Date(`${input}T00:00:00.000Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function toEndOfDayIso(input) {
  const d = input ? new Date(`${input}T23:59:59.999Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function dayKey(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function secondsBetween(a, b) {
  if (!a || !b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
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
      .select("id,status,sent_at,accepted_at,declined_at,closed_at")
      .gte("sent_at", from)
      .lte("sent_at", to);

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Failed to load quote funnel", details: quoteErr.message });
    }

    const totals = {
      sent: 0,
      accepted: 0,
      declined: 0,
      closed: 0,
      acceptance_rate: 0,
      avg_time_to_accept_seconds: null,
      median_time_to_accept_seconds: null,
    };

    const acceptTimes = [];
    const daily = new Map();

    function getDayRow(key) {
      if (!daily.has(key)) {
        daily.set(key, { day: key, sent: 0, accepted: 0, declined: 0, closed: 0 });
      }
      return daily.get(key);
    }

    for (const quote of quotes || []) {
      if (quote.sent_at) {
        totals.sent += 1;
        const sentKey = dayKey(quote.sent_at);
        if (sentKey) getDayRow(sentKey).sent += 1;
      }
      if (quote.accepted_at) {
        totals.accepted += 1;
        const acceptedKey = dayKey(quote.accepted_at);
        if (acceptedKey) getDayRow(acceptedKey).accepted += 1;
        const seconds = secondsBetween(quote.sent_at, quote.accepted_at);
        if (seconds != null) acceptTimes.push(seconds);
      }
      if (quote.declined_at) {
        totals.declined += 1;
        const declinedKey = dayKey(quote.declined_at);
        if (declinedKey) getDayRow(declinedKey).declined += 1;
      }
      if (quote.closed_at) {
        totals.closed += 1;
        const closedKey = dayKey(quote.closed_at);
        if (closedKey) getDayRow(closedKey).closed += 1;
      }
    }

    totals.acceptance_rate = totals.sent > 0 ? Number((totals.accepted / totals.sent).toFixed(4)) : 0;
    totals.avg_time_to_accept_seconds = average(acceptTimes);
    totals.median_time_to_accept_seconds = median(acceptTimes);

    const dailySeries = [...daily.values()].sort((a, b) => a.day.localeCompare(b.day));

    return res.status(200).json({
      ok: true,
      from,
      to,
      totals,
      daily: dailySeries,
    });
  } catch (err) {
    console.error("admin-quote-funnel crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
