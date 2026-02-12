-- Quote audit columns for save/send traceability
alter table if exists public.quotes
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by_user uuid null,
  add column if not exists sent_at timestamptz null,
  add column if not exists sent_by_user uuid null;

-- Optional audit column for quote_items edits
alter table if exists public.quote_items
  add column if not exists updated_at timestamptz not null default now();
