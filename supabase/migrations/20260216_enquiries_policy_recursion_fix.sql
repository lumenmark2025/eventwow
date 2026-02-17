-- Fix: prevent recursive RLS policy evaluation on public.enquiries.
-- Symptom: "infinite recursion detected in policy for relation \"enquiries\""
-- Scope: replace SELECT/ALL enquiry policies with canonical non-recursive versions
-- and ensure admin CRUD access remains available.

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

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

alter table if exists public.enquiries enable row level security;

do $$
declare
  pol record;
begin
  -- Remove any existing SELECT/ALL policies (including legacy/recursive ones).
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'enquiries'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.enquiries', pol.policyname);
  end loop;

  -- Customer can read their own enquiries.
  create policy enquiries_select_own_customer
    on public.enquiries
    for select
    to authenticated
    using (
      customer_user_id = auth.uid()
      or customer_id in (
        select c.id
        from public.customers c
        where c.user_id = auth.uid()
      )
    );

  -- Admin can read all enquiries.
  create policy enquiries_select_admin
    on public.enquiries
    for select
    to authenticated
    using (public.is_current_user_admin());

  -- Admin can manage enquiries (preserves admin UI create/update flows).
  create policy enquiries_admin_manage
    on public.enquiries
    for all
    to authenticated
    using (public.is_current_user_admin())
    with check (public.is_current_user_admin());
end
$$;

-- Ensure admin CRUD policy exists on customers too (for admin enquiry create flow).
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
      and policyname = 'customers_admin_manage'
  ) then
    create policy customers_admin_manage
      on public.customers
      for all
      to authenticated
      using (public.is_current_user_admin())
      with check (public.is_current_user_admin());
  end if;
end
$$;
