-- Ensure quotes_status_check allows the new terminal status: closed
ALTER TABLE IF EXISTS public.quotes
  DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE IF EXISTS public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'closed'));
