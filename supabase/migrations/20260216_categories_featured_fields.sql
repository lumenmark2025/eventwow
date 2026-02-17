-- PR31g: DB-driven featured categories for homepage + category landing metadata

alter table if exists public.supplier_category_options
  add column if not exists display_name text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_order integer not null default 0,
  add column if not exists icon_key text null,
  add column if not exists short_description text null;

update public.supplier_category_options
set display_name = coalesce(nullif(trim(display_name), ''), label)
where coalesce(nullif(trim(display_name), ''), '') = '';

create unique index if not exists supplier_category_options_display_name_unique_idx
  on public.supplier_category_options (lower(display_name));

create index if not exists supplier_category_options_featured_order_idx
  on public.supplier_category_options (is_featured, featured_order, display_name);

-- Seed featured defaults for homepage (idempotent, safe to re-run)
update public.supplier_category_options
set
  is_featured = true,
  featured_order = case
    when slug = 'pizza-catering' then 10
    when slug = 'photographers' then 20
    when slug = 'djs' then 30
    when slug = 'venues' then 40
    when slug = 'florists' then 50
    when slug = 'bands' then 60
    when slug = 'decor' then 70
    when slug = 'cakes' then 80
    else featured_order
  end
where slug in ('pizza-catering', 'photographers', 'djs', 'venues', 'florists', 'bands', 'decor', 'cakes');
