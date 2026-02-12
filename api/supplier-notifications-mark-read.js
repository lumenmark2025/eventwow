import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: userErr?.message });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: supplier, error: supErr } = await admin
      .from("suppliers")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(409).json({ ok: false, error: "Supplier not found" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const all = !!body?.all;
    const notificationIds = Array.isArray(body?.notificationIds)
      ? body.notificationIds.filter((id) => UUID_RE.test(String(id))).map((id) => String(id))
      : [];

    if (!all && notificationIds.length === 0) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "notificationIds[] or all=true required" });
    }

    const nowIso = new Date().toISOString();

    let query = admin
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("supplier_id", supplier.id)
      .is("read_at", null);

    if (!all) {
      query = query.in("id", notificationIds);
    }

    const { error: updErr } = await query;

    if (updErr) {
      return res.status(500).json({ ok: false, error: "Failed to mark notifications", details: updErr.message });
    }

    return res.status(200).json({ ok: true, read_at: nowIso });
  } catch (err) {
    console.error("supplier-notifications-mark-read crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
