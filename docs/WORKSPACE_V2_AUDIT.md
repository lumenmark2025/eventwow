# Workspace v2 audit and migration

## Before UI changes

- Branch: `ui-v2-design-system`; clean starting tree.
- All routes eagerly imported by `App.jsx`. Public entry includes every admin/editor and the supplier calendar. Baseline Vite JS: **1,098.67 kB / 290.01 kB gzip**, CSS: 47.99 kB / 9.31 kB gzip.
- Oversized modules: venue administration 1,564 lines, supplier administration 1,299, enquiries 951; supplier quotes 1,337. Editors and lists share modules. Route splitting is safe; wholesale business-logic extraction is deferred.
- React and React DOM are deduplicated; one date-fns version. Calendar brings react-overlays and date utilities into the eager graph. Suspicious dependencies (`-`, `g`, `npm`) exist but are not proven contributors to browser size; no speculative removal.
- Supplier search stores a derived filtered array in state, causing a second render per search update. Replace with useMemo.
- Dashboard independently reads the session three times for parallel requests; reuse one session per dashboard refresh.
- Dashboard waits for all three services and reports zero metrics after failure. Keep partial service failures visible, never substitute zero for unavailable data.
- Enquiry list requests at most 100 rows; label counts as loaded records rather than platform totals. Supplier and venue lists are not paginated at source and may hit backend limits. Server pagination requires a separate data-contract change.
- Enquiry detail mounts a quote panel per invite (each reads quotes and items); supplier editor loads listing, credits, ranking and profile separately. These are detail-only costs; defer changing their behaviour.
- Supplier notifications refetch on route changes; role layouts derive active tabs through effects. Preserve them during this presentation migration. Development StrictMode intentionally repeats effects; do not disable it.
- Baseline lint: **431 errors, 12 warnings**. Baseline Vite succeeds (5.19s); full `npm run build` fails at SEO prerender due to missing Supabase URL/service-role credentials. Local Node is 18, below Vite 7's supported runtime.

## Visual contract

The supplied HTML is canonical for workspace colours, density and treatment. Shared geometry remains the documented 240px sidebar / 64px topbar. Reference-specific workspace tokens are scoped; marketplace tokens and pages remain unchanged. The explicit task authorizes Admin migration ahead of the historical phase order. No fabricated revenue, trends, uptime or approval counts are copied from the mockup.

Accessibility exception to the static reference: its white text on #ff5a1f has only 3.11:1 contrast. Keep that bright orange for the wordmark and decorative metric icons; use the shared orange action token #d44312 (4.55:1 against white) for primary buttons and the active navigation row. Hover uses #b9380e. AA status text uses darker semantic foregrounds. No per-page colours.

## Delivered

- One WorkspaceShell now drives Admin and the existing customer/supplier/venue AppShell adapter. Other role page bodies retain their existing presentation. All 11 Admin destinations and venue detail URLs are retained; navigation is grouped by operational purpose.
- Added workspace primitives and an unlinked `/design-system` route. Component APIs and compatibility notes: [workspace README](../src/components/workspace/README.md).
- Migrated Dashboard, Enquiries, Suppliers and Venues list presentation. Existing enquiry/quote workflows, supplier editor, credits, venue editor, AI tools, draft deletion and venue types remain in place. Venue creation/type management use expandable sections; new list filters do not alter source queries or status logic.
- Existing shared primitives gained scope markers only; public marketplace presentation is unchanged. Admin supplier/venue dialogs now use Radix through the previous Modal prop API.
- Removed the unused bespoke AdminSidebar and AdminMobileDrawer after replacing their only consumer. No unrelated legacy code or suspicious dependencies were removed.

## Performance result

| Production artifact | Before | After |
| --- | ---: | ---: |
| Initial JavaScript | 1,098.67 kB | 450.46 kB |
| Initial JavaScript, Vite gzip estimate | 290.01 kB | 131.49 kB |
| Supplier calendar route | Part of entry | 241.10 kB / 72.10 kB gzip |
| WorkspaceShell | Part of entry | 58.41 kB / 20.81 kB gzip |
| Admin supplier management | Part of entry | 35.13 kB / 8.33 kB gzip |
| Admin venue management | Part of entry | 40.27 kB / 11.09 kB gzip |

The entry is ~59% smaller, ~55% smaller compressed. These are build artifact measurements, not a claim about real-user latency. Route chunks also depend on shared chunks; their individual sizes are not total route transfer sizes.

- All route pages except Home and the small login component are lazy imports. Role layouts are also lazy. Suspense provides loading feedback, and a top-level error boundary provides a reload action for failed route imports.
- Vite manifest inspection: the static import closure of `index.html` contains only the initial entry. WorkspaceShell, Admin/Supplier/Venue pages and the calendar are not in that closure. Browser requests also confirmed unauthenticated and non-admin sessions do not load Admin route modules.
- Supplier filtered state is derived with `useMemo`, eliminating the follow-up state/effect render. New venue/enquiry filters are also derived without fetching while typing.
- Dashboard shares one session lookup across its three existing parallel requests, aborts obsolete requests, and isolates each endpoint failure. No cross-user cache or permission change.
- Initial install exposed pre-existing missing Linux native optional entries in the lockfile. Added the exact already-locked versions of Rollup, SWC and esbuild's Linux x64 packages; existing dependency versions were retained. New production dependencies are Radix Dialog/DropdownMenu, Lucide and Inter; Playwright and axe-core are development-only.

## Verification and limits

- `npm run build`: Vite production compile passes (5.08 seconds on final measured run); the subsequent SEO prerender fails for the same missing Supabase URL/service-role credentials as baseline. No credentials were invented and the prerender was not bypassed in the build script.
- `vite build --manifest`: passes; static import graph checked as described above.
- `npm run lint`: 431 errors / 12 warnings, equal to baseline. Linting every changed existing JS/JSX file against its HEAD version found no added diagnostics by file/rule. New workspace, dashboard, design-system, route-boundary and verification modules lint cleanly. Baseline failures include existing hooks, unused declarations and server files using browser ESLint globals.
- `npm run test:workspace`: passes. Actual route components are exercised with isolated Playwright network fixtures. No real backend requests or writes occur. All four Admin screens and `/design-system` checked at 360, 768, 1024 and 1440px, with no page overflow and shared 240/64px geometry.
- Automated axe checks pass for WCAG 2 A/AA and 2.1 AA rules on the populated Admin screens and `/design-system`. Keyboard checks cover table record actions, search, mobile navigation and Radix dialog Tab containment / Escape / focus restoration.
- Loading, empty and error states checked for every migrated screen; retry and partial-dashboard failures checked. Enquiry creation/invites, supplier creation, venue draft creation, delete cancellation/confirmation and editor opening checked against fixture payloads. No live credit, quote, AI generation, storage or production mutation was exercised.
- Role guard source is unchanged. Fixture checks confirm supplier → supplier dashboard, venue owner → venue workspace, customer → existing access-denied behaviour, and unauthenticated → login when requesting Admin. Admin page modules are absent from those requests.
- Visually inspected desktop and mobile screenshots against the canonical HTML: Inter, navy navigation, orange actions, bright semantic icon circles, clean table/status treatments and light restrained panels. Do not copy unsupported revenue, trends, uptime or mockup approval counts into production.

[Screenshots and fixture verification results](verification/workspace-v2/README.md).

## Reproducing browser verification

Use Node 22 (the machine's Node 18 is below the existing Vite 7 requirement). Install with `npm ci`, then `npx playwright install chromium`.

Start an isolated local dev server:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
```

In another terminal run `npm run test:workspace`. Optional variables: `WORKSPACE_TEST_URL` and `WORKSPACE_SCREENSHOTS` (default `/tmp/eventwow-workspace-v2`). These dummy settings are only for the fixture runner; they cannot provide a working live login. Do not deploy them.

Implementation references: [React lazy](https://react.dev/reference/react/lazy), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [Radix Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu).

## Remaining risks and next step

- Live API/auth integration and actual writes need a configured development/staging environment. The SEO build and existing lint backlog remain external verification limits.
- Supplier/venue lists still rely on existing backend result limits. Enquiries display the latest 100 only. Introduce explicit server pagination as a separate reviewed data-contract task rather than silently claiming platform totals.
- At the end of the foundation phase, detail editors retained older presentation. The completion phase below now replaces that presentation; their existing query fan-out and hook behaviour are preserved.
- The Admin detail/moderation step is now covered below. The next role migration is the Supplier dashboard body, preserving quote/credit handlers and backend contracts.

Work remains on `ui-v2-design-system`; no merge to `main` or deployment was performed.

## Admin completion phase — 12 September 2026

Continued on `ui-v2-design-system`. The route audit covered every explicit Admin entry in `src/App.jsx`, all Admin navigation destinations, the three wrapper pages and every embedded editor/dialog. No additional Admin routes were found.

| Route | V2 coverage after completion |
| --- | --- |
| `/admin/dashboard` | Existing v2 overview retained and regression checked |
| `/admin/enquiries` | List, create form, customer/event/supplier sections, detail, invite moderation, quote draft/items/actions, loading/error/not-found states |
| `/admin/suppliers` | List, create dialog, profile editor, credit history/adjustment, listing/media/services/categories, venue trust links, ranking and feedback |
| `/admin/venues` | List, create form, venue-type form, bulk CSV preview/AI controls, delete-draft dialog |
| `/admin/venues/:venueId` | Detail editor, media controls, linked suppliers, AI builder and Save/Cancel footer; existing `:id` alias retained |
| `/admin/supplier-applications` | Status filter, application table, notes, publish/reject and busy/error/empty/loading states |
| `/admin/venue-claims` | Status filter, claims table, approve/reject and supporting states |
| `/admin/reviews` | Pending reviews table, approve/reject and supporting states |
| `/admin/categories` | Search/filter, table, edit/create dialog, validation, featured/active controls, generation/deactivation and supporting states |
| `/admin/credits-ledger` | Filters, table, keyboard-accessible entry dialog, CSV export, pagination and supporting states |
| `/admin/performance` | Search/sort, performance table and supporting states |
| `/admin/venues/hero-images` | Job controls, progress table, generation feedback and supporting states |

There are no remaining legacy-styled Admin route bodies. The `/admin/*` redirect and all existing navigation/guard behaviour remain. Supplier, Venue-owner, Customer and public screen bodies were not redesigned.

### Shared presentation changes

Added `AdminPrimitives` using existing workspace tokens, DataTable styles, Button and Radix dialog. Logical form sections, visible labels, help/error associations, consistent native controls, feedback and Save/Cancel footers are demonstrated on `/design-system`. Existing compound table/card imports now use these adapters. Native select event semantics are retained deliberately. Uploaded file controls are keyboard reachable; removable service controls use Lucide. Numbers and category/source labels are plain text rather than status pills. Destructive actions use the danger variant.

Mobile tables stack labelled cells. Long copy wraps inside the workspace and dialog, toolbars wrap, and form sections collapse to one column. The existing Inter/navy/orange/light-surface reference remains the source of the geometry and palette.

### Behaviour and performance boundaries

Of 107 existing async functions and effect/memo callbacks across the Admin files, 105 compare byte-for-byte with the start-of-completion snapshot. Two initial-load callbacks only gain presentation-readiness setters, preventing missing/failed records from exposing default profile values and Save controls. Excluding those four UI setters, all 107 compare byte-for-byte. API handlers, Supabase calls, validation rules, schema, auth, guards and route declarations were not changed. Category busy-state checks now use the keys already written by their existing mutation handlers, so controls correctly disable during those saves.

No additional production dependency or fetch was introduced. Existing route splitting is retained; the measured initial Vite entry is 450.38 kB (approximately 131.5 kB gzip), compared with 450.46 kB after the foundation phase. Existing result limits, request fan-out and repeated fetching remain separate data-layer work.

### Completion verification and remaining risks

See [Admin verification evidence](verification/admin-v2/README.md) for route/state coverage, screenshots and reproducible commands. Browser fixtures intercept all API and Supabase traffic; none of these checks mutate production.

- Vite production compilation passes. `npm run build` then hits the existing SEO-prerender credential requirement: this environment lacks Supabase URL/service-role credentials.
- Repository lint remains at its pre-existing 431 errors / 12 warnings. This migration does not attempt to clear that backlog. New shared presentation and test modules have no lint diagnostics.
- Live storage uploads, AI generation, backend permission enforcement and production writes still require a configured development/staging environment. Fixture verification proves frontend behaviour and request contracts, not live server correctness.
- The category inline-order editor has an existing persistence issue: `onChange` updates the row before `onBlur` compares the entered value, so a normal typed change does not trigger its PATCH. This predates the migration and was preserved under the business-logic constraint. Use the edit dialog's Save action for order changes; fix the inline editor in a separate functional change.
- Long editors still contain their original business logic. Further extraction should follow concrete functional work, rather than changing their query/mutation lifecycles during visual migration.

Recommended Supplier step: migrate the Supplier dashboard body first using the existing WorkspaceShell, PageHeader, MetricCard and DashboardCard. Then migrate the Supplier enquiry list/detail and quote presentation in a separate reviewed step, keeping credits, quote actions, availability, notifications and backend contracts intact. Reuse the form adapters where appropriate; add only role-specific content, not a new shell.

No merge to `main`, deployment, schema change or live backend mutation was performed.

## Supplier workspace phase — 12 September 2026

Continued on `ui-v2-design-system`, preserving the completed Admin work. Read the design system, migration guide, canonical reference and this audit before editing Supplier UI. The Supplier-phase starting snapshot was taken separately from the earlier uncommitted Admin changes.

### Supplier audit before editing

- All seven Supplier workspace pages and the role layout were already lazy imports. Quotes (1,337 lines) and Bookings/calendar (780 lines) remained separate route chunks; no new route splitting was needed.
- The Supplier layout already delegated geometry to AppShell/WorkspaceShell, but maintained active-tab state through a pathname effect. That derived state caused an avoidable follow-up render.
- Dashboard used six parallel Supabase queries, followed by sequential performance and ranking HTTP requests. Those independent HTTP requests created a serial delay. Its load effect depended on the entire supplier object, although only the ID and credit balance were needed.
- Dashboard failure fallbacks displayed zero counts and `Number(null)`-derived scores. Those are unavailable values, not genuine zero metrics.
- Supplier enquiry filtering already used `useMemo`; preserve it. Filter changes intentionally refetch from the existing endpoint, while typing searches already-loaded rows without another request.
- Notification layout count (`limit=1`) and inbox (`limit=5`) load separately. The layout refreshes on navigation; inbox mutations reload the inbox. These existing contracts and refresh rules remain unchanged.
- Listing editor contains its existing validation, publication gate and media/save handlers. Media mutation responses reset the draft from the server profile; avoid changing those semantics during presentation extraction.
- No duplicated Supplier dependency was identified that could safely be removed. Existing large business-logic modules and development StrictMode effect repetition are not justification for speculative rewrites.

### Migrated routes

| Route | Coverage |
| --- | --- |
| Shared Supplier layout/navigation | Existing WorkspaceShell; grouped Overview, Requests/Quotes/Bookings, Messages/Notifications and Listing/profile navigation; actual route links and shared Lucide/Radix controls |
| `/supplier/dashboard` | PageHeader, real request/quote/booking/credit metrics, existing recent credit activity, listing visibility, quick actions, credits and marketplace performance sections; lifecycle/email feedback retained |
| `/supplier/enquiries` | Shared FilterBar/DataTable, wrapping tablet cells and stacked mobile rows, genuine status badges, full request detail dialog and existing create/view quote/decline actions |
| `/supplier/notifications` | Shared table, unread/read status, original latest-five scope, mark-all/open controls and feedback/loading/error/empty states |
| `/supplier/listing` | Shared form sections, labels/help/errors, profile/services/categories, labelled keyboard-accessible media controls, destructive styling and Save/Cancel hierarchy |

Credits and performance remain on the overview; no unsupported route or metric was invented. The dashboard uses its existing data sources rather than introducing extra enquiry/profile fetches for mockup widgets. Native form/filter selects keep the event semantics used by the established Admin patterns; navigation, account/command menus and request detail use Radix.

Quotes, Bookings and Messages bodies are intentionally still legacy. Supplier signup, verification and onboarding were outside scope. Public supplier directory/profile/request pages, Customer and Venue screens remain unchanged. Existing route guards and aliases remain unchanged. No Supabase schema, permission, pricing/credit, quote or booking workflow was modified.

### Performance improvements and measurements

- Removed Supplier navigation's derived tab state/effect and per-render navigation mapping.
- Dashboard performance and ranking requests now run together, with separate availability/error feedback. Supabase queries, API URLs and authentication headers are preserved.
- Dashboard effect now depends on supplier ID and credit balance, preventing unrelated supplier-object updates from repeating the load.
- No new production dependency or fetch was added. Existing lazy loading remains intact. The final entry is **450.44 kB / 131.50 kB gzip**, effectively unchanged from the Admin-completion entry (450.38 kB); the calendar remains a separate **241.10 kB / 72.10 kB gzip** chunk. These are artifact sizes, not measured real-user latency gains.
- Reused the Admin form primitives. DataTable only gains an optional className so Supplier lists can use the existing wrapping table pattern; no new shell, CSS palette or competing component family was introduced.

### Verification and remaining risks

See [Supplier verification evidence](verification/supplier-v2/README.md) for screenshots, complete route/state/action coverage and reproducible commands.

- `test:supplier`, `test:workspace` and `test:admin` all passed. Supplier fixtures passed at 360/768/1024/1440px, including keyboard, guard and request-contract checks. Source comparison confirms existing listing/enquiry/notification business logic is unchanged, along with dashboard checkout/email-verification handlers.
- Vite production build passed (4.70 seconds). Full build still fails at the pre-existing SEO prerender credential requirement.
- Lint remains at **431 errors / 12 warnings**. File/rule comparisons against the Supplier starting snapshot show no added diagnostics; the new Supplier runner is clean.
- Existing notification topbar count can remain stale after marking read until navigation refreshes it. Listing media responses can replace unsaved copy with the returned server profile. Both behaviours predate this migration and were preserved.
- Live auth, storage, backend permissions and checkout still require a configured development/staging environment. Browser fixtures do not verify those services.

Recommended next task: migrate Quotes presentation first, covering enquiry-to-draft handoff, line items, totals, credit-dependent sending and quote statuses while preserving handlers. Follow with Bookings/calendar and Messages/thread presentation in separate reviewable changes. Reuse the shell, detail dialogs, form sections and table patterns; retain their lazy route boundaries and add fixture coverage for each workflow before changing its presentation.

No merge to `main` or deployment was performed.

## Supplier workflow completion — 12 September 2026

Continued on `ui-v2-design-system` from the completed first Supplier phase. The earlier phase's legacy-body statements above are historical; all seven Supplier workspace routes now use v2 presentation.

| Route | Completion coverage |
| --- | --- |
| `/supplier/quotes` | Shared PageHeader, FilterBar/DataTable, genuine status pills, enquiry summary and full quote editor/actions; client-side search/status filtering, responsive line items and focusable detail region |
| `/supplier/bookings` | Shared list/detail patterns, past/upcoming dates, status/payment information, Radix create/edit/source dialogs, shared labels/help/feedback, calendar toolbar and responsive calendar scroll region |
| `/supplier/messages` | Shared thread list, participant header, accessible conversation log and composer, loading/empty/error and disabled states |

Dashboard, enquiries, notifications and listing remain migrated as documented above. Signup, onboarding and verification remain legacy outside the seven-route workspace scope. Public marketplace, Customer and Venue bodies, routes, role guards, Supabase schema and backend contracts were not changed.

### Presentation and performance findings

Reused WorkspaceShell, PageHeader, Admin-established forms, DataTable, FilterBar, feedback and status components. Added presentation-only ConversationThread/MessageComposer to `/design-system`, together with the calendar specimen. Native form select events and native quote confirmation behaviour are preserved; booking dialogs use the existing Radix adapter. Detail selection focuses its labelled region so users can find it below long lists. Calendar events now activate the existing selection callback with Enter/Space as well as pointer clicks.

The initial Bookings route previously loaded its calendar library even for list view. Calendar code/CSS now load only on demand: Bookings page **23.91 kB / 6.37 kB gzip**, deferred calendar **216.44 kB / 66.87 kB gzip**, compared with the previous combined **241.10 kB / 72.10 kB gzip** route. The application entry is effectively unchanged at **450.52 kB / 131.53 kB gzip**. Existing role/route lazy boundaries are retained. No new production dependency was introduced.

Calendar busy-date highlighting now uses a memoized Set rather than repeated row scans per day cell. Quote filters reuse loaded records; existing message filtering/local send updates remain. The URL-selected message flow can fetch the thread twice while also marking it read; this was left intact because changing that sequence is messaging behaviour work. No speculative fetch cache or workflow rewrite was attempted.

The calendar toolbar stays above its bounded horizontal scroll region so controls remain visible at 360px. Centralized minimum grid width/height preserve usable cells; list view remains available. Calendar week view retains confirmed pre-existing third-party ARIA structure defects; other migrated UI and month view pass the axe checks.

### Contracts, verification and remaining risks

See [Supplier workflow completion evidence](verification/supplier-workflows-v2/README.md) for screenshots at 360/768/1024/1440px, state/keyboard/guard/payload checks, source comparison and reproducible commands.

- Of 60 retained named Supplier layout/quote/booking/message functions, 59 compare identically as parsed JavaScript. The remaining function only gains detail focus; the booking selection effect gains analogous focus. Existing calls, validation, save/send logic, pricing/credits, transitions and payloads are preserved.
- Supplier workflow, first Supplier, Workspace and Admin fixture suites passed. All backend traffic is intercepted. Tests cover quote validation, re-acceptance, credit failures and mutation contracts; booking/source saves, cancellation, payment flags and calendar/share controls; message failures and send payloads; supporting states and role guards.
- Final Vite compilation passed (5.46 seconds). Full build still fails in the existing SEO prerender stage without Supabase URL/service-role credentials.
- Lint remains at **431 errors / 12 warnings**, with no new workflow diagnostics. New presentation/test modules are clean. Existing conditional-hook and other repository diagnostics were not refactored during this presentation task.
- Live auth, backend permissions, quote/email delivery, credit/payment effects and booking/message persistence remain unverified. The optional deposit feature flag was not enabled in browser verification. Native quote confirmation dialogs remain; week-calendar ARIA defects should receive a separately scoped accessibility fix.

Recommended next step: audit Venue-owner routes and data contracts, then migrate its dashboard, enquiries and listing/profile presentation using these same shell, list, form and feedback patterns. Preserve Venue guards, ownership/claim behaviour, media saves and backend contracts; keep the public venue marketplace separate.

No merge to `main`, deployment or live backend write was performed.

## Venue-owner audit before UI changes — 12 September 2026

Starting from clean `ui-v2-design-system` commit `46d0e5a`. Admin and Supplier migration work is already committed. Read the design system, migration guide, canonical HTML and prior verification evidence before editing Venue UI.

### Existing routes and contracts

- `/venue`: owned-venue overview, with real hero images, location, descriptions and draft/pending-review/published statuses. One authenticated `GET /api/venue/my-venues` loads existing rows. No analytics endpoint or owner operational metrics exist.
- `/venue/:venueId/edit`: loads the same owned-venue collection and selects the requested ID. Fields are shortDescription, description, guestMin, guestMax and comma-separated facilities. `POST /api/venue/update` retains `{ venueId, description, shortDescription, guestMin, guestMax, facilities }`, including numeric/null conversion and facility splitting. The server validates counts, normalizes/truncates copy, updates fields and marks requires_review. The client reloads the owned-venue collection after success.
- Hero/gallery upload: authenticated `GET /api/venue/upload-image?venueId=…&fileName=…&type=hero|gallery`, followed by a raw file `PUT` to the returned uploadUrl/signedUrl with the existing MIME header, then collection reload. Existing client limit is 5MB; file chooser accepts JPEG/PNG/WebP. No owner gallery reorder/delete/caption editor is wired to these screens.
- `/venue/*` redirects to `/venue`. Route-level lazy imports and Venue guards are already present. Server owner access is checked against user_profiles/user_roles and venue_owners_link; these contracts remain untouched.
- Public claim request `/venues/:slug/claim` posts requester_name, requester_email, role_at_venue and message to `/api/public/venues/:slug/claim-request`. `/claim/venue?token=…` reads `/api/public/venue-claim/verify`. Admin `/admin/venue-claims` reviews requests. These are existing public/Admin flows, not owner workspace pages, and remain visually unchanged. The owner empty state preserves the browse-to-claim entry point.
- Alternate `/api/venue/me/venues`, `/api/venue/venues/:id` and image endpoints exist but are not used by the current owner screens and have different DTO/update/storage semantics. Do not switch endpoints during this presentation task.

### Missing/incomplete functionality and risks

There are no owner enquiry, booking, message or notification routes/clients, no owner claim inbox and no owner creation/publication controls. Name/location editing and gallery removal/reordering are not exposed in the current editor. Do not add navigation for these absent capabilities.

Current uploads register metadata (and delete the previous hero metadata) before the file PUT succeeds; a failed upload can therefore leave a broken reference. The active upload endpoint does not set requires_review despite the existing UI's review wording, and it can enforce private storage while alternate endpoints expect public storage. Updates write current venue fields while marking review, rather than maintaining a separate draft. These backend behaviours require a separate functional review; this migration preserves them and does not claim to verify publication isolation.

Save and upload reloads reset the editor form from server data, including any unsaved copy. This is existing behaviour. Claim verification accepts pending, unexpired tokens only; it is not an owner claim-status history UI.

### Performance findings

Venue routes/layout are already lazy; there are no heavy owner dependencies to split. The layout stores a constant dashboard tab through a pathname effect, creating unnecessary state/effect work. Replace this with a stable shared navigation link. Image elements already use lazy loading; retain it and reserve aspect-ratio geometry.

The owned-venue API signs every hero/gallery image sequentially. The editor requests all owned venues and images, then selects one. Both costs are real, but changing endpoint contracts, signing strategy or introducing cross-page caching is outside this presentation task. Preserve post-mutation reloads and current Supabase calls. The overview currently shows an empty state as well as its fetch error; fix this presentation ambiguity without changing the request.

### Venue migration delivered

- `/venue` and `/venue/:venueId/edit`, including profile/media/review status and all supporting states, now use the same WorkspaceShell, Inter/navy/orange palette, PageHeader, forms, feedback and status patterns as Admin/Supplier. No legacy owner-workspace route bodies remain.
- My venues uses a stable Lucide navigation link. Real listing images remain prominent in responsive two-column cards, with plain location text and genuine statuses. Search filters existing rows without fetching. No owner metrics or absent operational pages were invented.
- The editor uses About, Capacity/facilities and Media sections, visible labels/help, keyboard file controls and Submit/Cancel hierarchy. File controls now disable during saves/uploads. All six existing named API/status/load/save/upload helpers compare identically as parsed JavaScript. Existing API calls, payloads, role guards and routes are unchanged.
- Added shared WorkspaceImage and its `/design-system` example: stable 16:9 geometry, lazy loading/async decoding, missing/failed-image states. No production dependency was added.
- The empty overview's intended Browse venues link now renders explicitly; the legacy EmptyState component ignored the supplied action element. Fetch errors no longer also show a successful empty state, and explicit Retry reuses the same load request.

Performance changes are limited to removing the constant navigation state/effect, memoized local search, and stable image geometry. Existing lazy route boundaries remain; browser checks confirm no Admin/Supplier/calendar modules while browsing Venue. The owned-venue collection/signing costs described above remain unchanged. Build artifact measurements and verification details are in [Venue evidence](verification/venue-v2/README.md); no real-user latency claim is made.

Venue, Workspace, Admin and both Supplier browser suites passed, with Venue layouts/states/axe at 360/768/1024/1440px, keyboard/guard checks, exact save/upload payloads and source comparison. Vite compilation passes; the existing SEO prerender credential requirement still prevents the full build. Lint is **430 errors / 12 warnings** (one fewer error from removing Venue's redundant tab effect); migrated/new files are clean.

Public claim request/verification screens remain legacy and outside the owner shell. No missing enquiries, booking, messaging, notification, claim-history or media-management capabilities were invented. Live ownership/auth/storage, claim emails/provisioning and publication isolation remain unverified; the upload/review/storage risks above require staging review before claiming those integrations are correct.

Recommended Customer migration: audit its existing routes and enquiry/quote/message contracts, then migrate the dashboard and enquiry list/detail using the same shared shell, forms, tables and feedback. Follow with quote comparison/acceptance and conversations, retaining their actions, payloads and permissions. Keep public quote and marketplace pages outside that workspace scope.

## Customer audit before UI changes — 12 September 2026

Started from clean `ui-v2-design-system` at `90e8bba`. Read AGENTS, design-system/migration/reference documents and Admin, Supplier and Venue verification evidence before editing.

### Routes, capabilities and contracts

- `/customer`: static welcome dashboard with links to `/customer/enquiries` and public `/request`. There is no dashboard metric/feed endpoint; keep this an honest navigation overview without new fetching or synthetic event metrics.
- `/customer/enquiries`: authenticated `GET /api/customer/enquiries`, returning up to 200 records ordered by created_at descending. DTO fields: id, status, eventDate, guestCount, venueName, categorySlug, createdAt. Preserve the original View and New enquiry destinations.
- `/customer/enquiries/:id`: authenticated detail GET and a separate `/messaging-targets` GET start independently. Detail returns enquiry summary, invited suppliers, quotes, items, status/reacceptance, tokens and embedded thread/message data. No separate quote comparison route exists; the current quote list provides the supported comparison surface.
- Quote Accept/Decline retains unauthenticated token-based `POST /api/public-quote-accept` or `/api/public-quote-decline`, JSON `{ token }`, followed by authenticated detail refresh. UI actions require a token and exact sent status, and disable all quote decisions while one is pending. Accept can create/update a supplier-side booking on the server; no Customer booking screen exists. Re-acceptance remains the existing server flag and status rule.
- Messaging is an enquiry-local dialog opened from an invited supplier. `POST /api/customer/threads/get-or-create` retains `{ enquiry_id, supplier_id, quote_id }`, then `GET /api/customer/threads/:threadId/messages?limit=50`. Send retains JSON `{ body }` with the existing trim/minimum-two-character check and local append. The server enforces 2–2000 characters; preserve its error behaviour instead of imposing a new client limit. No clientMessageId is currently sent.
- Customer guards and API ownership checks remain unchanged. Detail/list use customer_id, while messaging also accepts customer_user_id ownership. `/customer/*` redirects to `/customer`; no route declaration changes are needed.

### Missing or incomplete functionality

No Customer profile/settings, booking/event-management, standalone messages, notifications or standalone quote route exists. Enquiry creation lives on public `/request`; workspace enquiry editing/cancellation is not exposed. No supplier photography is included in these workspace DTOs; do not invent imagery or new supplier fetches.

Messaging requires an existing sent/accepted/declined/closed quote on the server, even though every invited supplier has a Message button. An invite without a suitable quote returns the existing explanatory error. The server supports message cursors, but the UI only retrieves the latest 50; there is no older-history control, realtime subscription, inbox unread flow or Customer read receipt. Reopening resets composer state. Preserve these boundaries and document them.

The detail endpoint fetches all quote statuses, including drafts; do not silently change backend filtering as part of this presentation migration. Public token actions, notification side effects, booking creation and ownership enforcement require staging verification.

### Performance and presentation findings

All three Customer routes and the layout are already lazy. The layout stores pathname-derived active navigation state through an effect; replace it with stable route links. The enquiry list has no search; a local memoized filter can reuse loaded records without backend requests. Message timestamps are reformatted on every keystroke; memoize the conversation presentation rows on message/participant changes.

The detail API loads embedded thread histories that the client does not use; opening messaging still calls get-or-create and retrieves history. Detail and messaging-target endpoints duplicate supplier/quote queries. Preserve these contracts and request sequences rather than changing backend behaviour or adding speculative caches.

A single error state currently hides the entire loaded enquiry after a quote mutation or messaging-target failure. Keep loaded content visible with shared error feedback, while failed/missing or mismatched enquiry IDs expose no detail/actions. A failed thread open currently allows a Send button that only no-ops without a thread ID; disable that control until a thread exists. These are small presentation/state fixes, with existing handlers unchanged.

### Customer migration delivered

All three existing Customer workspace routes now use Workspace v2: `/customer`, `/customer/enquiries` and `/customer/enquiries/:id`. This includes enquiry-local quote comparison/decisions and supplier conversations. No legacy Customer workspace body remains; public request/quote pages remain unchanged and no missing profile, booking, inbox, notification or event-management route was invented.

Reused WorkspaceShell, PageHeader, DataTable, Section, badges, feedback, native form adapters, Radix dialog and ConversationThread. The dashboard stays an approachable navigation overview without new queries/metrics. Event summaries show the existing date/time, guest count, location and message. Quote sections retain supplier text, item quantities/prices, totals and re-acceptance statuses. No supplier images were fabricated or fetched from a new source.

All ten existing request, formatting/status, quote-action and messaging helpers compare identically as parsed JavaScript. The layout's old navigation callback becomes stable links to the same URLs. Small state fixes keep loaded enquiry content visible after quote/target failures, hide mismatched/missing details, enable explicit retry and disable Send without a thread ID. Error histories no longer masquerade as empty conversations. Existing quote decisions, thread creation, 50-message retrieval, trimmed send payload and local append remain intact; server-side message-length error behaviour is preserved.

Performance changes are limited to removing derived navigation state/effect, memoized local enquiry filtering and memoized message display rows/timestamps. Existing lazy loading remains, with no other-role/calendar modules requested during Customer navigation. No production dependency or automatic data fetch was added. Final entry **450.90 kB / 131.66 kB gzip** and enquiry detail **10.46 kB / 3.41 kB gzip** are artifact sizes, not a real-user latency measurement. Backend duplicate/history loading remains separately scoped work.

See [Customer verification](verification/customer-v2/README.md) for screenshots, request contracts, states, keyboard/role checks and source evidence. Customer, Workspace, Admin, both Supplier and Venue browser suites passed. Customer screens/states pass axe and overflow checks at 360/768/1024/1440px. Vite compilation passed (6.53 seconds); full build retains the existing SEO credential failure. Lint is **429 errors / 12 warnings**; the one-error reduction comes from removing Customer's navigation effect. New/migrated files are clean.

Live auth/ownership, token-based quote acceptance/decline, booking creation, notification delivery and messaging persistence remain unverified. The all-status quote response and lack of older-message/realtime/inbox functionality are existing gaps, not new capabilities introduced here.

Recommended next step: verify the complete Customer-to-Supplier enquiry, quote/re-acceptance, booking and conversation flows in staging with real role accounts. Resolve the documented backend contract/exposure issues separately, then migrate public request and quote presentation using the established design system. No merge to `main` is part of this work.

## Customer-to-Supplier verification — 12 September 2026

Continued from `74c8887` with no redesign. [Connected workflow evidence](verification/customer-supplier-workflow/README.md) now covers actual React pages and actual API handlers sharing isolated stored enquiry/quote/message/booking data. The six existing browser suites also pass. Live integration sign-off remains blocked by missing designated staging accounts/application credentials.

Two narrow API fixes: Customer enquiry detail now applies the existing sent/accepted/declined/closed visibility rule before loading quote relations; Supplier thread reads now select the latest 500 messages and return them chronologically. Draft-content and 505-message regressions reproduce the old defects and pass with the fixes. No frontend, auth, route, credit/quote/booking/message mutation, schema or policy changed.

**Draft exposure is only mitigated at the endpoint.** Read-only live metadata shows `quotes_select_customer_owned` permits owned quotes without a status predicate, leaving direct authenticated Data API draft exposure. Correcting that requires a policy migration, so work on that remediation stopped under the user's no-schema instruction. This remains a production blocker. At inspection there were no linked drafts or threads over 50; that does not remove the latent defects.

The connected run also reproduces the missing decision token immediately after sending: the existing Supplier reopen/copy-link path creates it later. Notification inbox counts clear but the topbar remains stale until reload/navigation; Supplier message opening issues duplicate reads and incoming replies need reopening/refresh. These pre-existing behaviors and remaining history/cursor, transactional side-effect and staging risks are documented in the evidence. No new features or speculative synchronization refactor was added.

Vite compilation passes; full build retains the existing SEO credential failure. Lint remains 429 errors / 12 warnings without new diagnostics. Next: separately review/authorize the RLS and send/link corrections, then verify live role accounts, email delivery, credits, booking recovery and message persistence in staging before production sign-off.


## Customer/Supplier policy and reliability remediation — 12 September 2026

Continued from `83a1ff6`. [Security verification and staging steps](verification/customer-supplier-security/README.md) supersede the previous remediation stop condition. Focused migration `20260912143031_customer_quote_visibility.sql` restricts Customer quote reads to owned sent/accepted/declined/closed rows, restricts quote-linked Customer conversations consistently, and enables RLS on the previously anonymously readable `quote_public_links` capability table. Supplier-own drafts and Admin quote access are unchanged. The service-role Customer message endpoint receives the same draft/mismatched-enquiry guard.

The real PostgreSQL/PostgREST regression first reproduces the leaks, then verifies direct role-authorized Supabase queries after migration, including Supplier/Admin access and quote state transitions. **This migration has not been applied to the live project.** Live inspection was read-only; staging with real role sessions, email, credit/booking recovery and message persistence remains required. Previously exposed capabilities may require separate incident review; the patch does not rotate links.

Send now creates/reuses its decision token before publication and credit spending, preventing the missing-token handoff. Lookup/insert failures retain draft and balance; revoked links stay revoked; concurrent creators reuse one token. Historical sent quotes retain the existing Supplier recovery endpoint. Response shapes and quote decision/credit/booking mutation contracts are preserved.

The Supplier inbox synchronizes the shell badge without another notifications-route count request. Initial thread reads drop from 8 to 4 in the development fixture by separating list and selected-thread loading. Delayed old conversation responses cannot replace the current selection. Own mutation updates and explicit refresh/reopen remain; no realtime/polling or broad architectural rewrite was introduced. All six existing browser suites and the expanded connected workflow pass. Vite compilation passes; full build retains the SEO credential failure and lint remains 429 errors / 12 warnings with no new diagnostics.

Next: apply the reviewed migration in staging, verify real Customer/Supplier/Admin JWTs and end-to-end side effects, then promote the migration/API/frontend release. Transactional recovery, history pagination/tied cursors and cross-tab live refresh remain separately scoped work. No merge to main.

## Public marketplace foundation — 12 September 2026

Continued from `8bb491d`, using the supplied `docs/reference/frontend/` as the public visual contract. Migrated `/`, `/suppliers` and `/venues`, plus shared MarketingShell/header/footer, search/filter/result states and supplier/venue/category cards. The public system uses Inter and scoped light/navy/orange/pastel tokens with larger desktop typography; workspace geometry is unchanged. Public patterns are represented on `/design-system`.

Existing endpoints, ranking/eligibility, SEO helpers/canonicals/JSON-LD, routes and Supabase calls are preserved. Home retains its existing categories/four-venue feeds and supplier-search destination. Unsupported fake reference metrics/prices/filters/favourites and placeholder destinations are omitted. Clear loading/error/empty and image-failure states replace misleading empty/zero displays. Missing response hours no longer become a fabricated zero-hour signal. Rapid URL filter updates preserve the latest browser query instead of overwriting another just-selected filter.

Home is now lazy, overlapping public GETs are coalesced without settled caching, and imagery reserves layout space. Entry bundle changes from 450.95/131.69 kB to 433.47/126.78 kB (raw/gzip); the self-hosted reference hero adds responsive 99/312 KiB WebP candidates. No API or database refactor is included. Existing 24-result windows and server-side batch processing remain.

See [public verification](verification/public-v2/README.md) for screenshot/state/accessibility evidence, query contracts, performance costs and remaining routes. New public tests, six existing workspace suites and the connected Customer/Supplier workflow pass; Vite compiles and lint retains 429 errors/12 warnings with no new diagnostics. Full SEO prerender still requires configured Supabase credentials. Supplier/venue profiles and category/SEO landings are the next public migration candidates; prior live security-migration/staging requirements remain separate and unchanged.

## Public Supplier/Venue profiles — 12 September 2026

Continued from `2603f12`. `/suppliers/:slug` and `/venues/:slug` now use the shared Public UI v2 profile pattern: larger Inter typography, photography-led responsive gallery, plain content sections, real review/service/facility information and orange enquiry actions. Existing quote, category, supplier, venue and claim URLs remain intact. Profile examples are on `/design-system`; category/SEO/request/auth/claim page bodies remain outside scope.

The two existing public GET endpoints, DTOs, database queries, publication gates, routes, metadata and JSON-LD implementations are unchanged. Venue facilities were already in its DTO and are now displayed. No packages/prices/FAQ/Venue-review/map/availability/message feed was invented. Existing tag-derived Venue labels are retained.

Narrow fixes remove Supplier null-to-zero response/conversion claims and prevent stale profiles/structured data after slug changes fail. Both pages reuse in-flight-only public GET coalescing, with distinct 404 state and fresh retry. Only cover/two previews mount initially; other gallery URLs load on selection. No original-URL transformation contract, dependency or backend cache was introduced. Full results, performance limits and staging risks are in [public profile verification](verification/public-profiles-v2/README.md).

## Category and SEO landing migration — 12 September 2026

Continued from `176b981`. Migrated `/categories`, `/categories/:slug`, `/category/:categorySlug`, `/category/:categorySlug/:locationSlug`, `/location/:locationSlug` and the existing flat `/:slug` supplier SEO template. `/browse` still redirects to `/categories`. No Venue type/category template exists. Shared public header/type/cards/search/pagination and full category/supplier descriptions replace legacy blue gradients and card wrappers. Existing H1/intro expressions and CTA destinations are retained.

Build-time listPageHtml gains only a style wrapper using the same public tokens and emitted Inter fonts. Static directory/category links, supporting text, head/schema generation, route-generation logic and sitemap output are preserved. Runtime metadata, slug helpers, pagination callback, response metadata/schema mappings and read URL expressions compare identically as AST to the baseline. No API, Supabase, route or rewrite change is included.

In-flight public GET coalescing reduces duplicate initial requests; 300ms search debounce and 12/24/36/48 result limits remain. Pathname-keyed templates prevent stale prior-slug metadata/content. Errors no longer masquerade as empty/zero results, and retry preserves the existing GET contract. No new feed, copy, workflow or image-transformation service was invented.

[SEO verification](verification/public-seo-v2/README.md) includes responsive/keyboard/axe/state checks, exact metadata and ItemList output, paging/search/link contracts, JS-disabled static output and sitemap comparison. Existing deployment gaps remain separately scoped: an explicit two-segment category/location rewrite is absent, unknown flat slugs lack a document-level 404, dynamic/build-time sitemap strategies differ, and configured live prerender/data checks remain required. Next: audit the public request → quote comparison/decision journey before migrating its presentation.

## Public request-to-quote journey — 12 September 2026

Migrated `/request`, `/suppliers/:slug/request-quote`, `/request/:token`, `/enquiry/:token`, `/quote/:token` and `/booking-access?t=` to Public UI v2. Shared journey sections, labels, status/decision presentation and Radix messaging reuse the existing public shell/components/tokens and are registered at `/design-system`. Request success still resolves to enquiry comparison; no multistep workflow was introduced. Unrouted RequestStatusPage and native quote accept confirmation remain intentionally unchanged.

Parsed source regression checks preserve all workflow statements, field/action bindings, payloads and validation. API, RLS, route/guard and library source are unchanged. Extended connected tests exercise the anonymous migrated quote against actual handlers, including revised acceptance/booking confirmation, persisted messages and revoked/draft/missing-token denial. See [full verification and remaining staging risks](verification/public-journey-v2/README.md).

No fetch/cache/credit/token changes. Public quote no longer depends on WorkspaceShell; entry size remains effectively unchanged. A newly documented existing limitation is public-thread's oldest-500 window; fixing it requires a separate API/history scope. Time-based token expiry is not an existing reader capability. The previous RLS migration still needs designated staging deployment/verification. Auth/onboarding is the next visual migration.

## Auth, onboarding and claim presentation — 12 September 2026

Migrated shared `/login`, Supplier signup/verification/three-step onboarding, Venue claim request/verification, auth callback, forgot/reset password and App access states to the same focused Public UI v2 AuthShell. Existing Supplier login/onboarding/signup and reset aliases are preserved. No dedicated Customer register or Venue signup/media onboarding exists. PublicLogo is now a small shared module; AuthShell adds no session or network work. The pattern is represented at `/design-system`.

[Auth verification](verification/auth-v2/README.md) records exact source/field/API/guard contracts, 80 responsive/axe/state screenshots and installed-client fixture tests for password/OTP/signup/recovery/verification/claim flows, valid role returns, unsafe return fallback, and logout/re-login across roles. Existing workspace/public/connected workflow suites also pass. No backend, RLS, role, redirect, email or validation behavior changed.

Remaining auth limitations are explicitly preserved: bare login magic callback drops returnTo, aliases drop parameters, role returns exclude arbitrary public booking paths, recovery accepts an existing session, and onboarding review submission may continue after a caught save failure. Live Auth, email delivery, signup credits and Venue approval provisioning require designated staging accounts; earlier RLS deployment remains unconfirmed. Next visual scope is general marketing/fallback/static legacy presentation, with security/workflow corrections handled separately.

## Final presentation sweep — 12 September 2026

Continued from `fea139f4c131f21b8322ac90cc6867f949deeee2`. Migrated `/how-it-works`, `/pricing` and `/contact` to the established public header, plain sections, FAQ and CTA system. Existing copy, pricing/roadmap labels, mailto subject, metadata and destinations remain unchanged. Global loading/import-error presentation reuses the focused v2 public panel. Existing not-found and wildcard redirects are preserved; MarketingShell's legacy width branch is retired. One comparison messaging notice now uses existing journey surface tokens.

Static home/list/profile fallback bodies share the public tokens and emitted Inter fonts. Removed duplicated legacy CSS without changing crawlable content, links, head/schema, sitemap, data or route generation. Eleven proven-unreferenced UI/starter files were removed; uncertain assets/archive and API-used server modules remain. Shared informational patterns are registered on `/design-system`.

[Final sweep evidence](verification/final-v2-sweep/README.md) records responsive/keyboard/axe/SEO/static checks, removed-file evidence and remaining staging requirements. Entry gzip remains 128.11 kB, no new requests/dependencies and existing code splitting remains. Vite compiles; full build still needs configured Supabase prerender credentials. Lint has no added diagnostics (428 errors/12 warnings after one obsolete-file diagnostic disappears).

No additional active legacy public body was found. Browser-native controls/confirmations and scoped base primitive compatibility styles remain intentionally. The next step is configured Vercel Preview/staging release QA, including prior RLS deployment, auth recovery/return and onboarding review risks, and direct-link/SEO delivery checks. These are separate behavioral/deployment issues; no backend/schema/RLS/rewrite changes or merge to main are included.

## Preview prerender build policy — 12 September 2026

Preview builds (`VERCEL_ENV=preview`) now retain the successful Vite application output and explicitly skip only SEO prerender when the existing Supabase prerender URL/service-role credentials are unavailable. Production, local and other environments retain strict missing-credential failures. Preview with credentials still prerenders and still fails on data errors. No runtime/auth/RLS/query/SEO-generation contract changed.

[Build-policy verification](verification/preview-build/README.md) covers 13 isolated cases, real Vite builds for missing-key Preview/Production and fixture-backed Production, generated SEO pages/sitemap, and absence of a private canary in every generated artifact. Configured live QA remains required; this supersedes the final sweep's Preview credential build blocker without relaxing Production requirements.

## Dependency-install cleanup — 12 September 2026

The supplied Vercel log isolated a preceding installation failure: npm rejects the malformed direct `-` dependency. Removed `-` plus the confirmed-unused `g` and application-level `npm` dependencies. npm regenerated the lockfile, removing npm's bundled subtree and restoring cross-platform optional metadata without changing retained package versions/integrity. Workspace/fresh npm installs, Vite, the 13-case build-policy suite, final-sweep regression and package-name validation pass; no new lint diagnostics. See [install repair evidence](verification/preview-build/README.md#dependency-install-repair). Production prerender safety and runtime contracts remain unchanged.


## Focused performance pass — 12 September 2026

Baseline `c0d08ae`; see [the route-by-route performance audit](verification/performance-v2/README.md) for measurements, query shapes, top five bottlenecks, remaining slow paths and staging requirements. Public supplier search/profile and venue profile now parallelize independent batch reads without changing filters, publication gates, responses, schemas or permissions. Supplier dashboard launches optional services alongside core reads and renders counts/history independently; Admin panels render as their individual responses arrive. Dashboard cleanup rejects late obsolete results. No private cache, polling, dependency change or workflow mutation change.

Controlled 50 ms-per-query API samples: supplier search **255 → 105 ms** (four → two sequential stages), supplier profile **203 → 154 ms** (four → three), venue profile **305 → 204 ms** (six → four). Query counts remain 4/5/7. Compiled browser fixtures with deliberately slow optional panels show first useful Supplier metric **2,440 → 1,247 ms**, Admin **1,925 → 958 ms**. These are synthetic latency samples, not live benchmarks. Matched-environment entry stays **436,435 bytes / ~128.08 kB gzip**; lazy dashboard additions total 363 bytes. Workspace routes/layouts and calendar retain emitted chunk isolation.

Existing public/workspace/auth/workflow/SEO/RLS suites, targeted scheduling/contract/chunk tests and 13 build-policy cases pass. Lint remains 428 errors / 12 warnings with no added diagnostics. Live Preview protection blocked app/API latency and logs; real cold/warm p50/p95, database plans/cardinality, image transfer sizes and authenticated staging workflows still need measurement before promotion. No live database or infrastructure changes were made.

## Live Preview performance investigation — 12 September 2026

Continued from `7f189b0`. [Live evidence, route coverage and reproduction](verification/live-preview-performance/README.md) distinguish inaccessible Preview application timings from actual connected-project database/storage measurements. GitHub confirmed the successful branch Preview; all 42 probes hit Vercel authentication. The connector could not inspect that deployment or create an access link. Authenticated dashboards, API cold/warm times, quote chains and geocoding remain unmeasured; fixture timings are not presented as live improvements.

Read-only EventWow database plans returned 89 published venues in 0.467 ms and five published suppliers in 7.595 ms (0.178 ms on repeat). Relevant historical PostgREST statistics have a highest selected mean of 26.293 ms. Current small cardinalities and existing indexes do not justify an index migration. The Preview-to-project binding and serverless region still need confirmation.

A published venue hero demonstrably transfers 3,413,944 bytes; the existing Supabase transformation service serves it at 37,518 bytes / 640 px and 160,990 bytes / 1600 px. Public listing/profile images now select responsive candidates with an original-image fallback; private/signed/external URLs and SEO/API image contracts are unchanged. Gallery priority, lazy previews, keyboard controls and placeholders remain. No auth, backend, schema, RLS, dependency, cache or business-logic changes. The initial JS bundle stays 436,435 bytes. Production performance acceptance still requires authorized Preview/staging navigation measurements.
