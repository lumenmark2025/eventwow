-- PR21: Supplier reviews (moderated) + rating aggregates

create table if not exists public.supplier_reviews (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  enquiry_id uuid null references public.enquiries(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  review_text text not null default '',
  reviewer_name text not null default '',
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists supplier_reviews_supplier_idx
  on public.supplier_reviews (supplier_id);

create index if not exists supplier_reviews_approved_idx
  on public.supplier_reviews (is_approved);

create or replace view public.supplier_review_stats as
select
  r.supplier_id,
  avg(r.rating)::numeric(3,2) as average_rating,
  count(*)::int as review_count
from public.supplier_reviews r
where r.is_approved = true
group by r.supplier_id;

alter table public.supplier_reviews enable row level security;

drop policy if exists supplier_reviews_public_select_approved on public.supplier_reviews;
create policy supplier_reviews_public_select_approved
  on public.supplier_reviews
  for select
  using (is_approved = true);
