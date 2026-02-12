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

