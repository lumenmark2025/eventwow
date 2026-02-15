-- PR31e: Link public enquiries to venues (optional venue-prefilled flow)

alter table if exists public.enquiries
  add column if not exists venue_id uuid null;

do $$
begin
  -- Add FK if missing (covers cases where the column exists already without a constraint)
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'enquiries'
      and column_name = 'venue_id'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'enquiries_venue_id_fkey'
  ) then
    alter table public.enquiries
      add constraint enquiries_venue_id_fkey
      foreign key (venue_id) references public.venues(id) on delete set null;
  end if;
end
$$;

create index if not exists enquiries_venue_id_idx
  on public.enquiries (venue_id);

