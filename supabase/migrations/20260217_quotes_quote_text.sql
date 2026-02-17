-- PR: Supplier quote narrative text
-- Adds a free-text description field to quotes for supplier message content.

alter table if exists public.quotes
  add column if not exists quote_text text null;
