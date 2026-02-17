-- PR31h: suppliers.is_published is the single source of truth for supplier visibility.
-- This migration removes legacy suppliers.listed_publicly without using CASCADE.
--
-- Optional preflight checks you can run manually before this migration:
-- 1) Views:
--    select view_schema, view_name
--    from information_schema.view_column_usage
--    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'listed_publicly';
-- 2) Functions:
--    select n.nspname as schema_name, p.proname as function_name
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where lower(pg_get_functiondef(p.oid)) like '%public.suppliers%'
--      and lower(pg_get_functiondef(p.oid)) like '%listed_publicly%';
-- 3) Policies:
--    select schemaname, tablename, policyname
--    from pg_policies
--    where lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%suppliers%'
--      and lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%listed_publicly%';

do $$
declare
  dep_views text;
  dep_functions text;
  dep_policies text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suppliers'
      and column_name = 'listed_publicly'
  ) then
    return;
  end if;

  -- Stop early if any views still depend on the column.
  select string_agg(format('%I.%I', view_schema, view_name), ', ')
  into dep_views
  from information_schema.view_column_usage
  where table_schema = 'public'
    and table_name = 'suppliers'
    and column_name = 'listed_publicly';

  if dep_views is not null then
    raise exception 'Cannot drop public.suppliers.listed_publicly; dependent views found: %', dep_views;
  end if;

  -- Stop early if SQL functions still reference the column with suppliers.
  select string_agg(format('%I.%I', n.nspname, p.proname), ', ')
  into dep_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and lower(pg_get_functiondef(p.oid)) like '%listed_publicly%'
    and lower(pg_get_functiondef(p.oid)) like '%suppliers%';

  if dep_functions is not null then
    raise exception 'Cannot drop public.suppliers.listed_publicly; dependent functions found: %', dep_functions;
  end if;

  -- Stop early if RLS policies still reference suppliers.listed_publicly.
  select string_agg(format('%I.%I (%I)', schemaname, tablename, policyname), ', ')
  into dep_policies
  from pg_policies
  where lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%listed_publicly%'
    and lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%suppliers%';

  if dep_policies is not null then
    raise exception 'Cannot drop public.suppliers.listed_publicly; dependent policies found: %', dep_policies;
  end if;

  -- Transitional data alignment before dropping the column.
  execute $sql$
    update public.suppliers
    set listed_publicly = is_published
    where listed_publicly is distinct from is_published
  $sql$;

  drop index if exists public.suppliers_listed_publicly_idx;
  alter table public.suppliers drop column if exists listed_publicly;
end
$$;
