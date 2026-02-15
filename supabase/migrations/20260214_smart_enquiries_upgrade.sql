-- PR23: Smart enquiry form fields + quality scoring metadata

alter table if exists public.enquiries
  add column if not exists event_type text null,
  add column if not exists enquiry_category_slug text null,
  add column if not exists event_date date null,
  add column if not exists start_time time null,
  add column if not exists guest_count int null,
  add column if not exists budget_range text null,
  add column if not exists venue_known boolean not null default false,
  add column if not exists venue_name text null,
  add column if not exists venue_postcode text null,
  add column if not exists indoor_outdoor text null,
  add column if not exists power_available boolean null,
  add column if not exists dietary_requirements text null,
  add column if not exists contact_preference text null,
  add column if not exists urgency text null,
  add column if not exists message text null,
  add column if not exists message_quality_score int not null default 0,
  add column if not exists message_quality_flags jsonb not null default '[]'::jsonb,
  add column if not exists structured_answers jsonb not null default '{}'::jsonb,
  add column if not exists source_page text null,
  add column if not exists created_ip_hash text null;

alter table if exists public.enquiries
  drop constraint if exists enquiries_guest_count_pr23_check;

alter table if exists public.enquiries
  add constraint enquiries_guest_count_pr23_check
  check (guest_count is null or guest_count >= 1);

alter table if exists public.enquiries
  drop constraint if exists enquiries_event_type_pr23_check;

alter table if exists public.enquiries
  add constraint enquiries_event_type_pr23_check
  check (
    event_type is null
    or lower(event_type) in ('wedding', 'corporate', 'birthday', 'festival', 'school', 'other')
  );

create index if not exists enquiries_event_type_idx
  on public.enquiries (event_type);

create index if not exists enquiries_category_slug_idx
  on public.enquiries (enquiry_category_slug);

create index if not exists enquiries_created_at_idx
  on public.enquiries (created_at desc);
