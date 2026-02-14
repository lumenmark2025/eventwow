# PR22 UAT Checklist: Programmatic SEO Category + Location Pages

## 1) Apply migration
- Run:
  - `supabase/migrations/20260214_programmatic_seo_supplier_indexes.sql`

## 2) Route checks
- Open:
  - `/category/pizza-catering/lancaster`
  - `/category/pizza-catering`
  - `/location/lancaster`
  - `/pizza-catering/lancaster` (pretty alias)
- Confirm each route renders the landing page and supplier grid.

## 3) API checks
- Call:
  - `/api/public-suppliers-by-category-location?categorySlug=pizza-catering&locationSlug=lancaster`
- Confirm response shape:
  - `rows[]` with supplier card fields
  - `totalCount`
  - `categoryName`, `locationName`
- Confirm only published/listed suppliers are returned.

## 4) SEO metadata
- For `/category/pizza-catering/lancaster`, verify:
  - title: `Pizza Catering in Lancaster | Eventwow`
  - description mentions category + location
  - canonical points to `https://eventwow.co.uk/category/pizza-catering/lancaster`
- Confirm canonical is not pointing to local host in production.

## 5) Content checks
- Hero H1 should be dynamic:
  - `Pizza Catering in Lancaster`
- Supplier grid should use `SupplierCard`.
- Verify cards are filtered correctly by category + location intent.

## 6) Empty state
- Use a combination with no matches.
- Confirm message:
  - `We couldn't find any suppliers for ... yet.`
- Confirm CTA links:
  - browse category
  - browse all suppliers
  - supplier join/contact prompt

## 7) Sitemap and discoverability
- Verify `public/sitemap.xml` includes new landing URLs.
- Verify `public/robots.txt` still references sitemap.

