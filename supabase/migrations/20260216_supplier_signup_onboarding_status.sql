-- PR: Supplier signup + onboarding status funnel

alter table if exists public.suppliers
  add column if not exists onboarding_status text not null default 'draft';

alter table if exists public.suppliers
  drop constraint if exists suppliers_onboarding_status_check;

alter table if exists public.suppliers
  add constraint suppliers_onboarding_status_check
  check (onboarding_status in ('draft', 'awaiting_email_verification', 'profile_incomplete', 'pending_review', 'approved', 'rejected'));

create index if not exists suppliers_onboarding_status_idx
  on public.suppliers (onboarding_status, submitted_at desc);

-- Backfill from legacy status values where onboarding_status is still draft.
update public.suppliers
set onboarding_status = case
  when status = 'pending_review' then 'pending_review'
  when status = 'approved' then 'approved'
  when status = 'rejected' then 'rejected'
  else onboarding_status
end
where onboarding_status = 'draft'
  and status in ('pending_review', 'approved', 'rejected');
