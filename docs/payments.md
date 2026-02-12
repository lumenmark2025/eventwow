# PR12 Stripe Deposit Payments

## Environment Variables

Set these in Vercel and local env:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_APP_URL` (for example `https://yourdomain.com`)
- `SUPABASE_SERVICE_ROLE_KEY` (already used by server endpoints)

## Supabase Migration

Run:

- `supabase/migrations/20260212_payments_deposits.sql`

## Endpoints Added

- `POST /api/supplier-create-deposit`
- `GET /api/public-payment-status?token=...`
- `POST /api/public-start-deposit`
- `POST /api/stripe-webhook`

## Local Stripe Webhook Testing

1. Start app locally.
2. Run Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

3. Copy webhook signing secret from Stripe CLI output into `STRIPE_WEBHOOK_SECRET`.
4. Trigger checkout in UI and complete payment in Stripe test mode.
5. Confirm `payments.status` transitions to `paid` and `payment_events` records are inserted.

## Notes

- Webhook handler uses raw request body + signature verification.
- Public payment status/start endpoints are token-gated via `quote_public_links`.
- Deposit writes are API-only; no direct public Supabase writes.
