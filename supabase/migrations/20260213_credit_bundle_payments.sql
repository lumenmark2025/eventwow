-- PR: Credit bundle Stripe checkout (25/50 credits)

create table if not exists public.credit_bundle_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  status text not null default 'requires_payment' check (status in ('requires_payment', 'pending', 'paid', 'failed', 'canceled')),
  bundle_code text not null check (bundle_code in ('credits_25', 'credits_50')),
  credits int not null check (credits > 0),
  amount_total int not null check (amount_total >= 0),
  currency text not null default 'gbp',
  stripe_checkout_session_id text null unique,
  stripe_payment_intent_id text null unique,
  checkout_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz null,
  created_by_user uuid null
);

create index if not exists credit_bundle_orders_supplier_created_at_desc_idx
  on public.credit_bundle_orders (supplier_id, created_at desc);

create unique index if not exists credit_bundle_orders_checkout_unique_idx
  on public.credit_bundle_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists credit_bundle_orders_pi_unique_idx
  on public.credit_bundle_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table if exists public.credit_bundle_orders enable row level security;

create table if not exists public.credit_bundle_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.credit_bundle_orders(id) on delete cascade,
  event_type text not null,
  event_at timestamptz not null default now(),
  source text not null check (source in ('api', 'stripe_webhook')),
  stripe_event_id text null unique,
  meta jsonb null
);

create index if not exists credit_bundle_events_order_event_at_desc_idx
  on public.credit_bundle_events (order_id, event_at desc);

create unique index if not exists credit_bundle_events_stripe_event_unique_idx
  on public.credit_bundle_events (stripe_event_id)
  where stripe_event_id is not null;

alter table if exists public.credit_bundle_events enable row level security;
