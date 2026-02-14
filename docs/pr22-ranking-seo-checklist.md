# PR22 UAT Checklist: Programmatic SEO + Deterministic Ranking

## 1) Apply migrations
- Run:
  - `supabase/migrations/20260214_programmatic_seo_supplier_indexes.sql`
  - `supabase/migrations/20260214_programmatic_seo_ranking_views.sql`

## 2) Public SEO endpoint
- Call:
  - `/api/public/seo/suppliers?slug=pizza-catering-lancaster`
  - `/api/public/seo/suppliers?category_slug=pizza-catering&location_slug=lancaster&page=1&pageSize=24`
- Verify:
  - only published suppliers returned
  - deterministic order on refresh (same params -> same sequence)
  - response includes `meta`, `schema`, `rows`, `totalCount`
  - no raw ranking internals in `rows` DTO (safe fields only)

## 3) Public landing page route
- Open:
  - `/pizza-catering-lancaster`
  - `/wedding-venues-manchester`
- Verify:
  - H1/title generated from slug
  - supplier grid renders
  - canonical set to `https://eventwow.co.uk/<slug>`
  - JSON-LD ItemList is present in page head

## 4) Empty state
- Open a low-probability slug with no matches.
- Verify:
  - clean empty message
  - CTAs to browse category/all suppliers/contact

## 5) Admin ranking breakdown
- Open admin supplier detail page (`/admin/suppliers`, then `View`).
- In `Ranking` section:
  - pick category/location from context selectors
  - verify component scores render:
    - smoothed_acceptance
    - response_score
    - activity_score
    - volume_score
    - base_quality
  - verify match/final render:
    - category_match
    - location_match
    - match
    - verified_bonus
    - plan_multiplier
    - rank_score
  - verify explanation strings are shown.

## 6) Supplier panel ranking card
- Open `/supplier/dashboard`.
- Verify `Your marketplace performance` card shows:
  - smoothed acceptance
  - response summary
  - activity label
  - volume confidence
  - base quality
  - actionable tips
- Verify it does not expose global platform acceptance numbers directly.

## 7) Sitemap expansion
- Open `/sitemap.xml`.
- Verify:
  - base routes included
  - category/location pages included
  - combined SEO slugs included, capped to top categories x locations

## 8) Safety checks
- Confirm `supplier_rank_features_30d` and `marketplace_stats_30d` are not publicly selectable by `anon`/`authenticated`.
- Confirm admin/supplier ranking endpoints require auth as expected.
