import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const limitRaw = Number(req.query?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 50;

    const { data: rows, error: rowsErr } = await admin
      .from("notifications")
      .select("id,type,title,body,url,entity_type,entity_id,created_at,read_at")
      .eq("supplier_id", supplier.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (rowsErr) {
      return res.status(500).json({ ok: false, error: "Failed to load notifications", details: rowsErr.message });
    }

    const { count: unreadCount, error: countErr } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplier.id)
      .is("read_at", null);

    if (countErr) {
      return res.status(500).json({ ok: false, error: "Failed to load unread count", details: countErr.message });
    }

    return res.status(200).json({
      ok: true,
      unread_count: Number(unreadCount || 0),
      notifications: rows || [],
    });
  } catch (err) {
    console.error("supplier-notifications crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
