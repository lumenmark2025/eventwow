-- PR1: Supplier bookings foundations (sources, bookings, secure access links)

create table if not exists public.supplier_booking_sources (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists supplier_booking_sources_supplier_name_unique_idx
  on public.supplier_booking_sources (supplier_id, lower(name));

create index if not exists supplier_booking_sources_supplier_idx
  on public.supplier_booking_sources (supplier_id);

create table if not exists public.supplier_bookings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  origin_type text not null default 'external',
  source_id uuid null references public.supplier_booking_sources(id) on delete set null,
  source_name text null,
  event_date date not null,
  start_time time null,
  end_time time null,
  location_text text null,
  venue_id uuid null references public.venues(id) on delete set null,
  customer_name text null,
  customer_email text null,
  customer_phone text null,
  guest_count integer null,
  value_gross numeric(10, 2) null,
  deposit_amount numeric(10, 2) null,
  balance_amount numeric(10, 2) null,
  is_deposit_paid boolean not null default false,
  deposit_paid_at timestamptz null,
  is_balance_paid boolean not null default false,
  balance_paid_at timestamptz null,
  status text not null default 'confirmed',
  supplier_notes text null,
  enquiry_id uuid null references public.enquiries(id) on delete set null,
  quote_id uuid null references public.quotes(id) on delete set null,
  message_thread_id uuid null references public.message_threads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.supplier_bookings
  drop constraint if exists supplier_bookings_origin_type_check;

alter table if exists public.supplier_bookings
  add constraint supplier_bookings_origin_type_check
  check (origin_type in ('eventwow', 'external'));

alter table if exists public.supplier_bookings
  drop constraint if exists supplier_bookings_status_check;

alter table if exists public.supplier_bookings
  add constraint supplier_bookings_status_check
  check (status in ('draft', 'confirmed', 'cancelled', 'completed'));

create index if not exists supplier_bookings_supplier_event_date_idx
  on public.supplier_bookings (supplier_id, event_date);

create index if not exists supplier_bookings_enquiry_idx
  on public.supplier_bookings (enquiry_id);

create index if not exists supplier_bookings_quote_idx
  on public.supplier_bookings (quote_id);

create index if not exists supplier_bookings_thread_idx
  on public.supplier_bookings (message_thread_id);

create table if not exists public.booking_access_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.supplier_bookings(id) on delete cascade,
  token_hash text not null,
  created_by_user_id uuid null references auth.users(id),
  expires_at timestamptz null,
  used_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists booking_access_links_booking_idx
  on public.booking_access_links (booking_id);

create unique index if not exists booking_access_links_token_hash_unique_idx
  on public.booking_access_links (token_hash);

create or replace function public.ensure_supplier_booking_sources(p_supplier_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.supplier_booking_sources (supplier_id, name, is_default, is_active)
  values
    (p_supplier_id, 'Phone', true, true),
    (p_supplier_id, 'Text', true, true),
    (p_supplier_id, 'Email', true, true),
    (p_supplier_id, 'Website', true, true),
    (p_supplier_id, 'Walk-in', true, true),
    (p_supplier_id, 'Poptop', true, true),
    (p_supplier_id, 'Add to Event', true, true),
    (p_supplier_id, 'Togather', true, true),
    (p_supplier_id, 'Instagram', true, true),
    (p_supplier_id, 'Facebook', true, true)
  on conflict (supplier_id, lower(name)) do nothing;
end
$$;

revoke all on function public.ensure_supplier_booking_sources(uuid) from public;
grant execute on function public.ensure_supplier_booking_sources(uuid) to authenticated, service_role;

create or replace function public.is_supplier_owner(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.suppliers s
    where s.id = p_supplier_id
      and s.auth_user_id = auth.uid()
  )
$$;

revoke all on function public.is_supplier_owner(uuid) from public;
grant execute on function public.is_supplier_owner(uuid) to authenticated;

alter table public.supplier_booking_sources enable row level security;
alter table public.supplier_bookings enable row level security;
alter table public.booking_access_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_booking_sources'
      and policyname = 'supplier_booking_sources_owner_all'
  ) then
    create policy supplier_booking_sources_owner_all
      on public.supplier_booking_sources
      for all
      to authenticated
      using (public.is_supplier_owner(supplier_id))
      with check (public.is_supplier_owner(supplier_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_bookings'
      and policyname = 'supplier_bookings_owner_all'
  ) then
    create policy supplier_bookings_owner_all
      on public.supplier_bookings
      for all
      to authenticated
      using (public.is_supplier_owner(supplier_id))
      with check (public.is_supplier_owner(supplier_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'booking_access_links'
      and policyname = 'booking_access_links_owner_all'
  ) then
    create policy booking_access_links_owner_all
      on public.booking_access_links
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.supplier_bookings b
          where b.id = booking_id
            and public.is_supplier_owner(b.supplier_id)
        )
      )
      with check (
        exists (
          select 1
          from public.supplier_bookings b
          where b.id = booking_id
            and public.is_supplier_owner(b.supplier_id)
        )
      );
  end if;
end
$$;
