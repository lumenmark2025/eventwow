# Public UI v2 — 12 September 2026

Branch `ui-v2-design-system`, starting commit `8bb491d`. Canonical reference: the supplied [public frontend HTML/CSS](../../reference/frontend/index.html), including its final XXL desktop typography overrides. Reference files are retained unchanged for review; their illustrative records are not imported by the application.

## Migrated routes and shared components

- `/`: light split hero with the reference event photograph, existing supplier search handoff, category discovery, four real API-provided venues, existing enquiry/how-it-works/recruitment links and FAQ content.
- `/suppliers`: keyword search, category/location/sort controls, horizontal supplier rows, real count, profile links and enquiry/recruitment actions.
- `/venues`: keyword search, existing sort control, responsive venue grid, real location/capacity/description metadata and profile links.
- Shared `MarketingShell`, `MarketingHeader` and `MarketingFooter`: compact white header, navy typography, orange actions, Lucide icons, Radix mobile navigation with focus containment/restoration, skip link and existing footer destinations.
- Shared public page-header adapter uses the existing `PageHeader`. `PublicComponents` supplies section headings, search/select/filter controls, result states, callouts, event search, category and venue cards. SupplierCard is migrated in place with a list variant; its existing grid callers also inherit the shared card presentation. Listing imagery reuses `WorkspaceImage` and its failed/missing states.
- `/design-system` contains clearly labelled synthetic public component examples, isolated from production feeds. The sample header stays compact inside the narrower workspace preview canvas.

| Route | Mobile | Tablet | Laptop | Desktop |
| --- | --- | --- | --- | --- |
| Home | [360](home-360.png) | [768](home-768.png) | [1024](home-1024.png) | [1440](home-1440.png) |
| Suppliers | [360](suppliers-360.png) | [768](suppliers-768.png) | [1024](suppliers-1024.png) | [1440](suppliers-1440.png) |
| Venues | [360](venues-360.png) | [768](venues-768.png) | [1024](venues-1024.png) | [1440](venues-1440.png) |

## Visual and data decisions

The implementation uses self-hosted Inter, the reference's navy/off-white/coral/pastel palette, 60px desktop hero and 40px search-page titles, 78px desktop header, restrained borders, horizontal supplier imagery and three-column desktop venue cards. CSS is scoped to the public system. Canonical dimensions such as 185px supplier imagery, 11px controls and 14/18px radii are intentional reference values, not new page-specific tokens. At narrower widths the layout consolidates columns before controls or copy become cramped.

Reference coral remains the decorative accent. Orange action and muted-text tokens are darker for WCAG AA contrast with white; the reference's small white-on-bright-coral buttons and pale metadata do not meet that standard unchanged. The mobile menu, labels, broken-image states, responsive column corrections and preserved footer links are deliberate production adaptations. No decorative gradients or invented avatars were added.

The reference contains fake suppliers, venues, prices, ratings, global statistics and unimplemented controls. None of those become production records or claims. Specifically:

- Home keeps its existing category and venue feeds. It does not add a new featured-supplier request, global metrics or a fake featured-supplier section. Category discovery occupies that discovery role using the existing records.
- The homepage form still sends `q` and `location` to `/suppliers`; no unsupported date field or silently ignored event-date filter is introduced. Get Quotes/Post an enquiry still reach `/request`.
- Venue capacity/type/amenity/rating/price filters and favourites are absent because the current list endpoint supports keyword/sort only. Capacity and tags already returned by the API remain descriptive metadata.
- Supplier category/location/keyword/sort values preserve their existing meaning. Existing review count/rating, insurance and response measurements are displayed only when provided. Missing response hours previously became `0` through `Number(null)`; that false zero-hour claim is now omitted. Existing FSA fields remain supported in SupplierCard's other callers; `/suppliers` continues to pass `showFsa={false}`.
- Inspiration/Deals/expert-matching links are not fabricated. Existing navigation destinations and footer links are retained.

## Contracts, SEO and performance

No API, Supabase query, schema, RLS policy, permission, ranking, eligibility, pricing or marketplace handler changed. Queries remain:

| Surface | Existing request contract |
| --- | --- |
| Home categories | `GET /api/public/categories`, first six categories |
| Home venues | `GET /api/public-venues?limit=4&offset=0&sort=recommended`, first four rows |
| Supplier results | `GET /api/public-suppliers` with trimmed `q`/`location`, category except All, recommended/newest, `limit=24&offset=0` |
| Supplier options | `GET /api/public/categories/options` |
| Venue results | `GET /api/public-venues` with trimmed `q`, recommended/newest, `limit=24&offset=0` |

Document titles/descriptions, query-free canonical URLs, Open Graph/Twitter metadata, homepage Organization JSON-LD, profile/category links and SEO prerender code are preserved. Existing list limits and lack of a pagination UI remain unchanged. Counts now say how many of the total are shown, and loading/error counts do not appear as genuine zeroes.

Small reliability/performance improvements:

1. Home joins the existing route-level lazy imports. Supplier/Venue searches do not load Home; public browsing does not load Admin/Supplier/Venue/Customer workspace page modules or the booking calendar. Final entry is **433.47 kB / 126.78 kB gzip**, versus **450.95 / 131.69** before this pass. These are build artifacts, not a measured real-user latency improvement.
2. `publicGet` shares only overlapping unauthenticated GETs for the exact same URL, including StrictMode duplicate effects. Settled/error requests are removed, so future navigation/refetch sees fresh data. No persistent cache or new polling is introduced. Tests assert one initial request per feed and retry after malformed/failed responses.
3. Filter merges use the current BrowserRouter URL rather than a prior React render's params. Rapid Category → Sort updates previously dropped category despite the URL having already changed. This is covered by the browser regression; the backend contract is unchanged. React Router documents that callback search-param updates do not queue like React state updates ([official reference](https://reactrouter.com/api/hooks/useSearchParams)).
4. Listing frames reserve image space, use lazy decoding/loading and reuse missing/broken-image handling. The reference hero is self-hosted with 640px and 1400px WebP candidates, eager/high priority, explicit dimensions and responsive `sizes`. It adds approximately **99/312 KiB** depending on the selected candidate; Inter 800 is also added for the reference headings. No remote Google Fonts or Unsplash requests are required by the production pages. Large existing listing uploads still need a separate media-pipeline review.

The public endpoints still retrieve bounded batches (up to 500 suppliers/600 venues) and perform existing filtering/ranking/related-data work server-side. This pass does not alter those contracts or introduce speculative query refactors.

## Verification

`npm run test:public` runs two request-layer regressions and the new isolated Playwright suite. All public API/Supabase requests are intercepted; synthetic names and two reference-derived fixture photographs are browser-test assets only. No data was written to live services.

Coverage includes populated/loading/empty/error/missing-media states at **360/768/1024/1440**, document overflow, axe WCAG A/AA checks, error and category-options retries, broken images, real versus absent rating/response signals, original search/clear/category/location/sort parameters, rapid filter merging, profile destinations, canonical/Organization metadata, lazy module isolation, duplicate initial reads, and public access for signed-out/Admin/Supplier/Venue/Customer fixtures. Radix menu Tab containment, Escape, focus restoration and navigation are exercised.

All six pre-existing workspace suites and the connected Customer/Supplier workflow also pass. The workspace suite verifies the expanded `/design-system` and role guards. Existing Supplier calendar week-view ARIA exceptions remain unchanged in that suite; the public suite uses no accessibility exceptions.

- Vite compilation: **passed**, 4.70 seconds.
- Full `npm run build`: Vite passes; the existing SEO prerender stage requires Supabase URL/service-role credentials absent locally.
- Lint: **429 errors / 12 warnings**, zero new diagnostics against the starting snapshot.

[Public results](results.json) · [Full check summary](checks.json) · [Request regressions](request-tests.txt)

Run with Node 22, installed Playwright Chromium and the existing fixture Vite server:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
npm run test:public
```

`PUBLIC_SCREENSHOTS` overrides `/tmp/eventwow-public-v2`; `WORKSPACE_TEST_URL` overrides the browser origin. `PUBLIC_INTERACTIONS_ONLY=1` runs the shorter interaction subset for debugging, not the complete sign-off. Never deploy fixture credentials or fixture records.

## Remaining public UI and risks

Legacy page bodies remain on supplier/venue profiles, category/browse and SEO landing pages, request/enquiry comparison/public quote/booking-access screens, pricing/how-it-works/contact, supplier signup/verification/onboarding and venue claim flows. Shared public header/footer now appear there, and existing SupplierCard consumers receive the new grid-card presentation; their full bodies have not been migrated or comprehensively visually signed off.

The static hero is the editorial event photograph supplied by the canonical reference, not a claimed EventWow customer/venue. Source: `images.unsplash.com/photo-1492684223066-81342ee5ff30`; the two test-only photos use reference IDs `photo-1513104890138-7c749659a591` and `photo-1519167758481-83f550bb49b3`. Actual cards always use their existing API image fields. Check production image quality, content curation and SEO prerender with configured staging credentials before release. Existing endpoints determine public eligibility; this UI does not add speculative name-based test-record filtering.

Live database/Auth, SEO prerender output with credentials, production network performance, and all legacy public-body integrations remain unverified here. The prior Customer/Supplier security migration is still a separate unapplied staging requirement; this run neither modifies nor applies it.

Recommended next migration: supplier and venue public profiles using the new cards/gallery foundations, followed by category/SEO landing pages, then the request → quote comparison/decision journey. Preserve the existing SEO and enquiry contracts in those passes.
