# PR20a UAT Checklist: Venues Public Directory + Pages + Admin CMS

## 1) Apply migration
- Run:
  - `supabase/migrations/20260214_venues_public_and_cms.sql`

## 2) Admin venue CMS
- Open `/admin/venues`.
- Create a new venue.
- Open venue editor and save:
  - name, location label, guest min/max, short description, about, website.
- Toggle `Listed publicly` and save.
- Upload one hero image and 2+ gallery images.
- Reorder gallery and delete one image.
- Link 1+ suppliers and save linked suppliers.

## 3) Public venues directory
- Open `/venues`.
- Confirm only published venues appear.
- Confirm card includes:
  - hero image (or fallback),
  - location label,
  - guest range badge.
- Test search + sort.

## 4) Public venue profile
- Open `/venues/:slug`.
- Confirm hero, about, gallery and CTA render.
- Confirm linked suppliers section appears.
- Confirm linked suppliers only show public-safe fields (no email/phone/private data).

## 5) Security checks
- Unpublished venue slug should return not found in public endpoint.
- Public API responses should exclude private supplier contact details.

## 6) Responsive checks
- `/venues` grid and `/venues/:slug` sections are usable on mobile widths.
- Buttons and tap targets remain easy to use.
