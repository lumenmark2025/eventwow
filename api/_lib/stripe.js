import Stripe from "stripe";

let stripeClient = null;

export function initStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export async function createDepositCheckoutSession({
  paymentId,
  quoteId,
  supplierId,
  amountTotal,
  currency = "gbp",
  successUrl,
  cancelUrl,
}) {
  const stripe = initStripe();
  const normalizedCurrency = String(currency || "gbp").toLowerCase();
  const metadata = {
    paymentId: String(paymentId),
    quoteId: String(quoteId),
    supplierId: String(supplierId),
  };

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: normalizedCurrency,
          unit_amount: Number(amountTotal),
          product_data: {
            name: `Deposit for Quote #${String(quoteId).slice(0, 8)}`,
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    payment_intent_data: {
      metadata,
    },
  });
}

export async function createCreditBundleCheckoutSession({
  orderId,
  supplierId,
  bundleCode,
  credits,
  amountTotal,
  currency = "gbp",
  successUrl,
  cancelUrl,
}) {
  const stripe = initStripe();
  const normalizedCurrency = String(currency || "gbp").toLowerCase();
  const metadata = {
    paymentKind: "credit_bundle",
    orderId: String(orderId),
    supplierId: String(supplierId),
    bundleCode: String(bundleCode),
    credits: String(credits),
  };

  const priceByBundle = {
    credits_25: process.env.STRIPE_PRICE_ID_CREDITS_25 || "",
    credits_50: process.env.STRIPE_PRICE_ID_CREDITS_50 || "",
  };
  const configuredPrice = priceByBundle[bundleCode] || "";

  const lineItems = configuredPrice
    ? [{ quantity: 1, price: configuredPrice }]
    : [
        {
          quantity: 1,
          price_data: {
            currency: normalizedCurrency,
            unit_amount: Number(amountTotal),
            product_data: {
              name: `${credits} credit bundle`,
            },
          },
        },
      ];

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    payment_intent_data: {
      metadata,
    },
  });
}

export async function getCheckoutSession(sessionId) {
  const stripe = initStripe();
  return stripe.checkout.sessions.retrieve(String(sessionId));
}

export function verifyStripeWebhook(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  if (!signature) throw new Error("Missing Stripe signature");

  const stripe = initStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

