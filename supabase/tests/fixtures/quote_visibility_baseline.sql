-- ISOLATED TEST DATABASE ONLY. Minimal relations needed by the audited policies.
-- No production rows; old Customer policies are loaded from the existing migration.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login password 'fixture-password' noinherit;
grant anon, authenticated, service_role to authenticator;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table public.user_profiles(user_id uuid primary key, role text);
create table public.user_roles(user_id uuid, role text);
create table public.customers(id uuid primary key, user_id uuid, full_name text);
create table public.suppliers(id uuid primary key, auth_user_id uuid);
create table public.enquiries(id uuid primary key, customer_id uuid references customers, customer_user_id uuid);
create table public.enquiry_suppliers(id uuid primary key, enquiry_id uuid references enquiries, supplier_id uuid references suppliers);
create type public.quote_status as enum ('draft','sent','accepted','declined','closed');
create table public.quotes(id uuid primary key, enquiry_id uuid references enquiries, supplier_id uuid references suppliers, status quote_status, quote_text text);
create table public.quote_items(id uuid primary key, quote_id uuid references quotes, title text);
create table public.quote_events(id uuid primary key, quote_id uuid references quotes, meta jsonb);
create table public.quote_public_links(id uuid primary key, quote_id uuid unique references quotes, token uuid unique, revoked_at timestamptz);
create table public.message_threads(id uuid primary key, enquiry_id uuid references enquiries, quote_id uuid references quotes, supplier_id uuid references suppliers);
create table public.messages(id uuid primary key, thread_id uuid references message_threads, body text, created_at timestamptz);
-- Mirrors the existing lookup helpers, solely in this disposable database.
create function public.is_admin() returns boolean language sql stable security definer as $$
 select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin')
$$;
create function public.supplier_id_for_user() returns uuid language sql stable security definer as $$
 select id from public.suppliers where auth_user_id=auth.uid() limit 1
$$;
grant all on all tables in schema public to anon, authenticated, service_role;
alter table public.user_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.enquiries enable row level security;
alter table public.enquiry_suppliers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_events enable row level security;
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
create policy quotes_admin_all on public.quotes for all using(public.is_admin()) with check(public.is_admin());
create policy quotes_supplier_select_own on public.quotes for select using(supplier_id=public.supplier_id_for_user());
create policy quotes_supplier_update_own on public.quotes for update using(supplier_id=public.supplier_id_for_user()) with check(supplier_id=public.supplier_id_for_user());
create policy quote_items_admin_all on public.quote_items for all using(public.is_admin()) with check(public.is_admin());
create policy quote_items_supplier_select_own on public.quote_items for select using(exists(select 1 from public.quotes q where q.id=quote_id and q.supplier_id=public.supplier_id_for_user()));
create policy enquiries_select_admin on public.enquiries for select using(public.is_admin());
create policy customers_select_admin on public.customers for select using(public.is_admin());
