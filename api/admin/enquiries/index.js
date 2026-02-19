import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";

function requestId() {
  return Math.random().toString(36).slice(2, 10);
}

function hostFromUrl(value) {
  try {
    return new URL(String(value || "")).hostname || null;
  } catch {
    return null;
  }
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

export default async function handler(req, res) {
  const rid = requestId();
  const endpoint = "admin/enquiries/index";

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) {
      console.warn("[admin-enquiries]", {
        request_id: rid,
        endpoint,
        stage: "auth",
        status: auth.code,
        error: auth.error,
      });
      return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details, request_id: rid });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error("[admin-enquiries]", {
        request_id: rid,
        endpoint,
        stage: "env",
        has_supabase_url: !!SUPABASE_URL,
        has_service_role_key: !!SERVICE_KEY,
      });
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
        request_id: rid,
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const status = String(req.query?.status || "").trim().toLowerCase() || null;
    const q = String(req.query?.q || "").trim() || null;
    const days = req.query?.days ? toInt(req.query.days, null) : null;
    const page = toInt(req.query?.page || 1, 1);
    const pageSize = Math.min(toInt(req.query?.pageSize || 100, 100), 500);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const queryMeta = { status, q, days, page, pageSize };

    let query = admin
      .from("enquiries")
      .select("id,event_date,event_postcode,status,match_source,created_at,customers(full_name),venues(name)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (q) {
      query = query.or(`event_postcode.ilike.%${q}%,customer_name.ilike.%${q}%`);
    }

    if (days && days > 0) {
      const dt = new Date();
      dt.setDate(dt.getDate() - days);
      query = query.gte("created_at", dt.toISOString());
    }

    query = query.range(from, to);

    const response = await query;
    if (response.error) {
      console.error("[admin-enquiries]", {
        request_id: rid,
        endpoint,
        admin_user_id: auth.userId || null,
        supabase_host: hostFromUrl(SUPABASE_URL),
        filters: queryMeta,
        rowcount: 0,
        error_code: response.error.code || null,
        error_message: response.error.message,
      });
      return res.status(500).json({
        ok: false,
        error: "Failed to load enquiries",
        details: response.error.message,
        request_id: rid,
      });
    }

    const rows = response.data || [];

    console.info("[admin-enquiries]", {
      request_id: rid,
      endpoint,
      admin_user_id: auth.userId || null,
      supabase_host: hostFromUrl(SUPABASE_URL),
      filters: queryMeta,
      rowcount: rows.length,
    });

    return res.status(200).json({
      ok: true,
      rows,
      total: Number(response.count || 0),
      page,
      pageSize,
      request_id: rid,
    });
  } catch (err) {
    console.error("[admin-enquiries]", {
      request_id: rid,
      endpoint,
      stage: "crash",
      error_message: String(err?.message || err),
    });
    return res.status(500).json({
      ok: false,
      error: "Internal Server Error",
      details: String(err?.message || err),
      request_id: rid,
    });
  }
}

