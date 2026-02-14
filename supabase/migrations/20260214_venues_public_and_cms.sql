-- PR20a: Venues public directory/profile + admin CMS schema

alter table public.venues
  add column if not exists location_label text null,
  add column if not exists address text null,
  add column if not exists guest_min int null,
  add column if not exists guest_max int null,
  add column if not exists short_description text null,
  add column if not exists about text null,
  add column if not exists facilities jsonb null,
  add column if not exists listed_publicly boolean not null default false,
  add column if not exists updated_by_user uuid null;

-- compatibility with legacy publish flag (if old column exists)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'is_published'
  ) then
    execute $sql$
      update public.venues
      set listed_publicly = coalesce(listed_publicly, is_published, false)
      where listed_publicly is distinct from coalesce(is_published, false)
    $sql$;
  end if;
end
$$;

create index if not exists venues_listed_publicly_created_desc_idx
  on public.venues (listed_publicly, created_at desc);

create unique index if not exists venues_slug_unique_idx
  on public.venues (slug);

create table if not exists public.venue_images (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  type text not null check (type in ('hero', 'gallery')),
  path text not null,
  caption text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists venue_images_venue_type_sort_idx
  on public.venue_images (venue_id, type, sort_order);

create table if not exists public.venue_suppliers_link (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (venue_id, supplier_id)
);

create index if not exists venue_suppliers_link_venue_idx
  on public.venue_suppliers_link (venue_id);

create index if not exists venue_suppliers_link_supplier_idx
  on public.venue_suppliers_link (supplier_id);

alter table public.venues enable row level security;
alter table public.venue_images enable row level security;
alter table public.venue_suppliers_link enable row level security;
