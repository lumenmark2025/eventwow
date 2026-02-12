-- Optional supplier close metadata for PR7 controls
alter table if exists public.quotes
  add column if not exists closed_reason text null,
  add column if not exists closed_by_user uuid null;
