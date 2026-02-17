-- PR A+B: Supplier trust signals (insured + FHRS cache fields)
-- Keep visibility logic on is_published only.

alter table if exists public.suppliers
  add column if not exists is_insured boolean not null default false,
  add column if not exists fsa_rating_url text null,
  add column if not exists fsa_establishment_id integer null,
  add column if not exists fsa_rating_value text null,
  add column if not exists fsa_rating_date timestamptz null,
  add column if not exists fsa_rating_last_fetched_at timestamptz null;

create index if not exists suppliers_fsa_establishment_id_idx
  on public.suppliers (fsa_establishment_id);
