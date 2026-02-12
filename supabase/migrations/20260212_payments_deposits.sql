-- PR12: Stripe deposit payments

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  status text not null default 'requires_payment' check (status in ('requires_payment', 'pending', 'paid', 'failed', 'canceled', 'refunded')),
  currency text not null default 'gbp',
  amount_total int not null check (amount_total >= 0),
  amount_paid int not null default 0 check (amount_paid >= 0),
  stripe_checkout_session_id text null unique,
  stripe_payment_intent_id text null unique,
  checkout_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz null,
  refunded_at timestamptz null,
  created_by_user uuid null
);

create index if not exists payments_supplier_created_at_desc_idx
  on public.payments (supplier_id, created_at desc);

create index if not exists payments_quote_id_idx
  on public.payments (quote_id);

create unique index if not exists payments_checkout_session_unique_idx
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists payments_payment_intent_unique_idx
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table if exists public.payments enable row level security;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  event_type text not null,
  event_at timestamptz not null default now(),
  source text not null check (source in ('api', 'stripe_webhook')),
  stripe_event_id text null unique,
  meta jsonb null
);

create index if not exists payment_events_payment_event_at_desc_idx
  on public.payment_events (payment_id, event_at desc);

create unique index if not exists payment_events_stripe_event_unique_idx
  on public.payment_events (stripe_event_id)
  where stripe_event_id is not null;

alter table if exists public.payment_events enable row level security;

alter table if exists public.quotes
  add column if not exists deposit_required boolean not null default false,
  add column if not exists deposit_amount int null,
  add column if not exists deposit_status text null;
