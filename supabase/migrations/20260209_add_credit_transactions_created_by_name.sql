-- Add display name for credit transaction creator (admin or system)
alter table if exists public.credit_transactions
  add column if not exists created_by_name text;
