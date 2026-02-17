-- PR32a seed: featured category copy used by homepage + /categories cards.
-- Upsert by slug so migration is idempotent.

insert into public.supplier_category_options (
  slug,
  label,
  display_name,
  short_description,
  is_featured,
  featured_order,
  is_active,
  updated_at
)
values
  ('pizza-catering', 'Pizza Catering', 'Pizza Catering', 'Wood-fired vans, pop-ups and full service pizza catering for weddings, parties and corporate events.', true, 1, true, now()),
  ('photographers', 'Photographers', 'Photographers', 'Find trusted photographers for weddings, parties and brand events — compare style, availability and pricing.', true, 2, true, now()),
  ('djs', 'DJs', 'DJs', 'Book experienced DJs for any vibe — from background sets to full dancefloor energy.', true, 3, true, now()),
  ('venues', 'Venues', 'Venues', 'Explore venues for every event style — barns, hotels, halls and unique spaces with clear guest ranges.', true, 4, true, now()),
  ('florists', 'Florists', 'Florists', 'Seasonal florals, bouquets and installations — perfect for weddings and celebrations.', true, 5, true, now()),
  ('bands', 'Bands', 'Bands', 'Live music options from acoustic sets to full bands — matched to your event type and budget.', true, 6, true, now()),
  ('decor', 'Decor', 'Decor', 'Transform your space with decor, styling and hire — from backdrops to table dressing.', true, 7, true, now()),
  ('cakes', 'Cakes', 'Cakes', 'Celebration cakes and dessert tables — custom designs, dietary options and delivery-friendly suppliers.', true, 8, true, now())
on conflict (slug) do update
set
  label = excluded.label,
  display_name = excluded.display_name,
  short_description = excluded.short_description,
  is_featured = excluded.is_featured,
  featured_order = excluded.featured_order,
  is_active = excluded.is_active,
  updated_at = now();

