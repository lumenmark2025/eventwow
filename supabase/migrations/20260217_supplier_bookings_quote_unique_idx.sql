-- PR4: prevent duplicate Eventwow booking rows per accepted quote.

create unique index if not exists supplier_bookings_quote_id_unique_idx
  on public.supplier_bookings (quote_id)
  where quote_id is not null;
