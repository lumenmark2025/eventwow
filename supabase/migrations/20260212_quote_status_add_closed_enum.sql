-- Ensure quote_status enum supports supplier manual close state
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'quote_status' AND n.nspname = 'public'
  ) THEN
    ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'closed';
  END IF;
END
$$;
