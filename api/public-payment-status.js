import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizePublicPayment(payment) {
  if (!payment) return null;
  const status = String(payment.status || "").toLowerCase();
  return {
    status: payment.status,
    amount_total: payment.amount_total,
    amount_paid: payment.amount_paid,
    currency: payment.currency || "gbp",
    paid_at: payment.paid_at,
    checkout_url: ["requires_payment", "pending", "failed", "canceled"].includes(status) ? payment.checkout_url || null : null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const token = String(req.query?.token || "").trim();
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
      .select("id,status,amount_total,amount_paid,currency,paid_at,checkout_url,created_at")
      .eq("quote_id", link.quote_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payErr) {
      return res.status(500).json({ ok: false, error: "Payment lookup failed", details: payErr.message });
    }

    return res.status(200).json({
      ok: true,
      payment: sanitizePublicPayment(payment),
    });
  } catch (err) {
    console.error("public-payment-status crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

