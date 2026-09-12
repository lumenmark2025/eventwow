# Supplier workflow completion verification — 12 September 2026

Completed on `ui-v2-design-system`. All seven Supplier workspace bodies now use Workspace v2. This phase covers Quotes, Bookings and Messages; [the first Supplier phase](../supplier-v2/README.md) covers overview, enquiries, notifications and listing. Signup, onboarding and verification remain outside this workspace scope. Public pages and Venue/Customer bodies were not redesigned.

Every backend request is intercepted with synthetic browser-local fixtures. No quotes, bookings or messages were written to live services. These checks establish frontend behaviour and request contracts, not live backend correctness.

## Visual coverage

Populated lists, details, booking forms, sources, month/week calendars, message threads and quote re-acceptance were captured at **360 / 768 / 1024 / 1440px**. Loading, empty and error states were exercised at all four widths, with mobile state screenshots retained. Document overflow checks pass. Visual inspection covered mobile, tablet, laptop and desktop screens against the canonical HTML and existing Admin implementation.

| Screen | Mobile | Tablet | Laptop | Desktop |
| --- | --- | --- | --- | --- |
| Quotes | [360](quotes-list-360.png) | [768](quotes-list-768.png) | [1024](quotes-list-1024.png) | [1440](quotes-list-1440.png) |
| Quote detail | [360](quote-detail-360.png) | [768](quote-detail-768.png) | [1024](quote-detail-1024.png) | [1440](quote-detail-1440.png) |
| Bookings | [360](bookings-list-360.png) | [768](bookings-list-768.png) | [1024](bookings-list-1024.png) | [1440](bookings-list-1440.png) |
| Booking detail | [360](booking-detail-360.png) | [768](booking-detail-768.png) | [1024](booking-detail-1024.png) | [1440](booking-detail-1440.png) |
| Booking editor | [360](booking-edit-360.png) | [768](booking-edit-768.png) | [1024](booking-edit-1024.png) | [1440](booking-edit-1440.png) |
| Calendar | [360](booking-calendar-360.png) | [768](booking-calendar-768.png) | [1024](booking-calendar-1024.png) | [1440](booking-calendar-1440.png) |
| Messages | [360](message-thread-360.png) | [768](message-thread-768.png) | [1024](message-thread-1024.png) | [1440](message-thread-1440.png) |

Modal screenshots show the viewport and internal scrolling. Other screenshots show full pages. Additional source-management, week-calendar, re-acceptance and state screenshots are in this directory.

## Behaviour and accessibility

- Quotes: search/status filters, validation, line-item add/reorder, totals, exact save/send/public-link/close/reopen/message-thread request payloads, credit failures, failed-save draft retention, cancelled close confirmation, and accepted-quote edits requiring re-acceptance. Existing `/supplier/quotes?open=…` and Messages query-string handoffs are preserved. Native Close/Reload confirmation behaviour remains.
- Bookings: existing origin/date/status contracts, external source defaults/create/toggle, create/edit fields and payloads, required-date validation, failed-save form retention, cancellation and paid flags, share/revoke links, and disabled pending controls. Calendar controls retain navigation, selection, views and persisted view preference. Enter/Space now activate the same booking-selection callback as a pointer click; verification reloads to clear prior selection before testing activation.
- Messages: URL-selected thread, thread search/presentation, empty history, trimmed send body, thread ID and generated client-message UUID, failure retaining composer content, and empty/whitespace/pending disabled states. A successful send updates locally without an additional fetch, as before.
- States: all three lists cover loading/empty/error and retry at each width. Detail loading/error/missing records and empty history are checked. Error states do not masquerade as successful empty results.
- Keyboard: booking selection, Radix dialog Tab containment, Escape and opener-focus restoration, calendar navigation/event controls. A focused check also verifies Space activates an event from a cleared selection. Existing workspace navigation/command/account controls are covered by the regression suites. Quote and booking selection also focus their labelled detail regions.
- Guards: all three routes reject signed-out, Admin, Customer and Venue fixtures without Supplier API requests. Routing/auth sources and route wrapper files are unchanged from the start of this phase. The earlier Supplier suite also checks incomplete-Supplier onboarding.
- Axe WCAG A/AA checks pass except for narrowly scoped **pre-existing react-big-calendar week-view ARIA defects**: `aria-required-children` on `.rbc-row-content` and `aria-required-parent` on week headers/all-day cells. The identical issues were reproduced using the pre-change calendar; [baseline evidence](calendar-baseline-aria.json). The runner permits only these known rules/targets in the week specimen. It does not suppress other violations. Month and other migrated UI pass without these exceptions.

[Runner results](results.json), [build/lint summary](checks.json), and [source comparison](source-comparison.json).

## Business-logic preservation and performance

Parsed-source comparison against the completion-phase starting snapshot finds **59 of 60 retained named Supplier layout/quote/booking/message helpers and workflow functions identical**. `openQuote` only adds focus to its detail region. The booking selection effect gains the analogous presentation focus. API calls, validation, mutation handlers, payload builders, pricing, credits and state transitions remain unchanged. This named-function comparison is a scoped check, not a claim that every line in the edited files is identical.

The calendar is now a separate lazy chunk requested only when Calendar is opened. Browser checks assert no calendar module on the initial Bookings list. Bookings page code is **23.91 kB / 6.37 kB gzip**; the deferred calendar is **216.44 kB / 66.87 kB gzip**. Previously the Bookings route loaded the calendar in its **241.10 kB / 72.10 kB gzip** chunk. The initial application entry remains effectively unchanged at **450.52 kB / 131.53 kB gzip**. These artifact measurements do not establish real-user latency gains.

Busy-date highlighting now builds a memoized Set once per booking-row update instead of scanning rows for each calendar day cell. Quote filters are derived from loaded rows in their presentation component; existing message filtering is retained. No production dependency, backend request or speculative cache was added. The existing URL-selected message sequence can fetch a thread twice and marks it read; it was deliberately preserved to avoid changing messaging semantics.

## Reproduction and limits

Use Node 22, installed dependencies and Playwright Chromium. Start the fixture-only server:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
```

Run:

```sh
npm run test:supplier-workflows
npm run test:supplier
npm run test:workspace
npm run test:admin
npm run build
npm run lint
```

Optional `WORKSPACE_TEST_URL` selects the local server; `SUPPLIER_WORKFLOW_SCREENSHOTS` selects output (default `/tmp/eventwow-supplier-workflows-v2`). Never deploy the dummy fixture settings.

All four browser suites passed. Final Vite compilation passed in 5.46 seconds; the full build then failed at the existing SEO prerender requirement for Supabase URL/service-role credentials. Lint remains at the starting **431 errors / 12 warnings**; source/rule comparisons show unchanged diagnostics in the workflow files, and new presentation/test modules are clean. The repository backlog was not repaired.

Live Supabase/auth/permission enforcement, email/quote delivery, payment/credit effects and booking/message persistence require configured staging verification. The optional deposit feature flag was not enabled in browser tests; its existing handlers remain unchanged. Native quote confirmations and the known week-calendar ARIA structure remain follow-up limitations. No regressions were detected within the fixture coverage; no merge, deployment or live write was performed.
