# Category and SEO landing UI v2

## Audit before UI changes

Starting at `176b9814e8fdbeda903f294d650c83a18066deb5`, clean `ui-v2-design-system`.

| Route/template | Existing contract |
| --- | --- |
| `/categories` (`/browse` redirects here) | Public category collection; 300ms debounced supplier search, `q`, `page=1`, `pageSize=12`. All category names, descriptions, imagery and links remain. |
| `/categories/:slug` | Active category + ranked suppliers, `page`, `pageSize=24`; previous/next and out-of-range page clamp. Canonical omits pagination while Open Graph also uses the canonical helper. |
| `/category/:categorySlug/:locationSlug`, `/category/:categorySlug`, `/location/:locationSlug` | Existing slug/title normalization; category/location resolved labels; GET `public-suppliers-by-category-location`, optional original slugs plus `limit=48`. |
| `/:slug` | Existing flat category-location resolution via `/api/public/seo/suppliers?slug=…&page=1&pageSize=36`; server title/description and exact ItemList JSON-LD. Client canonical uses the current flat path as before. |
| Build-time `listPageHtml` | Static `/categories`, `/categories/:slug`, supplier/venue directories, listing links and other-category/popular-supplier links. Keep all text, links, head/schema generation, route output and sitemap generation unchanged. |

No separate Venue type/category page, FAQ feed, subcategory tree, nearby-location feed or editorial SEO-body feed exists in these templates. Do not invent them. Generic how-it-works/pricing/contact pages are separate marketing bodies, not these organic listing templates. Request/quote/auth/claim flows remain outside scope.

The dynamic and build-time sitemaps use different existing strategies. `vercel.json` lacks an explicit two-segment `/category/:categorySlug/:locationSlug` rewrite, despite the React route existing. Flat unknown slugs return API 400 rather than a document-level 404. These are pre-existing deployment/SEO limitations; preserve URL and status contracts in this presentation run and document staging checks.

Performance: route imports are already lazy; initial effects duplicate concurrent public reads under StrictMode. Reuse in-flight-only publicGet without settled caching or new requests. Keep 12/24/36/48 result limits, debounce and pagination. Existing DTOs expose original images only. No profile reads are needed. Existing errors currently also show successful empty/zero results; separate states, retain the page's H1/intro, and provide retry. Remount templates on pathname changes to prevent previous-slug metadata/content persisting during navigation.

## Delivered and component reuse

All six existing organic category/location route shapes now use Public UI v2. The `/browse` redirect and catch-all matching order remain unchanged. No Venue category/type route was added. Inter, light canvas, navy text, soft-blue heading sections, orange actions, photo cards and restrained dividers follow the current public implementation. Supplier descriptions remain fully visible; category descriptions are not truncated. Original headings/intro text and successful empty-state guidance are retained. No FAQ, nearby-location or production claim was written.

New shared presentation components: `SeoLandingHeader`, `SeoCategoryCard`, `SeoResults`, `SeoSupplierResults`, `SeoPagination`, represented on `/design-system`. They reuse PublicPageHeader, PublicButton, PublicSearch, ListingImage and SupplierCard. Category/location pages have no supported interactive filters beyond their existing route/query contracts; the existing disabled “Filters (coming soon)” control on the category index remains disabled.

Static `listPageHtml` receives a style-only adapter for its existing directory/category output. `public-tokens.css` is extracted unchanged from the existing public stylesheet, so React and static output use one token source. Static typography reuses Vite's emitted Inter 400/700 assets with system fallback; no fonts are copied or fetched externally. Existing static H1/H2, intro, empty text, listings, other-category/popular-supplier links and markup structure remain intact. Static home/detail bodies remain as before, outside the list-template migration.

## SEO and data verification

`test:public-seo` runs source/output contract checks and isolated browser fixtures. No live database/API/Auth writes occur.

- Parsed AST comparison against `176b9814e8fdbeda903f294d650c83a18066deb5`: all four useMarketingMeta argument objects; slug normalization; pageTitle/pageDescription; pagination callback; exact public read URL expressions; metadata/schema response mappings are unchanged. Flat ItemList injection logic is unchanged, including removal when leaving the template.
- API handlers, Supabase sources, `App.jsx` routes/guards, metadata/slug helpers, `vercel.json` and dynamic sitemap source are unchanged.
- Every prerender function except the style-wrapped listPageHtml compares identically as AST. Removing only styles and the added main-class marker gives identical static text/HTML for populated/empty fixtures. Head output (title, description, canonical, Open Graph, Twitter, schema) is identical. Generated sitemap path and bytes compare identically, including URL deduplication.
- Actual React browser checks at `/categories`, `/categories/catering`, `/category/catering`, `/category/catering/manchester`, `/location/manchester` and `/catering-manchester` verify H1, intro, document title, description, canonical, social title and exact ItemList fixture JSON. Category pagination retains canonical `/categories/catering`, `pageSize=24`, page removal at 1 and out-of-range clamping. Flat canonical continues to use the requested path, as before; it does not introduce a redirect from server-provided canonical metadata.
- Existing category links, `/category/...` broader links, profile links, request/contact destinations, `/browse` redirect and keyboard category/pagination navigation are preserved. No extra API call or route is added for related content.

## Tests and visual evidence

- Six representative populated routes at **360 / 768 / 1024 / 1440px**: no horizontal overflow; axe WCAG 2 A/AA and 2.1 AA without exceptions. Visual review covers category discovery, location results and mobile/static landing pages against the established public styles.
- Four distinct templates: loading, empty, error/retry, not-found where applicable, missing/broken images at all widths. Errors no longer also show successful empty results or zero counts. Search failure/retry leaves loaded categories available. Search retains 300ms debounce, trimmed `q`, `page=1&pageSize=12`, no-match/clear behavior and the disabled filter control.
- One initial public request under StrictMode, no Home/profile/role-page/calendar code requested by SEO routes, no workspace data requests under signed-out/Admin/Supplier/Venue/Customer fixture sessions. Pathname changes discard previous flat-slug H1/schema.
- Static category HTML is readable, focusable and free of overflow at all widths **with JavaScript disabled**. The same static document passes axe in a separate enabled audit context (axe itself requires JS timers). This is an isolated renderer test, not a claim of live deployment validation.
- Existing `test:public`, `test:public-profiles`, `test:workspace` pass, including the expanded design-system preview and shared public-token regression boundaries.
- Vite compilation passes (4.98 seconds on the final build). Full lint stays **429 errors / 12 warnings**, no new diagnostics by file/rule/message/severity. New/changed application modules are clean.

Run with Node 22 and the existing isolated Vite fixture server from `../public-v2/README.md`:

```sh
npx vite build
npm run test:public-seo
npm run test:public
npm run test:public-profiles
npm run test:workspace
npm run lint
```

`SEO_SCREENSHOTS` defaults to `/tmp/eventwow-public-seo-v2`; `WORKSPACE_TEST_URL` defaults to `http://127.0.0.1:5173`. Fixtures use synthetic records and test-only photos. Screenshots retained here include all populated widths and representative mobile states; remaining state captures are reproducible through the suite. Source-contract tests compare against the committed baseline and do not query production.

## Performance and remaining risks

- Existing lazy routes remain. Shared SEO JS/CSS are route chunks, with no new runtime dependency. Initial bundle is approximately **433.80 kB / 126.87 kB gzip**, compared with **433.65 / 126.81** before this pass. Shared SEO components are 2.55/1.05 kB JS and 3.23/0.86 kB CSS. These are build artifact sizes, not measured visitor latency.
- Existing publicGet coalesces overlapping reads without persistent caching. Retry/later visits get fresh responses. Query limits, server ranking, eligibility, pagination and backend fan-out are unchanged.
- Fixed responsive image frames and lazy images remain; no extra hero/profile read is added. The result list places fewer photos above the fold. Original upload URLs have no thumbnail variants in the contract, so large image bytes remain a separate media-pipeline concern.
- No legacy **React category/location/flat SEO template body** remains. General marketing bodies (how-it-works/pricing/contact), static home/detail fallback bodies and public request/quote/auth/claim journeys remain outside this scoped migration.
- Live CMS data, image delivery, production network behavior and credential-dependent full prerender remain unverified. Static renderer/source tests do not establish which generated HTML Vercel serves in production. Existing rewrite/static-file precedence, missing two-segment rewrite, soft-404 behavior and dynamic versus build-time sitemap differences need a dedicated staging SEO check before claiming organic-search release readiness. No slug/canonical/schema policy changes are bundled into this visual task.
- The earlier Customer/Supplier security migration remains a separate staging requirement, unchanged here.

Next: audit and migrate public request creation, enquiry status, quote comparison and token-based quote decisions using shared public components. Preserve validation, token/payload contracts, credit/booking side effects and all existing CTA destinations. Verify the full Customer/Supplier workflow separately from the presentation migration.
