-- Public quote links (tokenized customer access)
create table if not exists public.quote_public_links (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_user uuid null,
  revoked_at timestamptz null,
  last_viewed_at timestamptz null,
  view_count int not null default 0
);

create unique index if not exists quote_public_links_token_unique_idx
  on public.quote_public_links (token);

create unique index if not exists quote_public_links_quote_id_unique_idx
  on public.quote_public_links (quote_id);

-- Customer/supplier action audit columns on quotes
alter table if exists public.quotes
  add column if not exists accepted_at timestamptz null,
  add column if not exists declined_at timestamptz null,
  add column if not exists closed_at timestamptz null,
  add column if not exists customer_action_note text null,
  add column if not exists customer_action_name text null,
  add column if not exists customer_action_email text null;
