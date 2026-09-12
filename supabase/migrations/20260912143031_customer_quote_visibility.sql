-- Narrow the existing Customer SELECT path; Supplier/Admin policies are unchanged.
-- No data rewrite, new columns, or changes to service-role API contracts.
begin;

alter policy quotes_select_customer_owned on public.quotes
  to authenticated
  using (
    status in ('sent', 'accepted', 'declined', 'closed')
    and exists (
      select 1 from public.enquiries e
      where e.id = quotes.enquiry_id
        and (
          e.customer_user_id = (select auth.uid())
          or e.customer_id in (
            select c.id from public.customers c where c.user_id = (select auth.uid())
          )
        )
    )
  );

-- Do not expose a draft's conversation through the enquiry-owned thread path.
-- messages_select_customer_owned already reads message_threads under RLS, so it
-- inherits this restriction without adding another policy or bypass function.
alter policy message_threads_select_customer_owned on public.message_threads
  to authenticated
  using (
    exists (
      select 1 from public.enquiries e
      where e.id = message_threads.enquiry_id
        and (
          e.customer_user_id = (select auth.uid())
          or e.customer_id in (
            select c.id from public.customers c where c.user_id = (select auth.uid())
          )
        )
    )
    and (
      -- Preserve enquiry-only conversations if present in an older deployment.
      quote_id is null
      or exists (
        select 1 from public.quotes q
        where q.id = message_threads.quote_id
          and q.enquiry_id = message_threads.enquiry_id
          and q.status in ('sent', 'accepted', 'declined', 'closed')
      )
    )
  );

-- Tokens are capabilities, not public catalog data. All application access to
-- this table is through server-side handlers using service_role. Keep Admin
-- access, and deny direct anonymous/Customer/Supplier token enumeration/writes.
alter table public.quote_public_links enable row level security;
create policy quote_public_links_admin_all on public.quote_public_links
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
