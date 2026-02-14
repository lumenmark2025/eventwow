-- PR20a fix2: keep venues publish flags aligned while transitioning to is_published.

do $$
declare
  has_is_published boolean;
  has_listed_publicly boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'is_published'
  ) into has_is_published;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'listed_publicly'
  ) into has_listed_publicly;

  if has_is_published and has_listed_publicly then
    -- One-time safe sync for rows published by listed_publicly but not by is_published.
    execute $sql$
      update public.venues
      set is_published = true
      where listed_publicly = true
        and coalesce(is_published, false) = false
    $sql$;
  end if;
end
$$;

create or replace function public.sync_venues_publish_flags()
returns trigger
language plpgsql
as $$
begin
  -- is_published is source-of-truth during transition.
  if tg_op = 'INSERT' or new.is_published is distinct from old.is_published then
    new.listed_publicly := coalesce(new.is_published, false);
  elsif new.listed_publicly is distinct from old.listed_publicly then
    new.is_published := coalesce(new.listed_publicly, false);
  end if;
  return new;
end;
$$;

do $$
declare
  has_is_published boolean;
  has_listed_publicly boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'is_published'
  ) into has_is_published;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'listed_publicly'
  ) into has_listed_publicly;

  if has_is_published and has_listed_publicly then
    execute 'drop trigger if exists trg_sync_venues_publish_flags on public.venues';
    execute $sql$
      create trigger trg_sync_venues_publish_flags
      before insert or update on public.venues
      for each row
      execute function public.sync_venues_publish_flags()
    $sql$;
  end if;
end
$$;
