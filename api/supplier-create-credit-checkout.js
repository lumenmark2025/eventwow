import { createClient } from "@supabase/supabase-js";
import { createCreditBundleCheckoutSession } from "./_lib/stripe.js";
import { buildAbsoluteUrl } from "./_lib/notifications.js";

const BUNDLES = {
  credits_25: { credits: 25, amountTotal: 1250, currency: "gbp" },
  credits_50: { credits: 50, amountTotal: 2500, currency: "gbp" },
};

function normalizeBundle(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "25" || v === "credits_25") return "credits_25";
  if (v === "50" || v === "credits_50") return "credits_50";
  return "";
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

    const bundleCode = normalizeBundle(body?.bundle || body?.bundleCode);
    if (!bundleCode || !BUNDLES[bundleCode]) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid bundle" });
    }
    const bundle = BUNDLES[bundleCode];

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
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const { data: existing, error: existingErr } = await admin
      .from("credit_bundle_orders")
      .select("*")
      .eq("supplier_id", supplier.id)
      .eq("bundle_code", bundleCode)
      .in("status", ["requires_payment", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      return res.status(500).json({ ok: false, error: "Order lookup failed", details: existingErr.message });
    }
    if (existing?.checkout_url) {
      return res.status(200).json({
        ok: true,
        orderId: existing.id,
        checkoutUrl: existing.checkout_url,
        status: existing.status,
      });
    }

    const nowIso = new Date().toISOString();
    const { data: order, error: orderErr } = await admin
      .from("credit_bundle_orders")
      .insert([
        {
          supplier_id: supplier.id,
          status: "requires_payment",
          bundle_code: bundleCode,
          credits: bundle.credits,
          amount_total: bundle.amountTotal,
          currency: bundle.currency,
          created_by_user: userId,
          updated_at: nowIso,
        },
      ])
      .select("*")
      .maybeSingle();

    if (orderErr || !order) {
      return res.status(500).json({ ok: false, error: "Failed to create order", details: orderErr?.message });
    }

    const successUrl = `${buildAbsoluteUrl(req, "/supplier/dashboard")}?credits=success`;
    const cancelUrl = `${buildAbsoluteUrl(req, "/supplier/dashboard")}?credits=cancel`;

    const session = await createCreditBundleCheckoutSession({
      orderId: order.id,
      supplierId: supplier.id,
      bundleCode,
      credits: bundle.credits,
      amountTotal: bundle.amountTotal,
      currency: bundle.currency,
      successUrl,
      cancelUrl,
    });

    const { data: updated, error: updateErr } = await admin
      .from("credit_bundle_orders")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        checkout_url: session.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select("*")
      .maybeSingle();

    if (updateErr || !updated) {
      return res.status(500).json({ ok: false, error: "Failed to save checkout session", details: updateErr?.message });
    }

    await admin.from("credit_bundle_events").insert([
      {
        order_id: updated.id,
        event_type: "created",
        source: "api",
        meta: {
          supplierId: supplier.id,
          bundleCode,
          checkoutSessionId: session.id,
        },
      },
    ]);

    return res.status(200).json({
      ok: true,
      orderId: updated.id,
      checkoutUrl: updated.checkout_url,
      status: updated.status,
      bundle: {
        code: bundleCode,
        credits: bundle.credits,
        amountTotal: bundle.amountTotal,
      },
    });
  } catch (err) {
    console.error("supplier-create-credit-checkout crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

