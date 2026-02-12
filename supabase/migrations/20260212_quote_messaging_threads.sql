-- PR9: Supplier <-> Customer messaging threads (per quote)

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes(id) on delete cascade,
  enquiry_id uuid null references public.enquiries(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_threads_quote_id_unique_idx
  on public.message_threads (quote_id);

create index if not exists message_threads_supplier_id_idx
  on public.message_threads (supplier_id);

create index if not exists message_threads_updated_at_desc_idx
  on public.message_threads (updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_type text not null check (sender_type in ('supplier', 'customer', 'system')),
  sender_supplier_id uuid null references public.suppliers(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  client_message_id text null,
  meta jsonb null
);

-- Repair path: if earlier attempts created a different column name, normalize to thread_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'message_thread_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE public.messages RENAME COLUMN message_thread_id TO thread_id;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS thread_id uuid;

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS sender_type text;

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS sender_supplier_id uuid;

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS body text;

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS client_message_id text;

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS meta jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_thread_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_thread_id_fkey
      FOREIGN KEY (thread_id) REFERENCES public.message_threads(id) ON DELETE CASCADE;
  END IF;
END
$$;

create index if not exists messages_thread_created_at_idx
  on public.messages (thread_id, created_at);

create unique index if not exists messages_thread_client_message_unique_idx
  on public.messages (thread_id, client_message_id)
  where client_message_id is not null;

create table if not exists public.supplier_thread_state (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  last_read_at timestamptz null,
  unread_count int not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, supplier_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'supplier_thread_state'
      AND column_name = 'message_thread_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'supplier_thread_state'
      AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE public.supplier_thread_state RENAME COLUMN message_thread_id TO thread_id;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.supplier_thread_state
  ADD COLUMN IF NOT EXISTS thread_id uuid;

ALTER TABLE IF EXISTS public.supplier_thread_state
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

ALTER TABLE IF EXISTS public.supplier_thread_state
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

ALTER TABLE IF EXISTS public.supplier_thread_state
  ADD COLUMN IF NOT EXISTS unread_count int not null default 0;

ALTER TABLE IF EXISTS public.supplier_thread_state
  ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

ALTER TABLE IF EXISTS public.supplier_thread_state
  ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

alter table if exists public.message_threads enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.supplier_thread_state enable row level security;

-- Legacy compatibility: if sender_role uses actor_role enum, ensure supplier/customer values exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'actor_role' AND n.nspname = 'public'
  ) THEN
    ALTER TYPE public.actor_role ADD VALUE IF NOT EXISTS 'supplier';
    ALTER TYPE public.actor_role ADD VALUE IF NOT EXISTS 'customer';
  END IF;
END
$$;
