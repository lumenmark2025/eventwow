-- Ensure suppliers.credits_balance exists
alter table if exists public.suppliers
  add column if not exists credits_balance integer not null default 0;
