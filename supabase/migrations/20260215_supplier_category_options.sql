-- PR31f/PR31: DB-driven supplier category options

create table if not exists public.supplier_category_options (
  slug text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists supplier_category_options_label_unique_idx
  on public.supplier_category_options (lower(label));

alter table if exists public.supplier_category_options enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_category_options'
      and policyname = 'supplier_category_options_select_public'
  ) then
    create policy supplier_category_options_select_public
      on public.supplier_category_options
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

-- Seed (idempotent)
insert into public.supplier_category_options (slug, label)
values
  ('pizza-catering', 'Pizza Catering'),
  ('photographers', 'Photographers'),
  ('djs', 'DJs'),
  ('venues', 'Venues'),
  ('florists', 'Florists'),
  ('bands', 'Bands'),
  ('decor', 'Decor'),
  ('cakes', 'Cakes'),
  ('wedding-catering', 'Wedding Catering'),
  ('private-chef', 'Private Chef')
on conflict (slug) do update
set label = excluded.label;

