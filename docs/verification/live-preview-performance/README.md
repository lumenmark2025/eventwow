# Live Preview performance investigation

12 September 2026. Starting commit: `7f189b01c50b8c0469eacd7cfa0ca74ca36cf35f`, branch `ui-v2-design-system`.

## Outcome and evidence boundary

One application change is supported by live evidence: public cards and profile galleries were requesting original uploaded images. A published venue hero is **3,413,944 bytes**; the existing image transformation service returned **37,518 bytes at 640 px** and **160,990 bytes at 1600 px**. Public photographs now use responsive sources, with original-image fallback. No screen redesign, API/auth/session changes, new caching, dependencies, schema changes or migrations.

**Live application performance cannot yet be signed off for production.** The successful branch deployment was confirmed through GitHub deployment 6413184267 and commit status:

https://eventwow-4465a6fw5-reward-digital.vercel.app

All **42 HTTP samples** (14 route/endpoint groups, three samples each) returned Vercel protection redirects. Agent-browser reached **Log in to Vercel**, not EventWow. The connected Vercel account lists the `reward-digital` team, but deployment lookup by ID and hostname returns 404 and share-link creation returns `Unable to create shareable URL`. No authorized Preview browser session or role-specific test accounts were available. A temporary share link/project-access repair was requested; protection was not disabled or bypassed.

The Supabase connector separately exposes the active **EventWow** project in **eu-north-1**. Read-only statistics, bounded plans and public image GETs were feasible. Preview's environment binding to that project could not be confirmed through the inaccessible deployment settings. These are actual connected-project/storage measurements, **not Preview API timings**.

Evidence files contain aggregate statistics and sanitized labels; no auth state, request/response bodies, SQL parameters, customer records or private object identifiers:

- [Protection samples](protection-probes.json)
- [Live image transfers](image-transfers.json)
- [Database/storage aggregates and plan summaries](database-evidence.json)

## Route coverage

For every row below, **navigation → first useful content, slowest application endpoint, auth resolution, live chunk transfer, live duplicates and render-blocking duration remain unmeasured**. The request chains are verified source observations, not invented network traces. Protection TTFB is deliberately not reported as application speed. Its 15–696 ms range measures only redirects.

| Requested route | Access result and existing request chain | Change / verification available |
| --- | --- | --- |
| `/` | 3 protection redirects. Categories and public venue feed run independently; hero/text precede secondary results. | Shared venue cards use sized images. Existing local hero srcset unchanged. Public fixture suite. |
| `/suppliers` | 3 redirects; public-suppliers endpoint also 3 redirects. Search and category reads; main query then independent batch enrichments. Postcode search has additional cache/geocoder/backfill dependencies. | Sized supplier list images. Public fixtures and existing real-handler scheduling/contract tests. |
| `/venues` | 3 redirects; public-venues endpoint also 3 redirects. Candidate query → batched hero images. | Sized venue cards; actual first SQL stage measured separately; responsive/fallback browser regression. |
| `/suppliers/:slug` | No real Preview slug obtained through protected search; no fabricated live profile measurement. Profile row/images/publication gate → independent performance/review reads. | Sized cover/previews/selected viewer image; profile fixture suite and gallery regression. |
| `/venues/:slug` | Same slug/access limitation. Venue → images/links → linked published suppliers → batch enrichments. | Sized profile and linked-supplier photographs; same profile/gallery coverage. |
| `/supplier/dashboard` | 3 redirects. Role/owner gate and verification, core direct reads, performance/ranking APIs, notification API. | No further code change. Existing progressive dashboard/chunk/request tests rerun. |
| `/supplier/enquiries` | 3 redirects. API verifies token → resolves supplier → joined invitations; notifications alongside. | No change; Supplier fixtures. |
| `/supplier/quotes` | 3 redirects. Quotes and credits APIs independent; quote selection then items → enquiry → public-link recovery → credits. | No change. Token recovery can have side effects, so it was not reordered without a live trace. Existing connected workflow suite. |
| `/supplier/bookings` | 3 redirects. Auth/owner resolution → joined filtered bookings; notifications independent; calendar deferred. | No change; emitted graph checks and connected workflow coverage. |
| `/admin` (dashboard redirect) | 3 protection redirects. Role gate → funnel, supplier metrics, credits ledger independently; each endpoint authorizes access. | No change; Admin and progressive dashboard fixtures. |
| `/admin/suppliers` | 3 redirects. Direct supplier list query after gate; editor adds separate reads only when opened. | No change; Admin fixtures. List cardinality still needs realistic live profiling. |
| `/admin/enquiries` | 3 redirects. Admin API → auth → joined enquiry/customer/venue query with exact count. Detail has per-invitation quote-panel reads. | No change; Admin fixtures. Detail N+1 candidate remains unmeasured. |
| `/customer` | 3 redirects. Session → user profile → customer resolution; dashboard links add no dashboard API. | No change; Customer fixtures. |
| `/customer/enquiries/:id` | No authorized Customer session or owned enquiry ID. Detail and messaging-targets APIs each authorize ownership and repeat some underlying reads. | No change; Customer and connected workflow fixtures. No live private records fetched to manufacture a route. |

## Cold/warm, serverless and database findings

Three consecutive requests do not prove cold/warm function state. Protection intercepts requests before app functions; neither function execution duration nor server region is available. The connected database region is known, but a Vercel↔database region mismatch has **not** been established.

Read-only `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` used the existing published supplier/venue candidate query projections, ordering and 500/600 limits, in a read-only transaction with a 5-second timeout. These are initial SQL stages, not full PostgREST authorization/DTO/enrichment or API calls:

| Query | Returned rows | Planning | Execution | Plan |
| --- | ---: | ---: | ---: | --- |
| Published venue candidates | 89 | 10.941 ms | 0.467 ms | Sequential scan, in-memory sort, 50 shared hits / 0 reads |
| Published supplier candidates, first sample | 5 | 22.001 ms | 7.595 ms | Existing publication index, in-memory sort, 10 hits / 0 reads |
| Same supplier query, repeat | 5 | 1.244 ms | 0.178 ms | Same indexed plan and buffer counts |

Both supplier samples hit cached database buffers; the difference is not evidence of a serverless cold start. Tiny-table sequential scans are not inherently defects.

Historical `pg_stat_statements` since 15 January 2026 was filtered to normalized PostgREST statements referencing relevant tables with at least three calls, then ordered by mean execution time. The top selected mean was **26.293 ms**. A venue-related statement with **655 calls** averaged **25.818 ms**, maximum **94.276 ms**. Another supplier-related statement had a **128.164 ms maximum**, **13.726 ms mean**. These statistics include more than this Preview and are not correlated with specific browser requests. SQL text/parameters were not exported. They do not substantiate a seconds-long SQL bottleneck or identify the slowest API.

Current approximate live table cardinalities are small: suppliers 19, venues 198, quotes 1, bookings 1, invitations 2, messages 6, profiles 30. This dataset cannot validate scale performance for busy suppliers/admins.

**No index migration is recommended from these plans.** Publication, supplier ownership, invitation ordering, booking date, media ordering, notification date/read and postcode lookup indexes already exist. There are apparently overlapping indexes on supplier/auth IDs, quote ownership/enquiry IDs and invitation ordering; removal requires a separate constraint/usage review and is not part of this latency fix. RLS semantics remain intact.

Still requiring live traces: repeated server-side token/profile resolution across endpoints, quote-detail recovery chains, postcode geocoder/cache misses, Admin catch-all startup, exact counts, broad quote/editor projections and Customer detail/targets overlap. Client `getSession()` does not necessarily perform a network request. Neither auth checks nor business-dependent reads were removed on that assumption.

## Demonstrated image bottleneck and focused fix

Storage metadata shows **112 venue-images objects**, mean **630,047 bytes**, with **28 over 1 MB**. A separate venue-hero-images bucket has ten objects, mean 247,026 bytes. The measured 3.41 MB photograph is joined to a **published venue as its hero**; it is not an orphan selected merely for its size. Object identifiers are omitted from artifacts.

Direct public storage GETs with `Accept: image/webp` from this runner:

| Variant | Body bytes | First observed total | Repeat totals | Reduction vs original |
| --- | ---: | ---: | ---: | ---: |
| Original JPEG | 3,413,944 | 1,231 ms | 355 / 228 ms | — |
| 640 px WebP | 37,518 | 556 ms | 82 / 83 ms | 98.9% |
| 1600 px WebP | 160,990 | 1,035 ms | 145 ms | 95.3% |

Small sample, unthrottled network, sequential tests, no verified CDN cold state. These establish transfer savings and successful existing transformation support; they **do not establish a before/after Preview LCP or dashboard improvement**. Both resized photographs were visually inspected for preserved composition and usable detail.

Implementation:

- `PublicImage` reuses `WorkspaceImage`; the latter gains optional sources/fallback only. Existing workspace consumers retain their original source/loading behavior.
- `publicImageSources` targets only same-project public JPEG/PNG/WebP photographs in the three existing listing buckets. Signed/private URLs, external hosts, query-bearing URLs, local assets and SVGs stay unchanged.
- Browser-selected 320/640/960/1600/2400 px candidates with quality 80 and preserved aspect ratio. Supplier row, venue card, cover, preview and viewer receive appropriate `sizes`; a single-photo cover has its wider source size.
- A failed transformation retries the original once; a failed original retains the existing accessible missing-image state. Successful selection does not also download the original. Cover priority, lazy offscreen previews, alt text, geometry and Radix keyboard/focus controls remain.
- Only the cover/two previews mount initially; additional gallery images load on selection. SEO/API original image URLs remain unchanged. No additional profile/media API reads.

The endpoint and sizing options use the existing [Supabase image transformation contract](https://supabase.com/docs/guides/storage/serving/image-transformations). Confirm transformation usage/quotas on the deployment's bound project. An unsupported/quota-failed transform remains usable through fallback, but then adds a failed request and loses the byte saving. Static prerender images and external images remain unchanged; this is not a claim that every media transfer is optimized.

## Reproducing authorized Preview measurement

`scripts/profile-preview.mjs` is an opt-in measurement runner, not application instrumentation. It saves request start/TTFB/duration/body size, Resource Timing, image natural/rendered dimensions, first paint, selector-based first useful content and repeated/overlapping URL identities. Query values, record IDs and non-asset path segments are redacted. Reports exclude bodies, DOM text, cookies, headers, screenshots and credentials. Asset chunk names and non-sensitive route labels remain for analysis.

Use Node 22 and installed Playwright Chromium. Put a configuration **outside the repository**; use generic route names and real, authorized profile/enquiry paths:

```json
{
  "origin": "https://CURRENT-SUCCESSFUL-PREVIEW.vercel.app",
  "viewport": { "width": 1440, "height": 1000 },
  "routes": [
    { "name": "Supplier search", "path": "/suppliers", "usefulSelector": ".public-supplier-card" }
  ]
}
```

```sh
PREVIEW_PROFILE_CONFIG=/private/path/routes.json \
PREVIEW_PROFILE_OUTPUT=/tmp/eventwow-preview-profile.json \
node scripts/profile-preview.mjs
```

If supplied, `PREVIEW_ACCESS_URL` must be a valid share URL on the same deployment. `PREVIEW_STORAGE_STATE` may reference an existing local authorized Playwright state file. Keep both private; use a separate run/state for each role. No passwords/service-role keys are required by the runner. `probeOnly: true` records three redirect-aware HTTP probes per route without app auth. Each browser sample is a document navigation followed by a two-second secondary-request observation; repeat navigations share the browser cache. It does **not** measure SPA link transitions, INP, or verify function cold state. Choose a populated-content selector instead of a heading/skeleton; timeout produces no useful-content timing. Cross-origin Resource Timing byte fields may be zero without Timing-Allow-Origin; request event sizes supplement them.

After access is restored, measure all routes above, real quote selection and within-role navigation, first/repeat requests, desktop/mobile with realistic throttling, plus Vercel function logs and p50/p95. Correlate endpoint wall time with Auth, SQL and geocoder stages before the next fix. Do not replace required per-request authorization with shared private caching.

## Verification and promotion

Matched dummy build environment, Vite production compilation with emitted manifest:

| JavaScript | Before → after |
| --- | --- |
| Initial entry | **436,435 → 436,435 bytes**; gzip 128,079 → 128,085 bytes (hash-related variation) |
| Shared MarketingShell | 10.22 → 11.01 kB (contains the public image helper) |
| Shared WorkspaceImage | 0.75 → 0.93 kB |
| Shared profile components | 7.02 → 7.17 kB |
| SupplierCard | 1.80 → 1.87 kB |
| Deferred calendar | 216,367 → 216,367 bytes |

Individual representative route chunks remain unchanged; the shared image support adds approximately 1.19 kB uncompressed across these four chunks. [Emitted route sizes](bundles-after.json) are individual chunks, not total page transfers. WorkspaceShell is 56.89 kB; the largest relevant page chunks remain Admin suppliers 35.28 kB and Supplier quotes 27.71 kB. Public routes still exclude workspace/calendar page code. No dependency changes.

Completed checks:

- `node scripts/verify-public-image-sizing.mjs`: source eligibility/preservation plus **20 browser cases** at 360/768/1024/1440. Card candidates, single original fallback, final placeholder, Supplier/Venue gallery keyboard controls, cover priority and deferred hidden photos.
- `node --test scripts/verify-preview-profiler.mjs`: two tests using real local HTTP transport and Chromium; URL redaction, protection detection, delayed useful content, duplicate overlap, image bytes/dimensions and unavailable-content timing.
- `test:public`, `test:public-profiles`, `test:public-seo`, `test:workspace`, `test:supplier`, `test:customer`: responsive/axe/keyboard/state/role/metadata and existing request-contract regressions. The first profile run caught a missed empty-gallery component reference during implementation; fixed before the complete passing rerun.
- `test:customer-supplier`: existing handler and connected browser workflow passed (120 fixture API calls; four initial Supplier thread reads). No live sends, payments, quote decisions or messages performed.
- `test:performance`: emitted route/chunk isolation, existing before/after API contract/scheduling tests, dashboard progressive-content and duplicate-request checks passed. Current deliberately delayed fixtures show Supplier first metric 1,115 ms / all panels 2,104 ms, Admin 896 / 1,856 ms. These are regression samples, **not improvements attributed to this image patch or live timings**.
- Vite compilation passed. ESLint retains **428 errors / 12 warnings**, with **zero new diagnostics** compared by file/rule/severity/message with the starting snapshot. Unrelated backlog untouched.

`test:admin` also passed on a complete rerun: moderation payloads, detail/forms, four-width axe/overflow and all seven supporting routes' loading/empty/error states. Its first run timed out waiting for the Venue Hero Images heading in the empty-state loop; no Admin code was changed between runs. This remains a test-timing observation, not an application latency measurement. Screenshots remain in the existing suites' `/tmp/eventwow-*` output directories; no real account screenshots or storage-state files are committed.

Production performance acceptance remains **unverified**, despite the measured image improvement. Required next step: provide authorized Preview access and staging role sessions, confirm its Supabase project/region, then measure the actual slow navigation and APIs against the requested ~300 ms warm API / ~1 s useful-dashboard targets. Production also retains the previously documented strict SEO prerender and auth/RLS/workflow staging checks; no earlier deployment/security requirement is waived here.
