# EventWow v2 performance audit — 12 September 2026

Baseline: `c0d08ae27022ee906d484421f0a6a4752b9f7d46`, branch `ui-v2-design-system`. This pass changes read scheduling and dashboard loading states only. No visual redesign, new dependencies, private response cache, polling, schema/RLS, auth/role logic, mutation payloads or workflow changes.

## Measurement boundaries

- Built the baseline and changed application with Node 22.23.2, Vite 7.3.1 and identical **fixture-only** public Supabase settings. Reports: [before bundles](bundles-before.json), [after bundles](bundles-after.json). These settings must not be deployed. The first audit build with the existing local environment measured 436.52 kB; the controlled comparison below uses identical settings for both builds.
- [API timings](api-timings.json) execute the real before/after handlers and installed Supabase client against an isolated PostgREST transport, with **50 ms added per query**. No production database, SQL planner, RLS execution, cold start or real network latency is represented. Timings are individual illustrative samples; query concurrency and unchanged query/response contracts are the regression assertions.
- [Dashboard before](browser-before.json) and [after](browser-after.json) use Chromium against compiled Vite output, fresh fixture sessions, **200 ms for ordinary data responses and 1,200 ms for slow optional panels**. Time starts before page navigation. “First metric” means a completed metric rather than a heading/skeleton; “complete” is the intentionally slow panel response. These are not LCP/INP or live benchmarks. Production compilation avoids development Strict Mode/HMR duplicate effects; Strict Mode stays enabled in source.
- Read-only requests to the branch Preview returned Vercel protection redirects: homepage 302/75 ms TTFB and supplier API 302/65 ms. These measure protection, **not EventWow**. Connected Vercel access could not bypass protection or expose this project's runtime logs. Consequently **the slowest live call, p50/p95, database query plans, deployed image sizes and cold-start times remain unmeasured for every route below**. No ranking of live backend latency is claimed.

## Top five bottlenecks by likely user impact

1. **Serial public API reads.** Search waits for suppliers → images → performance → review stats. Supplier profile waits for supplier → images/publication gate → performance → reviews. Venue profile waits for venue → images → links → suppliers → images/performance → reviews. Each stage adds network latency. Parallelized only independent reads, retaining all initial publication gates and existing error precedence. Search pagination/ranking/filtering is unchanged.
2. **Dashboard content waits for unrelated services.** Supplier counts/credit history waited for performance and ranking, and those services started only after six database reads. They now start concurrently, and core content renders separately. Admin already fetched three endpoints concurrently but withheld every panel until all settled; each panel now renders when its own response settles. Existing loading/empty/error components and values are reused. Cleanup prevents obsolete dashboard loads from committing late state.
3. **Auth-gated and detail request chains.** App resolves a session and role before protected lazy modules/data. Each private API independently validates the token and resolves its owner/role. Customer enquiry detail and messaging-targets repeat this work, plus overlapping enquiry/quote/supplier/thread reads. Supplier quote detail serializes row → items → enquiry → public-link recovery → credits. These remain because authorization, token recovery and mutation refresh correctness need separate treatment; no shared private cache or weaker token validation was introduced.
4. **Payload work grows before pagination.** Supplier search reads up to 500 candidates and all their image/performance/review rows before eligibility, scoring and pagination; venues read up to 600 including `ai_draft_meta`. Admin supplier list has no explicit pagination. Postcode search has conditional serial per-postcode cache/geocoder reads and coordinate backfills. These are scaling risks even after parallelization, and need realistic cardinality/query-plan measurement before changing marketplace or pagination semantics.
5. **First-visit JavaScript and original-size imagery.** Entry JS is 436.44 kB (128.08 kB gzip). WorkspaceShell adds 56.89 kB on workspace visits; calendar adds 216.37 kB only when selected. Route splitting is already effective. Public cards/gallery use original storage URLs without resized variants; lazy loading reduces requests but does not reduce bytes of a displayed original. The homepage already has 640/1400 WebP variants (100,486/319,444 bytes), and profile galleries initially render a cover plus at most two previews. No speculative image-service contract or vendor-chunk reshuffle was added.

## Measured changes

| Path | Query count before → after | Sequential read stages before → after | Controlled API sample before → after |
| --- | --- | --- | --- |
| Supplier search, no postcode | 4 → 4 | 4 → 2 | 255 → 105 ms |
| Published, complete supplier profile | 5 → 5 | 4 → 3 | 203 → 154 ms |
| Venue profile with linked supplier | 7 → 7 | 6 → 4 | 305 → 204 ms |

The peak concurrent query count becomes three for each optimized API. Reads are still batched with `.in(...)`, never per-result requests. Successful query URLs, selects, filters, ordering, limits and response bodies are compared exactly against baseline. Unpublished/incomplete supplier visibility, unapproved reviews, missing rows, empty collections, filters/pagination, missing optional performance view and single/multiple failures retain their existing responses. On a secondary-read failure, parallel peers may now finish reads the serial implementation would have skipped; no writes are introduced.

| Dashboard | First useful metric before → after | Slow panel complete before → after |
| --- | --- | --- |
| Supplier | 2,440 → 1,247 ms | 2,440 → 2,220 ms |
| Admin | 1,925 → 958 ms | 1,925 → 1,931 ms |

Admin improvement is earlier useful content, not a claim that its slow endpoint finishes sooner. Supplier still makes six core database reads and two service requests; Admin still makes three requests. Supplier's notification read is unchanged. The compiled fixture run detects no duplicate page reads. Refresh, partial failures and unavailable counts keep their previous semantics. No component-wide memoization was added: existing memoized list filters/gallery derivation are retained; small metric/leaderboard calculations do not justify more caching without a CPU profile.

| JavaScript artifact | Before bytes / gzip bytes | After bytes / gzip bytes |
| --- | ---: | ---: |
| Initial entry | 436,435 / 128,085 | 436,435 / 128,079 |
| Admin dashboard route | 4,309 / 1,904 | 4,404 / 1,959 |
| Supplier dashboard route | 11,811 / 4,103 | 12,079 / 4,137 |
| Calendar, deferred | 216,367 / 66,834 | 216,367 / 66,836 |

Entry size is unchanged; a few gzip bytes vary with emitted chunk hashes. The additional dashboard state costs 363 uncompressed bytes across the two lazy chunks. No dependency/lockfile changes. The emitted manifest regression checks that workspace entries/layouts remain dynamic, public static graphs contain no workspace page entries, and Bookings list does not import Calendar eagerly.

## Representative route audit

The chunk column is the individual route chunk in decimal kB, **not the total page transfer**. Shared entry, shell, CSS, fonts and dependencies are additional and reused on navigation. Unless specified, route sizes are unchanged. For all rows the slowest real backend call is unmeasured; the critical call/stage listed is the candidate to instrument on staging.

| Route | Major browser reads and backend work / waterfall | Route chunk; result of this pass |
| --- | --- | --- |
| `/` | Categories and `/api/public-venues?limit=4&offset=0&sort=recommended` run independently after route load. Venue feed reads venues then hero images. Hero/text can render while sections load. | Home 5.70 kB. Already progressive and responsive-image enabled; no change. |
| `/suppliers` | `/api/public-suppliers?...` plus category options in parallel. Main critical path was four serial DB stages; postcode path can additionally call cache/geocoder/backfill before batching. | 4.07 kB. API batches parallelized; existing public in-flight dedup and filtering preserved. |
| `/venues` | `/api/public-venues?...`; venues then batched hero images, filtering/paging over loaded candidates. | 2.64 kB. Already two dependent stages; retained. |
| `/suppliers/:slug` | One public profile GET → supplier row → images/gate → independent performance/review stats/approved reviews. Cover/preview image requests follow DTO; full viewer image follows interaction. | 5.14 kB plus shared profile components. API reduced by one stage; no duplicate profile reads. |
| `/venues/:slug` | One public profile GET → venue → images/links concurrently → published linked suppliers → their images/performance/reviews concurrently. | 3.70 kB plus shared profile components. API reduced by two stages; linked-supplier visibility unchanged. |
| `/admin` → `/admin/dashboard` | Role gate, then funnel, supplier metrics and credits ledger in parallel, sharing one browser session lookup. Each API does its own auth/user-role validation. Funnel reads quotes; metrics reads quotes then supplier names; ledger reads rows/count then supplier names. | 4.31 → 4.40 kB. Panels no longer wait for one another. |
| `/admin/suppliers` | After role gate: direct narrowed `suppliers` select ordered by creation. No per-row venue query in list. Opening editor adds profile, listing, credit history, ranking and venue-link reads. | 35.28 kB combines editor/list. Existing search is memoized; list pagination and editor chunk extraction deferred. |
| `/admin/enquiries` | `/api/admin/[...path]?status=all&page=1&pageSize=100&path=enquiries`. Auth then one joined enquiry/customer/venue query with exact count. Detail adds enquiry/invites; each invite quote panel can read quotes/items (detail N+1 risk). | 22.49 kB combines list/detail/forms. List is already bounded; no workflow changes. Catch-all also imports other Admin handlers, a cold-start candidate requiring logs. |
| `/supplier/dashboard` | Profile/owner gate; email verification `getUser`; six core DB reads; performance and ranking APIs; shell notification API. Performance uses auth → supplier → view; ranking uses auth → supplier → two parallel views. | 11.81 → 12.08 kB. Removed core→services waterfall; core metrics/history render independently. |
| `/supplier/enquiries` | `/api/supplier/enquiries` → token validation → supplier ID → joined invites/enquiry/customer/venue, limit 200. Shell notification request alongside it. | 6.57 kB. Already joined, not N+1; no changes. |
| `/supplier/quotes` | List `/api/supplier/quotes` and `/api/supplier-credits` load independently; shell notifications. List API: auth → supplier → joined quotes/enquiries (200) → batched quote events. Selection: quote → items → enquiry detail → public-link recovery for non-drafts → credits. | 27.71 kB combines list/editor. Long detail chain documented; token/credit steps not reordered. |
| `/supplier/bookings` | `/api/supplier/bookings?...` after role/session; backend `resolveAuthMe` then narrowed joined bookings (300), date/status/origin filters. Notification read independent. Sources are loaded for management/create actions, not needed to render initial list. | 23.88 kB. Calendar 216.37 kB remains deferred; source/date semantics retained. |
| `/customer` | App session → user profile → customer lookup, then static dashboard links. No dashboard API or invented metrics. | 1.70 kB. No redundant page fetch to remove. |
| `/customer/enquiries/:id` | Detail and `/messaging-targets` APIs already parallel, each independently authorizing ownership. Detail: owned enquiry → invites/visible quotes → suppliers → items/links/threads/events → bounded messages. Targets repeats some reads; opening conversation then gets/creates thread and loads history. | 10.43 kB. Existing private DTO/visibility and history ordering preserved; consolidation deferred. |

## Auth, images and serverless findings

App's role resolution effect depends on `user?.id`, not pathname, so normal in-app navigation does not re-resolve the role. `getSession()` calls are not all network requests: the SDK normally reads local session storage and can refresh when required ([Supabase reference](https://supabase.com/docs/reference/javascript/auth-getsession)). Server `getUser()`/ownership checks remain necessary; none were replaced with untrusted local claims. Legacy role fallbacks and `resolveAuthMe` profile upsert make aggressive consolidation a separate security/behavior review. Supplier badges intentionally re-read on route changes to stay fresh.

Most audited list APIs already use narrow joined selects or batched IDs. Broad selects remain in quote/editor or mutation responses and helpers; reducing them without enumerating every downstream DTO field is unsafe. More consequential than replacing `*` mechanically are row cardinality, all-gallery reads before search pagination, exact-count costs, and repeated authenticated lookups. No SQL plans/index statistics were available. No React/Supabase/date-fns duplication was introduced; the large calendar and Admin editors remain off unrelated route graphs.

Image containers reserve geometry and use async decoding, lazy offscreen cards/previews, an eager/high-priority profile cover, and a viewer loading only the selected image. Original uploaded bytes/dimensions are not available from these fixtures. Do not append guessed resize parameters: confirm account support, external-source behavior and fallbacks before adopting [Supabase image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).

Serverless cost candidates are repeated auth/network round trips and the Admin catch-all import graph; public read APIs and supplier performance/ranking each initialize server clients on invocation. Function region, DB region, warm/cold durations, connection pressure and view execution costs require live logs. This pass parallelizes at most three queries per public API and does not change concurrency limits, connection configuration, cache headers or infrastructure.

## Verification and reproduction

Use Node 22 and installed Playwright Chromium. For **performance** checks build compiled fixture assets and serve them (separate terminal):

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npx vite build --manifest
npx vite preview --host 127.0.0.1 --port 4173
npm run test:performance
```

`PERFORMANCE_REPORT=/absolute/file.json` saves an individual runner's report; `WORKSPACE_TEST_URL` overrides the browser address. API tests dynamically load the old handler from Git at the recorded baseline in a temporary file removed in `finally`. Historical presentation contract suites exclude only these three GET handler files from byte comparisons and execute the real before/after API contract checks instead. Auth, all other APIs, RLS, routes, SEO and workflow checks retain their previous baseline.

Existing suites normally run against the fixture Vite **development** server on 5173; connected workflow and route-error tests import/intercept source-module URLs and therefore require it. Compiled-output runs are additionally useful but do not substitute for that harness. Tests exercise 360/768/1024/1440px, keyboard/axe, loading/empty/error/retry states, role guards, quote payloads/decisions and message history contracts. A couple of immediate Radix focus-restoration assertions raced in compiled runs; rerun results are recorded below. No focus/auth/product code was changed to make tests pass.

Completed:

- `test:performance`: emitted chunk graph isolation, real API query/response/visibility/error regressions, and progressive dashboard timing/duplicate-read checks passed.
- `test:workspace`, `test:admin`, `test:supplier`, `test:supplier-workflows`, `test:venue`, `test:customer`, `test:customer-supplier`, `test:quote-rls`, `test:public`, `test:public-profiles`, `test:public-seo`, `test:public-journey`, `test:auth`, `test:final-sweep` passed. Customer/public-journey focus assertions passed on rerun in the intended dev harness; the connected workflow and fallback error checks passed there as well. Connected workflow reported 120 fixture API calls, not 120 requests for a page load.
- Vite production compilation passed. `test:prerender-build` passed all 13 Preview/Production/local cases, including production credential strictness and private-canary scanning of 203 generated files.
- Lint remains **428 errors / 12 warnings**, with **zero added diagnostics** by file/rule/severity/message against the starting snapshot. Unrelated backlog untouched.
- Agent-browser smoke check of the compiled login route: meaningful controls, no browser errors; screenshot under `/tmp/eventwow-perf-login.png`. Existing suite screenshots/state reports remain under their documented `/tmp/eventwow-*` directories. Dashboard changes reuse their original markup and passed the Supplier/Admin responsive and accessibility suites.
- Reports here contain only synthetic fixture paths/IDs and emitted asset metadata. No live credentials, auth response bodies or customer data were captured.

## Before production promotion

Use an authorized staging session to record cold and warm navigation HARs for every route above (including within-role navigation and quote selection), API p50/p95 and function duration, and browser LCP/INP with realistic mobile/network throttling. Inspect actual image transfer sizes and SQL plans for candidate/search batches, ranking views and exact counts. Check that parallel reads do not create unacceptable database load at staging concurrency. Use a small sanitized realistic dataset, not empty fixture speed, to choose the next optimization.

The Preview protection barrier leaves live performance and actual Supabase/Auth/RLS/transactional side effects unverified. Existing staging requirements in the Customer/Supplier security and final-sweep reports remain; this pass does not confirm that the earlier quote-visibility migration has been applied. Production requires a fresh strict prerender build with its server credentials, rather than promoting a Preview artifact that skipped SEO generation. No new deployment configuration or migration is required by this performance patch.
