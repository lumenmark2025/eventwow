-- PR18: Public enquiry flow + invite compatibility + token status page support

alter table if exists public.enquiries
  add column if not exists public_token text,
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists event_time text,
  add column if not exists location_label text,
  add column if not exists postcode text,
  add column if not exists category_label text,
  add column if not exists message text;

create unique index if not exists enquiries_public_token_unique_idx
  on public.enquiries (public_token)
  where public_token is not null;

create index if not exists enquiries_created_at_desc_idx
  on public.enquiries (created_at desc);

create index if not exists enquiries_status_idx
  on public.enquiries (status);

create index if not exists enquiry_suppliers_supplier_invited_desc_idx
  on public.enquiry_suppliers (supplier_id, invited_at desc);

alter table if exists public.enquiry_suppliers
  add column if not exists quote_id uuid null references public.quotes(id) on delete set null;

-- Compatibility projection for PR18 naming
do $$
begin
  if not exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'enquiry_invites'
  ) then
    execute $v$
      create view public.enquiry_invites as
      select
        es.id,
        es.enquiry_id,
        es.supplier_id,
        es.supplier_status as status,
        es.invited_at,
        es.responded_at,
        es.quote_id,
        es.declined_reason as note
      from public.enquiry_suppliers es
    $v$;
  end if;
end
$$;
