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
- Vite production build passed (5.62 seconds). Full build still fails at the pre-existing SEO prerender credential requirement.
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
