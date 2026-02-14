-- PR22: indexes to support programmatic SEO landing-page filtering.

create index if not exists suppliers_is_published_idx
  on public.suppliers (is_published);

create index if not exists suppliers_base_city_lower_idx
  on public.suppliers ((lower(base_city)));

create index if not exists suppliers_location_label_lower_idx
  on public.suppliers ((lower(location_label)));

create index if not exists suppliers_listing_categories_gin_idx
  on public.suppliers
  using gin (listing_categories);
