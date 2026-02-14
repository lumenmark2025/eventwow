-- PR19: Customer shortlist selections per enquiry (token-gated via /api only)

create table if not exists public.enquiry_shortlists (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (enquiry_id, supplier_id)
);

create index if not exists enquiry_shortlists_enquiry_idx
  on public.enquiry_shortlists (enquiry_id);

create index if not exists enquiry_shortlists_supplier_created_desc_idx
  on public.enquiry_shortlists (supplier_id, created_at desc);

alter table if exists public.enquiry_shortlists enable row level security;
