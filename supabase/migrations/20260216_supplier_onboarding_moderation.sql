-- PR Supplier Onboarding + Moderation + Launch Offer
-- Adds supplier moderation fields, server-side approval helper, and supplier-safe column guard.

alter table if exists public.suppliers
  add column if not exists status text not null default 'draft',
  add column if not exists submitted_at timestamptz null,
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by uuid null references auth.users(id),
  add column if not exists rejected_at timestamptz null,
  add column if not exists admin_notes text null,
  add column if not exists launch_credits_awarded_at timestamptz null;

alter table if exists public.suppliers
  drop constraint if exists suppliers_status_check;

alter table if exists public.suppliers
  add constraint suppliers_status_check
  check (status in ('draft', 'pending_review', 'approved', 'rejected'));

create index if not exists suppliers_status_submitted_idx
  on public.suppliers (status, submitted_at desc);

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = auth.uid()
      and up.role = 'admin'
  )
$$;

-- Canonical admin approval flow with idempotent launch credit award.
create or replace function public.admin_approve_supplier_application(
  p_supplier_id uuid,
  p_admin_user_id uuid,
  p_admin_note text default null
)
returns table (
  supplier_id uuid,
  status text,
  is_published boolean,
  approved_at timestamptz,
  launch_credits_awarded_at timestamptz,
  credits_balance int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier public.suppliers%rowtype;
  v_now timestamptz := now();
  v_credit_result record;
begin
  select *
  into v_supplier
  from public.suppliers
  where id = p_supplier_id
  for update;

  if not found then
    raise exception 'SUPPLIER_NOT_FOUND';
  end if;

  update public.suppliers
  set
    status = 'approved',
    is_published = true,
    approved_at = coalesce(approved_at, v_now),
    approved_by = coalesce(p_admin_user_id, approved_by),
    rejected_at = null,
    admin_notes = coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), admin_notes),
    updated_at = v_now
  where id = p_supplier_id;

  if v_supplier.launch_credits_awarded_at is null then
    select *
    into v_credit_result
    from public.apply_credit_delta(
      p_supplier_id,
      25,
      'launch_offer',
      'Launch offer: 25 free credits',
      'supplier_application',
      p_supplier_id,
      p_admin_user_id
    );

    update public.suppliers
    set launch_credits_awarded_at = v_now
    where id = p_supplier_id;
  end if;

  return query
  select
    s.id,
    s.status,
    s.is_published,
    s.approved_at,
    s.launch_credits_awarded_at,
    coalesce(s.credits_balance, 0)
  from public.suppliers s
  where s.id = p_supplier_id;
end;
$$;

revoke all on function public.admin_approve_supplier_application(uuid, uuid, text) from public;
revoke all on function public.admin_approve_supplier_application(uuid, uuid, text) from anon;
revoke all on function public.admin_approve_supplier_application(uuid, uuid, text) from authenticated;
grant execute on function public.admin_approve_supplier_application(uuid, uuid, text) to service_role;

-- Guard restricted moderation/publish columns for non-admin authenticated users.
create or replace function public.enforce_supplier_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role/background jobs bypass via missing auth uid.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_current_user_admin() then
    return new;
  end if;

  -- Enforce only for supplier owners editing their own row.
  if old.auth_user_id = auth.uid() then
    if new.is_published is distinct from old.is_published
      or new.status is distinct from old.status
      or new.submitted_at is distinct from old.submitted_at
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
      or new.rejected_at is distinct from old.rejected_at
      or new.admin_notes is distinct from old.admin_notes
      or new.launch_credits_awarded_at is distinct from old.launch_credits_awarded_at
      or new.credits_balance is distinct from old.credits_balance
    then
      raise exception 'Not allowed to modify moderation/publish fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_supplier_moderation_fields on public.suppliers;
create trigger trg_enforce_supplier_moderation_fields
before update on public.suppliers
for each row
execute function public.enforce_supplier_moderation_fields();
