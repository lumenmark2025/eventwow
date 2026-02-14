-- PR20: Supplier performance signals + trust badges support

alter table if exists public.suppliers
  add column if not exists last_active_at timestamptz null;

create index if not exists enquiry_suppliers_supplier_invited_at_idx
  on public.enquiry_suppliers (supplier_id, invited_at desc);

create index if not exists quotes_supplier_sent_at_idx
  on public.quotes (supplier_id, sent_at desc);

create index if not exists quotes_enquiry_supplier_idx
  on public.quotes (enquiry_id, supplier_id);

create or replace view public.supplier_performance_30d as
with window_bounds as (
  select now() - interval '30 days' as since_ts
),
invites as (
  select
    es.supplier_id,
    es.enquiry_id,
    es.invited_at
  from public.enquiry_suppliers es
  cross join window_bounds wb
  where es.invited_at >= wb.since_ts
),
first_sent as (
  select
    q.supplier_id,
    q.enquiry_id,
    min(q.sent_at) as first_sent_at
  from public.quotes q
  where q.sent_at is not null
    and q.status in ('sent', 'accepted', 'declined', 'closed')
  group by q.supplier_id, q.enquiry_id
),
response_base as (
  select
    i.supplier_id,
    extract(epoch from (fs.first_sent_at - i.invited_at)) as response_seconds
  from invites i
  join first_sent fs
    on fs.supplier_id = i.supplier_id
   and fs.enquiry_id = i.enquiry_id
  where fs.first_sent_at >= i.invited_at
),
quote_window as (
  select
    q.supplier_id,
    q.id,
    q.status,
    q.sent_at,
    q.accepted_at
  from public.quotes q
  cross join window_bounds wb
  where q.sent_at is not null
    and q.sent_at >= wb.since_ts
    and q.status in ('sent', 'accepted', 'declined', 'closed')
),
rollup as (
  select
    s.id as supplier_id,
    count(distinct i.enquiry_id) as invites_count,
    count(distinct qw.id) as quotes_sent_count,
    count(distinct case when qw.status = 'accepted' then qw.id end) as quotes_accepted_count,
    case
      when count(distinct qw.id) = 0 then null
      else count(distinct case when qw.status = 'accepted' then qw.id end)::numeric
           / count(distinct qw.id)::numeric
    end as acceptance_rate,
    percentile_cont(0.5) within group (order by rb.response_seconds)
      filter (where rb.response_seconds is not null) as response_time_seconds_median,
    max(qw.sent_at) as last_quote_sent_at
  from public.suppliers s
  left join invites i on i.supplier_id = s.id
  left join quote_window qw on qw.supplier_id = s.id
  left join response_base rb on rb.supplier_id = s.id
  group by s.id
)
select
  r.supplier_id,
  r.invites_count,
  r.quotes_sent_count,
  r.quotes_accepted_count,
  r.acceptance_rate,
  r.response_time_seconds_median,
  r.last_quote_sent_at,
  coalesce(s.last_active_at, r.last_quote_sent_at, s.updated_at, s.created_at) as last_active_at
from rollup r
join public.suppliers s on s.id = r.supplier_id;
