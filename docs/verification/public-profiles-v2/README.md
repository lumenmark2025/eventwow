# Public profile UI v2 verification

## Audit before presentation changes

Starting branch `ui-v2-design-system`, commit `2603f124622515a8fe1682342545144628a5e9ea`, clean tree. Read AGENTS, design system, migration plan, all four canonical frontend references, Workspace audit and previous public verification.

- `/suppliers/:slug`: one unauthenticated `GET /api/public-supplier?slug=<encoded slug>`. Existing server publication/completeness gate, image, performance, review-stat and latest 20 approved-review queries remain authoritative. DTO includes name, category objects, location, description/about, services, hero/gallery, insurance/FSA, review summary/reviews and performance. Quote CTA stays `/suppliers/:slug/request-quote`; category, venues and supplier-back links stay intact.
- `/venues/:slug`: one unauthenticated `GET /api/public-venue?slug=<encoded slug>`, including linkedSuppliers. Publication and linked Supplier gates remain server-owned. DTO includes type, location, capacity, facilities, about, hero/gallery and existing confidence-label inputs. Quote CTA stays `/request?venue=<slug>`: this requests event suppliers for the venue, not a new venue-booking workflow. Claim stays `/venues/:slug/claim`.
- Both pages are already lazy. Metadata and LocalBusiness/EventVenue JSON-LD use existing helpers; preserve these expressions and routes. No public endpoint, Supabase query, RLS, schema, auth, or workflow changes are required.
- Missing capabilities: no profile packages/prices/FAQs endpoint; no Venue reviews; no map coordinates/address mapping contract; no public direct messaging or availability calendar. Supplier location is not a travel-radius contract. Venue facilities may contain accommodation/parking/licensing text, but no separate new booleans should be inferred. Omit unavailable sections rather than add illustrative data.
- Current Supplier `Number(null)` produces false zero-hour/zero-percent performance. Current Venue fetch can retain the last loaded venue after a slug changes and the new request returns 404/error. Fix these narrowly at the presentation/state boundary and cover regressions.
- Both existing effects duplicate overlapping StrictMode reads. Reuse the public in-flight-only request helper, preserving endpoint/query and fresh reads after settlement. No new review/media fetch. Storage DTOs provide original URLs only; do not assume a paid image-transform service or modify signed URL contracts. Limit initial gallery preview and load additional photos only when selected.


## Delivered

Both public profile route bodies are fully migrated; no legacy Supplier/Venue detail-body UI remains. The shared header/footer and PublicPageHeader remain the public structural reference. The profile pattern uses 48px desktop / 40px tablet / 32px mobile Inter titles, off-white canvas, navy type, orange actions, real photography, restrained dividers and a pastel enquiry panel. The primary CTA appears above imagery for mobile access; the detailed enquiry panel is sticky on desktop and stacks after content on mobile.

Shared components: PublicProfileHero, MediaGallery, ProfileLayout, ProfileSection, FeatureList, ReviewSummary, ReviewList, LocationSection, StickyEnquiryCard and ProfileState. Reused PublicButton/PublicPageHeader, existing SupplierCard for linked suppliers, WorkspaceImage for missing/broken-photo behavior, Radix Dialog and Lucide. The profile pattern is represented on `/design-system` with explicitly synthetic examples. No production photography or listing fixtures were added.

The gallery deduplicates URLs, uses existing alt/caption fields and name-based fallbacks, and supports click/Enter, Previous/Next, arrow keys, wrap-around, Tab containment, Escape and focus return to the actual opening tile. One-photo controls disable; a profile without valid photo URLs has an honest placeholder. No auto-advance or motion is introduced; reduced-motion overrides are present. Only the current expanded image is mounted in the dialog.

Supplier preserves name/category/location, description, all services, real reviews/rating count, FSA link, insurance and the expandable performance fields. Missing numeric signals no longer become 0 hours or 0%. Empty reviews have neutral copy without implying an unsupported review-submission action. The latest-review limit is disclosed when the total exceeds the returned list. Venue preserves capacity, tag-derived labels and linked suppliers, and presents already-returned facilities as text. Venue quote copy still clearly refers to sourcing event suppliers, with the existing venue-prefilled request destination.

No package/pricing, FAQ, Venue-review, map, direct messaging or availability capability was added. No separate service radius is inferred from Supplier location. Existing server-supplied copy/labels and public eligibility rules are unchanged.

## Performance and state fixes

- Both routes retain their existing lazy imports. Shared profile CSS/JS are separate chunks; no role page/calendar/Home code is loaded in the profile fixture.
- `usePublicProfile` reuses the existing public in-flight GET coalescer. It keys visible state by URL and retry attempt, ignores obsolete responses and clears stale metadata/content on slug change. Exactly one initial profile request per page under StrictMode; no additional review/media fetch. Explicit retry fetches fresh data. The helper now retains HTTP status on errors to distinguish 404 from service failure.
- The cover is eager/high-priority; two previews are lazy, all with reserved responsive geometry. Remaining gallery URLs load only when selected. Original URLs are preserved because existing DTOs expose no size variants: this reduces the number of image requests, **not the bytes of each original**. Server-supported thumbnails/transforms need a separate verified image-delivery contract. Oversized uploaded originals remain a staging performance risk.
- Vite compile: passed in 5.73s. Entry **433.65 kB / 126.81 kB gzip**, previously **433.47 / 126.78**. Profile shared JS 7.16/2.66 kB and CSS 8.23/1.88 kB; Supplier page 5.25/2.15 kB, Venue page 3.81/1.70 kB, shared profile request hook 0.50/0.36 kB. Shared dependencies contribute additional route transfer; these are artifact measurements, not live latency claims.
- No new dependencies, endpoint changes, SQL, migrations, auth changes or settled-response cache.

## Verification

Use Node 22, existing installed Playwright Chromium, and the isolated Vite fixture setup documented in `../public-v2/README.md`. Run:

```sh
npm run test:public-profiles
npm run test:public
npm run test:workspace
npm run test:venue
npm run test:supplier
npx vite build
npm run lint
```

The profile suite uses real React route components with intercepted synthetic API/storage/auth data. It covers both routes at **360 / 768 / 1024 / 1440px**: populated, loading, incomplete/no-review/no-photo/no-pricing data, error/retry, 404, empty DTO, broken photos, invalid gallery entries and single-photo state. It checks overflow and axe WCAG 2 A/AA + 2.1 AA without exceptions, gallery keyboard/focus/disabled controls, unchanged enquiry/claim/category/linked-supplier URLs, canonical/JSON-LD values, exact GET URL/method, initial request count and deferred gallery requests. Client-side navigation to a missing slug verifies that old profile details and JSON-LD disappear. Signed-out and Admin/Supplier/Venue/Customer fixture sessions retain public access without workspace data fetching.

The existing public discovery, workspace/design-system, Venue workspace and Supplier workspace suites pass. These include workspace role guards and current editor payload checks for the shared image-component regression boundary. Three request unit tests pass, including error-status preservation, in-flight deduplication and fresh retry after failure. Vite compiles. Full lint remains **429 errors / 12 warnings, zero new diagnostics**, compared by file/rule/message/severity to the previous run; all changed/new application modules are clean. `contracts.json` records parsed-AST equality of metadata/JSON-LD expressions and no changes to API, Supabase, App routes/guards or SEO/prerender sources.

Visual review includes Supplier and Venue desktop/mobile screenshots and the gallery dialog; all populated widths are retained here along with representative 360px state captures. All generated captures can be recreated with `PROFILE_SCREENSHOTS` (default `/tmp/eventwow-public-profiles-v2`). `WORKSPACE_TEST_URL` defaults to `http://127.0.0.1:5173`. Agent-browser smoke confirmed the error/retry page renders without an app error overlay; populated sign-off uses the isolated fixtures.

## Remaining scope and release limits

- Legacy category/SEO landing bodies, public request/quote flows and auth/onboarding/venue-claim forms remain unchanged. No profile route aliases were found beyond `/suppliers/:slug` and `/venues/:slug`.
- This run verifies presentation and read/link contracts with fixtures. Live publication eligibility, approved review data, original-image sizes/availability, auth sessions and enquiry/claim integration still require staging. Existing APIs remain responsible for excluding unpublished/test records; no name-based frontend filtering was invented.
- Credential-dependent SEO prerender was not rerun in this task. Vite compilation and unchanged metadata sources pass, but configured staging prerender output remains unverified, as documented in the preceding public run.
- The earlier Customer/Supplier security migration remains a separate unapplied staging requirement; no policy was changed or applied here.

Next: audit Category + SEO landing routes and query/canonical/JSON-LD contracts, then reuse the shared public headers, cards, filters and callouts while preserving landing-page copy, location/category URLs and existing prerender behavior. Keep the enquiry/quote journey as a subsequent scoped migration.
