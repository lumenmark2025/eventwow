-- PR: Supplier travel radius + postcode geocode cache for distance filtering.

alter table if exists public.suppliers
  add column if not exists travel_radius_miles integer not null default 30,
  add column if not exists base_postcode text null,
  add column if not exists base_lat double precision null,
  add column if not exists base_lng double precision null;

alter table if exists public.suppliers
  drop constraint if exists suppliers_travel_radius_miles_check;

alter table if exists public.suppliers
  add constraint suppliers_travel_radius_miles_check
  check (travel_radius_miles between 1 and 500);

create index if not exists suppliers_base_postcode_idx
  on public.suppliers (base_postcode);

create index if not exists suppliers_base_lat_lng_idx
  on public.suppliers (base_lat, base_lng);

create table if not exists public.postcode_cache (
  postcode text primary key,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

create index if not exists postcode_cache_updated_at_idx
  on public.postcode_cache (updated_at desc);
