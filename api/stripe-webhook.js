import { createClient } from "@supabase/supabase-js";
import { readRawBody, verifyStripeWebhook } from "./_lib/stripe.js";
import { notifyDepositPaid } from "./_lib/notifications.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

function mapEventType(type) {
  if (type === "checkout.session.completed") return "checkout_session_completed";
  if (type === "payment_intent.succeeded") return "payment_intent_succeeded";
  if (type === "payment_intent.payment_failed") return "payment_failed";
  if (type === "charge.refunded" || type === "refund.updated" || type === "charge.refund.updated") return "refunded";
  return null;
}

async function findPayment(admin, stripeObject) {
  const paymentId = stripeObject?.metadata?.paymentId;
  if (paymentId) {
    const byId = await admin.from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (!byId.error && byId.data) return byId.data;
  }

  if (stripeObject?.object === "checkout.session") {
    const bySession = await admin
      .from("payments")
      .select("*")
      .eq("stripe_checkout_session_id", stripeObject.id)
      .maybeSingle();
    if (!bySession.error && bySession.data) return bySession.data;
  }

  if (stripeObject?.object === "payment_intent") {
    const byPi = await admin
      .from("payments")
      .select("*")
      .eq("stripe_payment_intent_id", stripeObject.id)
      .maybeSingle();
    if (!byPi.error && byPi.data) return byPi.data;
  }

  if (stripeObject?.object === "charge" && stripeObject.payment_intent) {
    const byChargePi = await admin
      .from("payments")
      .select("*")
      .eq("stripe_payment_intent_id", stripeObject.payment_intent)
      .maybeSingle();
    if (!byChargePi.error && byChargePi.data) return byChargePi.data;
  }

  return null;
}

async function saveEvent(admin, paymentId, eventType, stripeEventId, meta) {
  const inserted = await admin.from("payment_events").insert([
    {
      payment_id: paymentId,
      event_type: eventType,
      source: "stripe_webhook",
      stripe_event_id: stripeEventId,
      meta,
    },
  ]);
  if (!inserted.error) return { ok: true, duplicate: false };
  if (inserted.error.code === "23505") return { ok: true, duplicate: true };
  return { ok: false, error: inserted.error };
}

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

    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];

    let event;
    try {
      event = verifyStripeWebhook(rawBody, signature);
    } catch (verifyErr) {
      return res.status(400).json({ ok: false, error: "Invalid webhook signature", details: verifyErr.message });
    }

    const mapped = mapEventType(event.type);
    if (!mapped) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const stripeObject = event.data?.object || null;
    const payment = await findPayment(admin, stripeObject);

    if (!payment) {
      return res.status(200).json({ ok: true, ignored: true, reason: "payment_not_found" });
    }

    const save = await saveEvent(admin, payment.id, mapped, event.id, {
      stripeType: event.type,
      stripeObjectId: stripeObject?.id || null,
    });
    if (!save.ok) {
      return res.status(500).json({ ok: false, error: "Failed to persist payment event", details: save.error?.message });
    }
    if (save.duplicate) {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    const nowIso = new Date().toISOString();

    if (event.type === "checkout.session.completed") {
      const isPaid = stripeObject?.payment_status === "paid";
      await admin
        .from("payments")
        .update({
          status: isPaid ? "paid" : "pending",
          amount_paid: isPaid ? Number(stripeObject?.amount_total || payment.amount_total || 0) : Number(payment.amount_paid || 0),
          paid_at: isPaid ? nowIso : payment.paid_at,
          stripe_checkout_session_id: stripeObject?.id || payment.stripe_checkout_session_id,
          stripe_payment_intent_id:
            typeof stripeObject?.payment_intent === "string" ? stripeObject.payment_intent : payment.stripe_payment_intent_id,
          updated_at: nowIso,
        })
        .eq("id", payment.id);

      if (isPaid) {
        await admin
          .from("quotes")
          .update({ deposit_status: "paid", updated_at: nowIso, updated_by_user: null })
          .eq("id", payment.quote_id);
        try {
          await notifyDepositPaid({
            admin,
            paymentId: payment.id,
            quoteId: payment.quote_id,
            supplierId: payment.supplier_id,
          });
        } catch (notifyErr) {
          console.error("deposit_paid notification failed:", notifyErr);
        }
      } else {
        await admin
          .from("quotes")
          .update({ deposit_status: "pending", updated_at: nowIso, updated_by_user: null })
          .eq("id", payment.quote_id);
      }
    }

    if (event.type === "payment_intent.succeeded") {
      await admin
        .from("payments")
        .update({
          status: "paid",
          amount_paid: Number(stripeObject?.amount_received || stripeObject?.amount || payment.amount_total || 0),
          paid_at: nowIso,
          stripe_payment_intent_id: stripeObject?.id || payment.stripe_payment_intent_id,
          updated_at: nowIso,
        })
        .eq("id", payment.id);

      await admin
        .from("quotes")
        .update({ deposit_status: "paid", updated_at: nowIso, updated_by_user: null })
        .eq("id", payment.quote_id);

      try {
        await notifyDepositPaid({
          admin,
          paymentId: payment.id,
          quoteId: payment.quote_id,
          supplierId: payment.supplier_id,
        });
      } catch (notifyErr) {
        console.error("deposit_paid notification failed:", notifyErr);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      await admin
        .from("payments")
        .update({
          status: "failed",
          stripe_payment_intent_id: stripeObject?.id || payment.stripe_payment_intent_id,
          updated_at: nowIso,
        })
        .eq("id", payment.id);
      await admin
        .from("quotes")
        .update({ deposit_status: "failed", updated_at: nowIso, updated_by_user: null })
        .eq("id", payment.quote_id);
    }

    if (event.type === "charge.refunded" || event.type === "refund.updated" || event.type === "charge.refund.updated") {
      await admin
        .from("payments")
        .update({
          status: "refunded",
          refunded_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", payment.id);
      await admin
        .from("quotes")
        .update({ deposit_status: "refunded", updated_at: nowIso, updated_by_user: null })
        .eq("id", payment.quote_id);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("stripe-webhook crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

