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

    if (!SUPABASE_URL || !ANON_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
        },
      });
    }

    if (!SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing service role key",
        details: "SUPABASE_SERVICE_ROLE_KEY is required for server-side writes",
      });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const quoteId = String(body?.quote_id || body?.quoteId || "").trim();
    if (!quoteId || !UUID_RE.test(quoteId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid quote_id" });
    }

    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: userErr?.message });
    }
    const userId = userData.user.id;

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: supplier, error: supErr } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(409).json({ ok: false, error: "Cannot reopen quote", details: "Supplier not found" });
    }

    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("quotes")
      .select("id,status,supplier_id,accepted_at,declined_at")
      .eq("id", quoteId)
      .eq("supplier_id", supplier.id)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }
    if (!quote) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const status = String(quote.status || "").toLowerCase();
    if (status === "sent") {
      const { data: current, error: currentErr } = await supabaseAdmin
        .from("quotes")
        .select("*")
        .eq("id", quote.id)
        .single();

      if (currentErr) {
        return res.status(500).json({ ok: false, error: "Quote lookup failed", details: currentErr.message });
      }

      return res.status(200).json({ ok: true, quote: current });
    }

    if (status !== "closed") {
      return res.status(409).json({
        ok: false,
        error: "Cannot reopen quote",
        details: "Quote is locked.",
      });
    }

    if (quote.accepted_at || quote.declined_at) {
      return res.status(409).json({
        ok: false,
        error: "Cannot reopen quote",
        details: "Quote is locked.",
      });
    }

    const nowIso = new Date().toISOString();

    let { data: updated, error: updateErr } = await supabaseAdmin
      .from("quotes")
      .update({
        status: "sent",
        closed_at: null,
        closed_reason: null,
        closed_by_user: null,
        updated_at: nowIso,
        updated_by_user: userId,
      })
      .eq("id", quote.id)
      .eq("status", "closed")
      .is("accepted_at", null)
      .is("declined_at", null)
      .select("*")
      .maybeSingle();

    const missingOptionalColumn =
      updateErr &&
      updateErr.code === "PGRST204" &&
      (String(updateErr.message || "").includes("closed_reason") ||
        String(updateErr.message || "").includes("closed_by_user"));

    if (missingOptionalColumn) {
      const fallback = await supabaseAdmin
        .from("quotes")
        .update({
          status: "sent",
          closed_at: null,
          updated_at: nowIso,
          updated_by_user: userId,
        })
        .eq("id", quote.id)
        .eq("status", "closed")
        .is("accepted_at", null)
        .is("declined_at", null)
        .select("*")
        .maybeSingle();
      updated = fallback.data;
      updateErr = fallback.error;
    }

    if (updateErr) {
      return res.status(500).json({ ok: false, error: "Failed to reopen quote", details: updateErr.message });
    }

    if (!updated) {
      return res.status(409).json({
        ok: false,
        error: "Cannot reopen quote",
        details: "Quote was updated by another request",
      });
    }

    try {
      await supabaseAdmin.from("quote_events").insert([
        {
          quote_id: quote.id,
          event_type: "reopened",
          actor_type: "supplier",
          actor_user_id: userId,
          meta: { source: "supplier-reopen-quote" },
        },
      ]);
    } catch (eventErr) {
      console.error("quote_events reopened insert failed:", eventErr);
    }

    return res.status(200).json({ ok: true, quote: updated });
  } catch (err) {
    console.error("supplier-reopen-quote crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
