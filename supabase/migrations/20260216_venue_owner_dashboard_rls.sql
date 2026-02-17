-- PR33: Venue owner dashboard support.
-- Add moderation workflow columns and ownership-based venue update policy.

alter table if exists public.venues
  add column if not exists requires_review boolean not null default false,
  add column if not exists last_submitted_at timestamptz null;

alter table if exists public.venues enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'venues'
      and policyname = 'venues_update_owned_by_venue_owner'
  ) then
    create policy venues_update_owned_by_venue_owner
      on public.venues
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.venue_owners_link vol
          where vol.venue_id = venues.id
            and vol.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.venue_owners_link vol
          where vol.venue_id = venues.id
            and vol.user_id = auth.uid()
        )
      );
  end if;
end
$$;

