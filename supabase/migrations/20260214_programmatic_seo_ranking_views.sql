-- PR22: Marketplace ranking features + SEO slug helper views

create or replace view public.marketplace_stats_30d as
select
  coalesce(sum(sp.quotes_sent_count), 0)::int as sent_count_30d,
  coalesce(sum(sp.quotes_accepted_count), 0)::int as accepted_count_30d,
  case
    when coalesce(sum(sp.quotes_sent_count), 0) <= 0 then 0::numeric
    else coalesce(sum(sp.quotes_accepted_count), 0)::numeric / sum(sp.quotes_sent_count)::numeric
  end as global_acceptance_rate_30d
from public.supplier_performance_30d sp;

do $$
declare
  has_plan_type boolean;
  view_sql text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suppliers'
      and column_name = 'plan_type'
  ) into has_plan_type;

  view_sql := format($sql$
    create or replace view public.supplier_rank_features_30d as
    with base as (
      select
        s.id as supplier_id,
        coalesce(sp.quotes_sent_count, 0)::int as quotes_sent_30d,
        coalesce(sp.quotes_accepted_count, 0)::int as accepted_30d,
        case
          when sp.response_time_seconds_median is null then null
          else greatest(sp.response_time_seconds_median / 60.0, 1.0)
        end as response_time_median_minutes_30d,
        coalesce(sp.last_active_at, s.last_active_at, s.updated_at, s.created_at) as last_active_at,
        coalesce(s.is_verified, false) as is_verified,
        %s as plan_type,
        coalesce(sp.acceptance_rate, 0)::numeric as acceptance_rate_30d
      from public.suppliers s
      left join public.supplier_performance_30d sp
        on sp.supplier_id = s.id
    ),
    p0 as (
      select coalesce(global_acceptance_rate_30d, 0)::numeric as global_acceptance_rate_30d
      from public.marketplace_stats_30d
    ),
    scored as (
      select
        b.*,
        ((b.accepted_30d + (10 * p0.global_acceptance_rate_30d)) / (b.quotes_sent_30d + 10.0))::numeric as smoothed_acceptance,
        case
          when b.response_time_median_minutes_30d is null then 0.5::numeric
          else (
            1 - least(
              greatest(
                (
                  ln(b.response_time_median_minutes_30d) - ln(30.0)
                ) / (
                  ln(1440.0) - ln(30.0)
                ),
                0.0
              ),
              1.0
            )
          )::numeric
        end as response_score,
        exp(-ln(2) * greatest(extract(epoch from (now() - b.last_active_at)) / 86400.0, 0.0) / 14.0)::numeric as activity_score,
        (1 - exp(-b.quotes_sent_30d / 10.0))::numeric as volume_score
      from base b
      cross join p0
    )
    select
      supplier_id,
      quotes_sent_30d,
      accepted_30d,
      response_time_median_minutes_30d,
      last_active_at,
      is_verified,
      plan_type,
      acceptance_rate_30d,
      smoothed_acceptance,
      response_score,
      activity_score,
      volume_score,
      (
        0.45 * smoothed_acceptance +
        0.25 * response_score +
        0.20 * activity_score +
        0.10 * volume_score
      )::numeric as base_quality
    from scored
  $sql$,
  case when has_plan_type then 'coalesce(nullif(trim(lower(s.plan_type)), ''''), ''free'')' else '''free''' end);

  execute view_sql;
end
$$;

create or replace view public.seo_category_slugs as
select distinct
  lower(regexp_replace(regexp_replace(cat, '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) as category_slug
from public.suppliers s
cross join lateral unnest(coalesce(s.listing_categories, '{}'::text[])) as cat
where coalesce(s.is_published, false) = true
  and trim(coalesce(cat, '')) <> '';

create or replace view public.seo_location_slugs as
select distinct
  lower(regexp_replace(regexp_replace(loc, '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) as location_slug
from (
  select nullif(trim(coalesce(s.location_label, '')), '') as loc
  from public.suppliers s
  where coalesce(s.is_published, false) = true
  union all
  select nullif(trim(coalesce(s.base_city, '')), '') as loc
  from public.suppliers s
  where coalesce(s.is_published, false) = true
) x
where loc is not null;

revoke all on public.marketplace_stats_30d from anon, authenticated;
revoke all on public.supplier_rank_features_30d from anon, authenticated;
