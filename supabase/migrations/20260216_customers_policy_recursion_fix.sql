-- Fix: prevent recursive RLS policy evaluation on public.customers.
-- Symptom: "infinite recursion detected in policy for relation \"customers\""
-- Scope: replace only SELECT policies on customers with canonical non-recursive policies.

alter table if exists public.customers enable row level security;

do $$
declare
  pol record;
begin
  -- Remove any existing SELECT/ALL policies (including legacy/recursive ones).
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.customers', pol.policyname);
  end loop;

  -- Customers can read their own record.
  create policy customers_select_own
    on public.customers
    for select
    to authenticated
    using (user_id = auth.uid());

  -- Admin users can read all customers (used by admin enquiries screens).
  create policy customers_select_admin
    on public.customers
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.role = 'admin'
      )
    );
end
$$;
