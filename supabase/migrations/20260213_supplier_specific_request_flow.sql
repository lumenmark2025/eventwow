-- PR18 supplier-specific request flow fields

alter table if exists public.enquiries
  add column if not exists venue_name text null,
  add column if not exists serving_time_window text null,
  add column if not exists indoor_outdoor text null,
  add column if not exists dietary_summary text null,
  add column if not exists access_notes text null;

create index if not exists venues_name_idx
  on public.venues (name);

create index if not exists venues_city_idx
  on public.venues (city);
