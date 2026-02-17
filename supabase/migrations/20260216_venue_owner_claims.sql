-- PR32: Venue owner claim flow
-- Adds venue owner role support, ownership link table, and claim request table.

-- Allow 'venue_owner' in user profile role constraint (if table/constraint exist).
do $$
declare
  c record;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_profiles'
  ) then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.user_profiles'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%role%'
    loop
      execute format('alter table public.user_profiles drop constraint if exists %I', c.conname);
    end loop;

    alter table public.user_profiles
      add constraint user_profiles_role_check
      check (role in ('admin', 'supplier', 'customer', 'venue', 'venue_owner'));
  end if;
end
$$;

-- Allow 'venue_owner' in user_roles safely across schemas:
-- - If role is enum (actor_role), add enum value.
-- - If role is text/varchar, maintain a role check constraint.
do $$
declare
  c record;
  role_data_type text;
  role_udt_name text;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_roles'
  ) then
    select data_type, udt_name
    into role_data_type, role_udt_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_roles'
      and column_name = 'role'
    limit 1;

    if role_data_type = 'USER-DEFINED' and role_udt_name = 'actor_role' then
      alter type public.actor_role add value if not exists 'venue_owner';
    else
      for c in
        select conname
        from pg_constraint
        where conrelid = 'public.user_roles'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '% role %'
      loop
        execute format('alter table public.user_roles drop constraint if exists %I', c.conname);
      end loop;

      alter table public.user_roles
        add constraint user_roles_role_check
        check (role in ('admin', 'supplier', 'customer', 'venue', 'venue_owner'));
    end if;
  end if;
end
$$;

create table if not exists public.venue_owners_link (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_at_venue text null,
  created_at timestamptz not null default now(),
  unique (venue_id, user_id)
);

create index if not exists venue_owners_link_user_idx
  on public.venue_owners_link (user_id);

create index if not exists venue_owners_link_venue_idx
  on public.venue_owners_link (venue_id);

create table if not exists public.venue_claim_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  requester_email text not null,
  requester_name text not null,
  role_at_venue text null,
  message text null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by_user_id uuid null references auth.users(id),
  approved_user_id uuid null references auth.users(id),
  token_hash text not null,
  token_expires_at timestamptz not null
);

create index if not exists venue_claim_requests_venue_idx
  on public.venue_claim_requests (venue_id);

create index if not exists venue_claim_requests_email_idx
  on public.venue_claim_requests (requester_email);

create index if not exists venue_claim_requests_status_idx
  on public.venue_claim_requests (status);

create index if not exists venue_claim_requests_token_hash_idx
  on public.venue_claim_requests (token_hash);

alter table public.venue_owners_link enable row level security;
alter table public.venue_claim_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_owners_link'
      and policyname = 'venue_owners_link_select_own'
  ) then
    create policy venue_owners_link_select_own
      on public.venue_owners_link
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;
