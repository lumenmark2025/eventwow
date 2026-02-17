-- PR31i: Seed category short descriptions used by homepage/browse/category cards.
-- Safe/idempotent updates on canonical supplier category options.

update public.supplier_category_options
set
  display_name = coalesce(nullif(trim(display_name), ''), label),
  short_description = case
    when slug = 'pizza-catering' then 'Wood-fired vans, pop-ups and full service pizza catering for weddings, parties and corporate events.'
    when slug = 'photographers' then 'Find trusted photographers for weddings, parties and brand events - compare style, availability and pricing.'
    when slug = 'djs' then 'Book experienced DJs for any vibe - from background sets to full dancefloor energy.'
    when slug = 'venues' then 'Explore venues for every event style - barns, hotels, halls and unique spaces with clear guest ranges.'
    when slug = 'florists' then 'Seasonal florals, bouquets and installations - perfect for weddings and celebrations.'
    when slug = 'bands' then 'Live music options from acoustic sets to full bands - matched to your event type and budget.'
    when slug = 'decor' then 'Transform your space with decor, styling and hire - from backdrops to table dressing.'
    when slug = 'cakes' then 'Celebration cakes and dessert tables - custom designs, dietary options and delivery-friendly suppliers.'
    else short_description
  end
where slug in ('pizza-catering', 'photographers', 'djs', 'venues', 'florists', 'bands', 'decor', 'cakes');
