-- PR17: Supplier-managed public listing fields + images metadata

alter table if exists public.suppliers
  add column if not exists listed_publicly boolean not null default false,
  add column if not exists short_description text null,
  add column if not exists about text null,
  add column if not exists services text[] not null default '{}'::text[],
  add column if not exists location_label text null,
  add column if not exists listing_categories text[] not null default '{}'::text[];

-- Backfill listing visibility from existing publish flag (if present).
update public.suppliers
set listed_publicly = coalesce(is_published, false)
where listed_publicly = false
  and is_published is not null;

create index if not exists suppliers_listed_publicly_idx
  on public.suppliers (listed_publicly);

create table if not exists public.supplier_images (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  type text not null check (type in ('hero', 'gallery')),
  path text not null,
  url text null,
  caption text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists supplier_images_supplier_type_sort_idx
  on public.supplier_images (supplier_id, type, sort_order);

alter table if exists public.supplier_images enable row level security;

-- Ensure only one hero image row per supplier.
create unique index if not exists supplier_images_single_hero_idx
  on public.supplier_images (supplier_id)
  where type = 'hero';

insert into storage.buckets (id, name, public)
values ('supplier-gallery', 'supplier-gallery', true)
on conflict (id) do nothing;
