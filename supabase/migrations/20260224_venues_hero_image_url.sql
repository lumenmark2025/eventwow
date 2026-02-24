-- PR35: Support direct venue hero URL storage for admin AI hero image generation.

alter table if exists public.venues
  add column if not exists hero_image_url text null;

create index if not exists venues_hero_image_url_idx
  on public.venues (hero_image_url);
