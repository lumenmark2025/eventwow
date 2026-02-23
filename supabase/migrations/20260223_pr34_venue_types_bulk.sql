-- PR34: Venue types catalog for admin bulk venue add + type management.

create table if not exists public.venue_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists venue_types_name_unique_idx
  on public.venue_types (lower(name));

create unique index if not exists venue_types_slug_unique_idx
  on public.venue_types (lower(slug));

alter table if exists public.venues
  add column if not exists type text null;

insert into public.venue_types (name, slug)
values
  ('Hotel', 'hotel'),
  ('Wedding Barn', 'wedding-barn'),
  ('Village Hall', 'village-hall'),
  ('Manor House', 'manor-house'),
  ('Country House', 'country-house'),
  ('Castle', 'castle'),
  ('Farm', 'farm'),
  ('Restaurant', 'restaurant'),
  ('Marquee Site', 'marquee-site'),
  ('Outdoor', 'outdoor'),
  ('Other', 'other')
on conflict do nothing;

alter table public.venue_types enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_types'
      and policyname = 'venue_types_select_public'
  ) then
    create policy venue_types_select_public
      on public.venue_types
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_types'
      and policyname = 'venue_types_insert_admin'
  ) then
    create policy venue_types_insert_admin
      on public.venue_types
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'admin'
        )
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = 'admin'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_types'
      and policyname = 'venue_types_update_admin'
  ) then
    create policy venue_types_update_admin
      on public.venue_types
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'admin'
        )
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = 'admin'
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'admin'
        )
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = 'admin'
        )
      );
  end if;
end
$$;
