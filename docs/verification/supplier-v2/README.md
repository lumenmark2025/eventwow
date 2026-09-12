# Supplier Workspace v2 verification — 12 September 2026

This records the first Supplier phase. Quotes, Bookings and Messages have since been migrated; see [completion verification](../supplier-workflows-v2/README.md). The original route-isolation/source comparison below describes that earlier snapshot. The current Supplier runner now expects the quote handoff to use v2 presentation.

All screenshots use synthetic browser-local fixtures, including labelled placeholder images. Every API and Supabase request is intercepted; no test data was written to a server or exposed on the public marketplace.

## Routes and viewports

Every route below passed populated, loading, empty and error layout checks at **360, 768, 1024 and 1440px**. Populated/empty/error screens passed axe WCAG A/AA checks and document overflow assertions. Loading screens passed visibility/overflow checks. Screenshots were visually compared with the canonical HTML and the Admin-established implementation. Existing workspace geometry and the accessible orange action token are retained.

| Route | Mobile | Tablet | Laptop | Desktop |
| --- | --- | --- | --- | --- |
| `/supplier/dashboard` | [360](dashboard-360.png) | [768](dashboard-768.png) | [1024](dashboard-1024.png) | [1440](dashboard-1440.png) |
| `/supplier/enquiries` | [360](enquiries-360.png) | [768](enquiries-768.png) | [1024](enquiries-1024.png) | [1440](enquiries-1440.png) |
| `/supplier/notifications` | [360](notifications-360.png) | [768](notifications-768.png) | [1024](notifications-1024.png) | [1440](notifications-1440.png) |
| `/supplier/listing` | [360](listing-360.png) | [768](listing-768.png) | [1024](listing-1024.png) | [1440](listing-1440.png) |

State screenshots use `<route>-loading-360.png`, `<route>-empty-360.png` and `<route>-error-360.png` in this directory.

## Behaviour checks

- Requests: unchanged status query values, client search, full event details in Radix dialog, Escape/focus return, quoted/declined disabled actions, pending decline state, exact decline payload and original quote-creation handoff to `/supplier/quotes?open=quote-1`.
- Notifications: original five-record limit, single/all mark-read payloads, pending/zero-unread disabled states, original open destination.
- Listing: associated labels, unsaved/saving/saved states, Cancel restores the loaded draft without a request, postcode normalization/validation, failed save keeps edited values, exact save payload including publication gate.
- Media: file control keyboard focus, MIME/5MB validation, upload busy state, hero/gallery upload payloads, gallery reorder boundaries and ID order, deletion IDs. Service removal and category toggles also checked.
- Credits: unchanged bundle identifiers/prices and checkout payloads; both purchase controls disable while pending; failed checkout is visible. No payment or real checkout occurred.
- Every page: empty/error distinction, error retry, unavailable dashboard metrics rendered as em dashes instead of false zeroes.
- Keyboard: shared mobile navigation and command search, Radix Escape/focus restoration, account menu; request-detail and mobile-drawer axe checks.
- Guards: signed-out, Admin, Customer and Venue sessions redirect away from all four Supplier routes without Supplier API calls. An incomplete Supplier still redirects to onboarding.
- Route isolation: browsing the four migrated pages never requested Admin, Venue, Supplier Quotes, Bookings or Messages page modules. Quote handoff keeps the legacy body outside `.workspace-ui`.

[Runner results](results.json) and [source/lint comparison](source-comparison.json). Existing named business/helper functions compare identically as parsed JavaScript with the Supplier-phase starting snapshot; DataTable's only change is the optional wrapping class. App routing, auth redirect code and Quotes/Bookings/Messages source are byte-identical to that snapshot.

## Commands and limits

Use Node 22, install dependencies, and install Playwright Chromium (`npx playwright install chromium`). Start a fixture-only dev server:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
```

Then run `npm run test:supplier`. Optional `WORKSPACE_TEST_URL` selects the local server and `SUPPLIER_SCREENSHOTS` selects output (default `/tmp/eventwow-supplier-v2`). These dummy settings do not provide live authentication and must not be deployed.

- Supplier, Workspace and Admin browser suites all passed.
- `npm run build`: Vite compilation passes; SEO prerender still fails because this environment lacks the existing required Supabase URL/service-role credentials.
- `npm run lint`: existing **431 errors / 12 warnings**, with no added diagnostics in migrated/shared files and none in the Supplier runner.
- Fixture tests establish frontend behaviour and request contracts. They do not establish live storage, authentication, backend permission enforcement or checkout integration correctness.
