-- PR32b: Budget amount + unit for public enquiry forms.
-- Keeps legacy budget_range for backward compatibility.

alter table if exists public.enquiries
  add column if not exists budget_amount numeric null,
  add column if not exists budget_unit text null;

alter table if exists public.enquiries
  drop constraint if exists enquiries_budget_unit_check;

alter table if exists public.enquiries
  add constraint enquiries_budget_unit_check
  check (budget_unit in ('per_person', 'in_total') or budget_unit is null);

create index if not exists enquiries_budget_unit_idx
  on public.enquiries (budget_unit);
