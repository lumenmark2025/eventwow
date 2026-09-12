# Public request-to-quote UI v2

## Pre-migration audit

Starting commit: `1bd6257cbc09315f70647382a24c614049d38ff6`.

| Route | Existing contract |
| --- | --- |
| `/request?category=&venue=` | Single-page form; optional venue GET; session-aware POST `/api/public/enquiries`; navigate to returned `/enquiry/:token`. |
| `/suppliers/:slug/request-quote` | Supplier request-context GET, 200ms debounced venue search, existing category/event/message validation and same enquiry POST with supplier-specific payload. |
| `/request/:token`, `/enquiry/:token` | Same comparison screen and noindex metadata; enquiry quotes GET; shortlist POST; accept/decline POST using quote token, then refresh; start-thread + thread GET; local append after message POST. This is also the existing request success destination. |
| `/quote/:token` | Anonymous route bypass retained in App; quote/thread GET; accept retains native confirmation; decisions send token + note; message sends trimmed body + client ID; existing deposit feature flag and payment URL parameters retained. |
| `/booking-access?t=` | Booking token GET; session check controls messaging/login handoff; optional magic-link POST; existing quote path and returnTo parameters. |

No multistep request flow exists. `RequestStatusPage.jsx` is unreferenced/unrouted legacy code, so it is not wired in or removed. Comparisons permit decisions only for sent quotes; re-acceptance follows Supplier revision back to sent, not arbitrary declined → accepted. No request/quote workflows will be added.

All API, RLS, token, credit and booking code remains outside this presentation change. The previous security migration is locally verified but **not confirmed deployed**; see [security verification](../customer-supplier-security/README.md). Existing fixed history windows, manual cross-tab refresh and nontransactional side effects remain separately scoped. Existing StrictMode duplicate initial token reads will not be masked with a new sensitive-response cache.

## Presentation delivered

All six active route shapes in the table above now use Public UI v2. Request success remains the existing enquiry/comparison destination. Shared `PublicJourneyComponents` reuse `MarketingShell`, `PublicPageHeader`, `PublicButton`, `PublicSelect`, Input, Inter and public semantic tokens. They add reusable form sections, visibly labelled fields, content sections, page/inline states and a Radix messaging dialog with Escape, focus containment and return to its opener. The new patterns are demonstrated at `/design-system`.

The forms retain every existing field, option, requirement and single-page submission. Budget/power choices now expose their pressed state. Quote lists, breakdowns, totals, statuses and decisions use larger readable typography; the comparison region supports horizontal scrolling by touch/keyboard with a visible hint. The existing List view remains available on mobile. Quote status and existing event context are also visible when the deposit feature flag is off. Payment flag reads, payment return parameters, payment actions and the existing empty deposit panel are otherwise unchanged.

No active journey route retains its old shell or presentation. The unused `RequestStatusPage.jsx` remains legacy/unrouted. The native accept confirmation is intentionally retained with exactly the same confirmation boundary. General marketing, auth/onboarding and workspace screens were not redesigned.

## Contract and security evidence

`npm run test:public-journey` first compares parsed source against the starting commit. It asserts exact equality of all non-presentation component statements (hooks, helpers, validation and handlers) and all form/action bindings, values and constraints. It also requires API, migration, route/guard and library source to be unchanged. This protects token + note decisions, supplier-specific versus general enquiry payloads, both public messaging payload variants, magic-link and deposit behavior.

The connected workflow browser suite now continues after Customer logout onto the **anonymous** migrated quote route using the same stored records and actual API handlers. An actual Supplier save revises the accepted quote, resets its booking to draft, and requires re-acceptance. Anonymous confirmation returns that same booking to confirmed at £1,200. An anonymous message persists across reload and appears in the Supplier thread. Real handlers deny revoked, draft and missing-token requests without exposing quote content. The existing connected submit → Supplier receive/draft/send → Customer accept and two-way message steps still run first.

The existing isolated PostgreSQL/PostgREST RLS suite passes: Customer draft denial, owning Supplier draft/item access, Admin access, anonymous token enumeration denial and sent/accepted/re-accepted/declined/closed transitions. **No migration was created, changed or applied by this UI migration.**

## Verification

- Journey browser fixtures: 360 / 768 / 1024 / 1440px for both forms, enquiry list/comparison, Radix conversation, token quote and booking handoff; no horizontal page overflow or WCAG A/AA axe findings. Screenshots were visually reviewed against the existing Public UI v2/reference sizing, typography and colors.
- 36 responsive/state/accessibility snapshots plus action assertions: supplier form validation, keyboard venue selection, exact enquiry budget/power/venue payload, backend validation errors, request success/empty results, shortlist filtering, both message contracts/persistence/order, accept cancellation/confirmation, decline, revised re-acceptance, disabled terminal actions, quote loading and token errors, booking missing token, login returnTo, magic-link payload and signed-in booking messages.
- `test:customer-supplier`: five actual-handler regressions plus extended connected browser (120 API calls; initial Supplier thread reads remain 4 in development StrictMode).
- `test:quote-rls`, `test:public`, `test:customer`, `test:supplier-workflows`, `test:workspace`: passed. Existing suites verify role guards, access under each role, cross-role redirects, protected route/code isolation and relevant Customer/Supplier mutation contracts.
- Agent-browser smoke: request page controls/labels present, no browser errors.
- Vite compilation passed. Full-repository lint remains **429 errors / 12 warnings**, with zero new diagnostics compared by file/rule/severity/message. Unrelated debt remains untouched.

Fixtures use synthetic records only, isolated to local verification. No public production data, live email or real charges are involved. Run with Node 22 and the existing dummy local Vite settings documented in the [workflow verification](../customer-supplier-workflow/README.md). `JOURNEY_SCREENSHOTS` changes the output directory (default `/tmp/eventwow-public-journey-v2`).

## Performance and remaining risks

- Lazy imports and route URLs are unchanged. The public quote route now uses the existing public shell rather than importing the workspace shell. Shared journey CSS/components remain split from the entry bundle; no dependencies, images, requests, caches, subscriptions or polling were added. Existing derived calculations and mutation refreshes are unchanged. Entry JavaScript is 433.70 kB / 126.86 kB gzip (baseline 433.80 / 126.87); shared journey JavaScript is 2.11 kB / 0.85 kB gzip and CSS is 6.32 kB / 1.42 kB gzip. Final build sizes are recorded in `checks.json`.
- Existing StrictMode duplicate initial reads remain. In particular, quote/thread token reads have side effects (view/read tracking); this migration does not deduplicate them with a new cache or change those semantics.
- **Public thread history is the oldest 500 messages** (`public-thread.js`, ascending + limit 500), unlike the previously fixed Supplier latest-500 window. Long public conversations may omit newer replies after reload. This requires a separately authorized history/API correction; no contract was changed here. Customer latest-50 pagination/cursor limits and manual cross-tab refresh also remain.
- Quote/enquiry/booking-access readers have no time-based token expiry contract. Revoked/missing/draft quote links deliberately return the same 404. Synthetic 410 responses verify generic error presentation only; they do not prove or introduce expiry support.
- Comparison uses the existing immediate accept/decline behavior; standalone quote acceptance keeps its native confirmation. Re-acceptance is supported after Supplier revision to sent, not by enabling decisions on a terminal declined quote.
- The prior RLS hardening migration is still not confirmed deployed. Live Auth/session revocation, email delivery, payment-enabled checkout, credit-ledger concurrency, booking crash recovery and durable cross-role persistence against staging remain unverified. Existing nontransactional side effects and token/ownership behavior remain documented in the [security follow-up](../customer-supplier-security/README.md).

Recommended next task: migrate login, password recovery, auth callback and role onboarding presentation onto the same public patterns, with separate session/returnTo/magic-link regression coverage. Before production sign-off, deploy/verify the previously prepared RLS hardening in designated staging and exercise the live request-to-quote flow with test role accounts.

[Browser results](browser-results.json) · [Connected handler/browser evidence](connected-results.json) · [Checks](checks.json) · [Desktop request](request-1440.png) · [Mobile comparison](quotes-compare-360.png) · [Desktop quote](quote-1440.png) · [Tablet booking](booking-768.png)
