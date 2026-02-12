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
    if (!UUID_RE.test(token)) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: link, error: linkErr } = await admin
      .from("quote_public_links")
      .select("quote_id,revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (linkErr) {
      return res.status(500).json({ ok: false, error: "Link lookup failed", details: linkErr.message });
    }
    if (!link || link.revoked_at) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id,status,checkout_url")
      .eq("quote_id", link.quote_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payErr) {
      return res.status(500).json({ ok: false, error: "Payment lookup failed", details: payErr.message });
    }
    if (!payment) {
      return res.status(404).json({ ok: false, error: "No deposit requested" });
    }

    const status = String(payment.status || "").toLowerCase();
    if (status === "paid") {
      return res.status(409).json({ ok: false, error: "Deposit already paid" });
    }
    if (!["requires_payment", "pending", "failed", "canceled"].includes(status) || !payment.checkout_url) {
      return res.status(404).json({ ok: false, error: "No deposit requested" });
    }

    return res.status(200).json({
      ok: true,
      checkoutUrl: payment.checkout_url,
    });
  } catch (err) {
    console.error("public-start-deposit crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

