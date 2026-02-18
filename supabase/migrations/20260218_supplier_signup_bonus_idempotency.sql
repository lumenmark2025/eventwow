-- PR32c: Ensure signup bonus credits can only be granted once per supplier.

create unique index if not exists credits_ledger_signup_bonus_once_idx
  on public.credits_ledger (supplier_id)
  where reason = 'signup_bonus';

