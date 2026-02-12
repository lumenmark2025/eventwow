-- PR11: Credits ledger (append-only) + quote event audit log

create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  delta int not null,
  balance_after int not null,
  reason text not null,
  note text null,
  related_type text null,
  related_id uuid null,
  created_at timestamptz not null default now(),
  created_by_user uuid null
);

create index if not exists credits_ledger_supplier_created_at_desc_idx
  on public.credits_ledger (supplier_id, created_at desc);

create index if not exists credits_ledger_reason_created_at_desc_idx
  on public.credits_ledger (reason, created_at desc);

create index if not exists credits_ledger_related_idx
  on public.credits_ledger (related_type, related_id);

alter table if exists public.credits_ledger enable row level security;

create table if not exists public.quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  event_type text not null,
  event_at timestamptz not null default now(),
  actor_type text not null,
  actor_user_id uuid null,
  meta jsonb null
);

create index if not exists quote_events_quote_id_event_at_desc_idx
  on public.quote_events (quote_id, event_at desc);

alter table if exists public.quote_events enable row level security;

create or replace function public.apply_credit_delta(
  p_supplier_id uuid,
  p_delta int,
  p_reason text,
  p_note text default null,
  p_related_type text default null,
  p_related_id uuid default null,
  p_created_by_user uuid default null
)
returns table (
  supplier_id uuid,
  credits_balance int,
  ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current int;
  v_next int;
  v_ledger_id uuid;
begin
  select coalesce(s.credits_balance, 0)
  into v_current
  from public.suppliers s
  where s.id = p_supplier_id
  for update;

  if not found then
    raise exception 'SUPPLIER_NOT_FOUND';
  end if;

  v_next := v_current + coalesce(p_delta, 0);
  if v_next < 0 then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.suppliers
  set credits_balance = v_next
  where id = p_supplier_id;

  insert into public.credits_ledger (
    supplier_id,
    delta,
    balance_after,
    reason,
    note,
    related_type,
    related_id,
    created_by_user
  )
  values (
    p_supplier_id,
    coalesce(p_delta, 0),
    v_next,
    coalesce(nullif(trim(p_reason), ''), 'manual'),
    p_note,
    p_related_type,
    p_related_id,
    p_created_by_user
  )
  returning id into v_ledger_id;

  return query
  select p_supplier_id, v_next, v_ledger_id;
end;
$$;

revoke all on function public.apply_credit_delta(uuid, int, text, text, text, uuid, uuid) from public;
revoke all on function public.apply_credit_delta(uuid, int, text, text, text, uuid, uuid) from anon;
revoke all on function public.apply_credit_delta(uuid, int, text, text, text, uuid, uuid) from authenticated;
grant execute on function public.apply_credit_delta(uuid, int, text, text, text, uuid, uuid) to service_role;
