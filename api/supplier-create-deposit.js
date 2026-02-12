import { createClient } from "@supabase/supabase-js";
import { createDepositCheckoutSession } from "./_lib/stripe.js";
import { buildAbsoluteUrl } from "./_lib/notifications.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCurrency(value) {
  const v = String(value || "gbp").trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(v)) return "gbp";
  return v;
}

async function ensurePublicLink(admin, quoteId, userId) {
  const existing = await admin
    .from("quote_public_links")
    .select("token")
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (!existing.error && existing.data?.token) {
    return { token: existing.data.token, error: null };
  }
  if (existing.error && existing.error.code !== "PGRST116") {
    return { token: null, error: existing.error };
  }

  const created = await admin
    .from("quote_public_links")
    .insert([{ quote_id: quoteId, created_by_user: userId }])
    .select("token")
    .maybeSingle();

  if (created.error) {
    if (created.error.code === "23505") {
      const retry = await admin
        .from("quote_public_links")
        .select("token")
        .eq("quote_id", quoteId)
        .maybeSingle();
      return { token: retry.data?.token || null, error: retry.error || null };
    }
    return { token: null, error: created.error };
  }

  return { token: created.data?.token || null, error: null };
}

function sanitizePayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    status: payment.status,
    currency: payment.currency,
    amount_total: payment.amount_total,
    amount_paid: payment.amount_paid,
    checkout_url: payment.checkout_url,
    paid_at: payment.paid_at,
  };
}

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

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const quoteId = String(body?.quoteId || body?.quote_id || "").trim();
    const amountTotal = Number(body?.amountTotal);
    const currency = normalizeCurrency(body?.currency);

    if (!UUID_RE.test(quoteId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid quoteId" });
    }
    if (!Number.isInteger(amountTotal) || amountTotal < 1000 || amountTotal > 500000) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "amountTotal must be an integer between 1000 and 500000" });
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: supplier, error: supErr } = await admin
      .from("suppliers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(409).json({ ok: false, error: "Supplier not found" });
    }

    const { data: quote, error: quoteErr } = await admin
      .from("quotes")
      .select("id,status,supplier_id")
      .eq("id", quoteId)
      .eq("supplier_id", supplier.id)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }
    if (!quote) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const quoteStatus = String(quote.status || "").toLowerCase();
    if (quoteStatus !== "accepted") {
      return res.status(409).json({ ok: false, error: "Cannot request deposit", details: "Quote must be accepted" });
    }

    const { data: latestPayment, error: latestErr } = await admin
      .from("payments")
      .select("*")
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      return res.status(500).json({ ok: false, error: "Payment lookup failed", details: latestErr.message });
    }

    const latestStatus = String(latestPayment?.status || "").toLowerCase();
    if (latestPayment && latestStatus === "paid") {
      return res.status(409).json({ ok: false, error: "Deposit already paid" });
    }
    if (
      latestPayment &&
      ["requires_payment", "pending"].includes(latestStatus) &&
      latestPayment.checkout_url
    ) {
      return res.status(200).json({
        ok: true,
        paymentId: latestPayment.id,
        checkoutUrl: latestPayment.checkout_url,
        status: latestPayment.status,
        payment: sanitizePayment(latestPayment),
      });
    }

    const linkResp = await ensurePublicLink(admin, quote.id, userId);
    if (linkResp.error || !linkResp.token) {
      return res.status(500).json({
        ok: false,
        error: "Failed to prepare public link",
        details: linkResp.error?.message || "Missing quote token",
      });
    }

    const nowIso = new Date().toISOString();
    let basePayment = latestPayment;
    if (!basePayment || !["requires_payment", "pending"].includes(latestStatus)) {
      const { data: inserted, error: insertErr } = await admin
        .from("payments")
        .insert([
          {
            quote_id: quote.id,
            supplier_id: supplier.id,
            status: "requires_payment",
            currency,
            amount_total: amountTotal,
            amount_paid: 0,
            created_by_user: userId,
            updated_at: nowIso,
          },
        ])
        .select("*")
        .maybeSingle();

      if (insertErr || !inserted) {
        return res.status(500).json({ ok: false, error: "Failed to create payment", details: insertErr?.message });
      }
      basePayment = inserted;
    } else {
      const { data: updatedBase, error: updatedBaseErr } = await admin
        .from("payments")
        .update({
          currency,
          amount_total: amountTotal,
          status: "requires_payment",
          amount_paid: 0,
          updated_at: nowIso,
        })
        .eq("id", basePayment.id)
        .select("*")
        .maybeSingle();
      if (updatedBaseErr || !updatedBase) {
        return res.status(500).json({ ok: false, error: "Failed to update payment", details: updatedBaseErr?.message });
      }
      basePayment = updatedBase;
    }

    const successUrl = `${buildAbsoluteUrl(req, `/quote/${linkResp.token}`)}?payment=success`;
    const cancelUrl = `${buildAbsoluteUrl(req, `/quote/${linkResp.token}`)}?payment=cancel`;

    const session = await createDepositCheckoutSession({
      paymentId: basePayment.id,
      quoteId: quote.id,
      supplierId: supplier.id,
      amountTotal,
      currency,
      successUrl,
      cancelUrl,
    });

    const { data: updated, error: updateErr } = await admin
      .from("payments")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        checkout_url: session.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", basePayment.id)
      .select("*")
      .maybeSingle();

    if (updateErr || !updated) {
      return res.status(500).json({ ok: false, error: "Failed to save checkout session", details: updateErr?.message });
    }

    await admin.from("payment_events").insert([
      {
        payment_id: updated.id,
        event_type: "created",
        source: "api",
        meta: {
          quoteId: quote.id,
          supplierId: supplier.id,
          stripeCheckoutSessionId: session.id,
        },
      },
    ]);

    await admin
      .from("quotes")
      .update({
        deposit_required: true,
        deposit_amount: amountTotal,
        deposit_status: "requires_payment",
        updated_at: new Date().toISOString(),
        updated_by_user: userId,
      })
      .eq("id", quote.id);

    return res.status(200).json({
      ok: true,
      paymentId: updated.id,
      checkoutUrl: updated.checkout_url,
      status: updated.status,
      payment: sanitizePayment(updated),
    });
  } catch (err) {
    console.error("supplier-create-deposit crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
