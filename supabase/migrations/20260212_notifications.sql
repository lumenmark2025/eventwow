-- PR10: Notifications (in-app + idempotency log)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  type text not null,
  title text not null,
  body text null,
  url text null,
  entity_type text null,
  entity_id uuid null,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create index if not exists notifications_supplier_created_at_desc_idx
  on public.notifications (supplier_id, created_at desc);

create index if not exists notifications_supplier_read_at_idx
  on public.notifications (supplier_id, read_at);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  created_at timestamptz not null default now(),
  meta jsonb null
);

create unique index if not exists notification_log_event_key_unique_idx
  on public.notification_log (event_key);

alter table if exists public.notifications enable row level security;
alter table if exists public.notification_log enable row level security;
