-- PR32a: Admin category management support.
-- Keep existing slug-based linkage model intact while adding admin-friendly fields.

alter table if exists public.supplier_category_options
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_active boolean not null default true,
  add column if not exists display_name text,
  add column if not exists short_description text not null default '',
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_order integer not null default 0;

update public.supplier_category_options
set id = gen_random_uuid()
where id is null;

update public.supplier_category_options
set display_name = coalesce(nullif(trim(display_name), ''), label)
where coalesce(nullif(trim(display_name), ''), '') = '';

update public.supplier_category_options
set short_description = ''
where short_description is null;

create unique index if not exists supplier_category_options_id_unique_idx
  on public.supplier_category_options (id);

alter table if exists public.supplier_category_options
  alter column id set not null;

create unique index if not exists supplier_category_options_slug_unique_idx
  on public.supplier_category_options (lower(slug));

create index if not exists supplier_category_options_active_featured_idx
  on public.supplier_category_options (is_active, is_featured, featured_order, display_name);
