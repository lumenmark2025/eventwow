import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const token = String(body?.token || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();
    const customerMessageRaw = body?.customer_message;

    if (!token) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing token" });
    }

    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid action" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("quotes")
      .select("id,status")
      .eq("public_token", token)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }

    if (!quote) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const status = String(quote.status || "").toLowerCase();
    if (status === "accepted" || status === "declined") {
      return res.status(409).json({
        ok: false,
        error: "Quote already finalized",
        details: `Quote is already ${status}`,
      });
    }

    if (status !== "sent") {
      return res.status(409).json({
        ok: false,
        error: "Cannot update quote",
        details: "Only sent quotes can be accepted or declined",
      });
    }

    const nowIso = new Date().toISOString();
    const patch = {
      status: action === "accept" ? "accepted" : "declined",
      accepted_at: action === "accept" ? nowIso : null,
      declined_at: action === "decline" ? nowIso : null,
      updated_at: nowIso,
    };

    if (typeof customerMessageRaw === "string") {
      patch.customer_message = customerMessageRaw.trim() || null;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("quotes")
      .update(patch)
      .eq("id", quote.id)
      .eq("status", "sent")
      .select("id,status,total_amount,currency_code,created_at,sent_at,accepted_at,declined_at,customer_message")
      .maybeSingle();

    if (updateErr) {
      return res.status(500).json({ ok: false, error: "Failed to update quote", details: updateErr.message });
    }

    if (!updated) {
      return res.status(409).json({
        ok: false,
        error: "Cannot update quote",
        details: "Quote was updated by another request",
      });
    }

    return res.status(200).json({ ok: true, quote: updated });
  } catch (err) {
    console.error("public-quote-action crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
