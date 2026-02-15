-- PR31c: Customer accounts + role profiles + customer-owned enquiry access.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'supplier', 'customer', 'venue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_role_idx
  on public.user_profiles (role);

alter table if exists public.customers
  add column if not exists user_id uuid null references auth.users(id) on delete cascade;

create unique index if not exists customers_user_id_unique_idx
  on public.customers (user_id)
  where user_id is not null;

create index if not exists customers_user_id_idx
  on public.customers (user_id);

alter table if exists public.enquiries
  add column if not exists customer_id uuid null references public.customers(id) on delete set null,
  add column if not exists customer_user_id uuid null references auth.users(id) on delete set null;

create index if not exists enquiries_customer_id_idx
  on public.enquiries (customer_id);

create index if not exists enquiries_customer_user_id_idx
  on public.enquiries (customer_user_id);

create or replace function public.find_auth_user_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(coalesce(p_email, ''))
  limit 1
$$;

revoke all on function public.find_auth_user_by_email(text) from public;

alter table if exists public.user_profiles enable row level security;
alter table if exists public.customers enable row level security;
alter table if exists public.enquiries enable row level security;
alter table if exists public.enquiry_suppliers enable row level security;
alter table if exists public.quotes enable row level security;
alter table if exists public.message_threads enable row level security;
alter table if exists public.messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_select_own'
  ) then
    create policy user_profiles_select_own
      on public.user_profiles
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_own'
  ) then
    create policy customers_select_own
      on public.customers
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'enquiries' and policyname = 'enquiries_select_own_customer'
  ) then
    create policy enquiries_select_own_customer
      on public.enquiries
      for select
      to authenticated
      using (
        customer_user_id = auth.uid()
        or customer_id in (
          select c.id from public.customers c where c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'enquiry_suppliers' and policyname = 'enquiry_suppliers_select_customer_owned'
  ) then
    create policy enquiry_suppliers_select_customer_owned
      on public.enquiry_suppliers
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.enquiries e
          where e.id = enquiry_suppliers.enquiry_id
            and (
              e.customer_user_id = auth.uid()
              or e.customer_id in (
                select c.id from public.customers c where c.user_id = auth.uid()
              )
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_select_customer_owned'
  ) then
    create policy quotes_select_customer_owned
      on public.quotes
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.enquiries e
          where e.id = quotes.enquiry_id
            and (
              e.customer_user_id = auth.uid()
              or e.customer_id in (
                select c.id from public.customers c where c.user_id = auth.uid()
              )
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'message_threads' and policyname = 'message_threads_select_customer_owned'
  ) then
    create policy message_threads_select_customer_owned
      on public.message_threads
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.enquiries e
          where e.id = message_threads.enquiry_id
            and (
              e.customer_user_id = auth.uid()
              or e.customer_id in (
                select c.id from public.customers c where c.user_id = auth.uid()
              )
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_select_customer_owned'
  ) then
    create policy messages_select_customer_owned
      on public.messages
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.message_threads mt
          join public.enquiries e on e.id = mt.enquiry_id
          where mt.id = messages.thread_id
            and (
              e.customer_user_id = auth.uid()
              or e.customer_id in (
                select c.id from public.customers c where c.user_id = auth.uid()
              )
            )
        )
      );
  end if;
end
$$;
