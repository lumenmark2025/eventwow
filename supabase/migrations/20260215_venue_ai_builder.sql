-- PR31: AI Assisted Venue Builder support fields + admin usage log for rate limiting.

alter table public.venues
  add column if not exists ai_tags text[] not null default '{}',
  add column if not exists ai_suggested_search_terms text[] not null default '{}',
  add column if not exists ai_draft_meta jsonb not null default '{}'::jsonb,
  add column if not exists ai_generated_at timestamptz null;

create index if not exists venues_ai_generated_at_idx
  on public.venues (ai_generated_at desc nulls last);

create table if not exists public.admin_ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  feature text not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_ai_usage_logs_user_feature_created_idx
  on public.admin_ai_usage_logs (user_id, feature, created_at desc);

alter table public.admin_ai_usage_logs enable row level security;
