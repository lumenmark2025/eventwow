# Customer Workspace v2 verification — 12 September 2026

Completed on `ui-v2-design-system`, starting from clean `90e8bba`. All three Customer workspace routes now use the existing Workspace v2 shell and presentation components. No API, schema, auth/guard, public page or other role source was modified. Every backend request is intercepted with synthetic browser-local fixtures; no real quotes were accepted/declined and no messages were sent to live services.

## Screens and widths

| Screen | Mobile | Tablet | Laptop | Desktop |
| --- | --- | --- | --- | --- |
| `/customer` dashboard | [360](dashboard-360.png) | [768](dashboard-768.png) | [1024](dashboard-1024.png) | [1440](dashboard-1440.png) |
| `/customer/enquiries` | [360](enquiries-360.png) | [768](enquiries-768.png) | [1024](enquiries-1024.png) | [1440](enquiries-1440.png) |
| `/customer/enquiries/:id` summary/quotes | [360](detail-360.png) | [768](detail-768.png) | [1024](detail-1024.png) | [1440](detail-1440.png) |
| Quote re-acceptance | [360](reaccept-360.png) | [768](reaccept-768.png) | [1024](reaccept-1024.png) | [1440](reaccept-1440.png) |
| Supplier conversation | [360](messages-360.png) | [768](messages-768.png) | [1024](messages-1024.png) | [1440](messages-1440.png) |

List/detail loading, empty and error states were captured at all four widths. Additional screenshots cover no suppliers/quotes and conversation loading, empty history, no eligible quote, missing thread ID and failed history. Modal screenshots show the viewport; other screenshots show full pages. All captured Customer screens/states pass document overflow and axe WCAG A/AA assertions without exceptions. Mobile, tablet, laptop and desktop screenshots were visually inspected against the canonical HTML and existing Workspace components.

The static dashboard has no data fetch, so no fabricated loading/empty metrics were introduced. Its role/auth loading remains with the unchanged shared guard.

## Actions, states and contracts

- Dashboard and header actions retain `/customer/enquiries` and public `/request`. List View links retain their original detail URLs. No extra Customer API request is made by the dashboard, or when searching loaded enquiries by venue/date/status. The table identifies its existing latest-200 scope in its accessible caption.
- Quote Accept/Decline retain the exact public endpoints and `{ token }` JSON payload without adding bearer authentication. All decision buttons disable while one request is pending, and terminal/missing-token quotes remain disabled. The existing detail refresh supplies the updated status. Re-acceptance copy/flag and acceptance transition are verified.
- Mutation and post-mutation refresh failures keep loaded enquiry content available with error feedback. Retry uses the original detail/target requests. Missing/mismatched IDs expose no quotes or mutation actions. Supplier-target loading disables messaging; a target error leaves loaded quotes visible.
- Message opening retains `{ enquiry_id, supplier_id, quote_id }`, followed by the original `?limit=50` history request. Send retains only `{ body }`, trimming input and appending the returned message locally without refetch. Blank/whitespace/single-character sends disable; server rejection of 2001 characters still displays an error and preserves the text. No Supplier maxLength or clientMessageId semantics were imposed on Customer messaging.
- Messages cover failed send retaining text, busy textarea/Send disabling, empty history, initial loading, no eligible quote, missing thread ID and history failure. A failed open without a thread leaves Send disabled. Failed histories are not presented as successful empty conversations. Close/reopen behaviour remains; a new auto-retry or draft store was not added.
- Keyboard checks cover enquiry-link activation, Radix conversation Tab containment/Escape/opener-focus restoration, mobile navigation and command search. Participant and message history use the existing shared ConversationThread; composer labels and disabled states use shared form controls.
- Signed-out, Admin, Supplier and Venue fixtures redirect away from all three Customer routes without Customer API calls. The `/customer/*` fallback is retained. Browser route requests confirm no Admin/Supplier/Venue/calendar modules load while navigating Customer screens.

[Runner results](results.json), [source comparison](source-comparison.json), [build/lint summary](checks.json).

## Preservation, performance and gaps

All **ten existing request, money/status, quote-action and messaging helpers** compare identically as parsed JavaScript with the starting snapshot. The old layout `go` helper was replaced by the same destination URLs in stable navigation links. Loading effect callbacks retain their contracts; an explicit Retry can now rerun them. No new production dependency or shared component implementation was introduced.

Removed pathname-derived navigation state/effect, memoized local list filtering and memoized message display rows so timestamps are not reformatted on composer keystrokes. Existing role/route lazy boundaries remain. Final initial entry is **450.90 kB / 131.66 kB gzip**; Customer enquiry detail is **10.46 kB / 3.41 kB gzip**. These artifact sizes are not measured real-user latency gains.

No separate Customer bookings, event management, profile/settings, notifications, inbox or quote-comparison route exists. Quotes and messaging are enquiry-local. There is no dashboard feed/metric endpoint or workspace supplier-photo data. Public `/request` creation and public quote pages remain outside this migration. No absent capability or data source was invented.

Existing limits remain: latest 200 enquiries, latest 50 messages without an older-history control, no realtime Customer conversation updates/read receipts, and draft reset when reopening a dialog. Detail and target endpoints duplicate supplier/quote work; detail embeds histories that the client later retrieves again when opening messaging. These contracts were preserved. The detail endpoint currently returns all quote statuses, including drafts; filtering and exposure policy require separate backend review.

## Reproduction and live limits

Use Node 22, installed dependencies and Playwright Chromium. Start the fixture-only server:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
```

Run:

```sh
npm run test:customer
npm run test:workspace
npm run test:admin
npm run test:supplier
npm run test:supplier-workflows
npm run test:venue
npm run build
npm run lint
```

Optional `WORKSPACE_TEST_URL` overrides the local URL; `CUSTOMER_SCREENSHOTS` overrides the default `/tmp/eventwow-customer-v2`. Never deploy the dummy fixture settings.

All six browser suites passed. Vite compilation passed in 6.53 seconds; the full build still fails at the pre-existing SEO prerender requirement for Supabase URL/service-role credentials. Lint is **429 errors / 12 warnings**, versus **430 / 12** at the start; removing Customer's redundant navigation effect removes one existing error. All migrated Customer files and the new runner are clean. No unrelated lint backlog was changed.

Live authentication/ownership enforcement, token validity and quote races, booking creation, notifications and message persistence require configured staging verification. The tests prove frontend requests/states, not live backend correctness. Supplier calendar week-view ARIA exceptions remain in that prior regression suite; Customer checks use no accessibility exceptions.

## Subsequent workflow investigation

See [Customer-to-Supplier verification](../customer-supplier-workflow/README.md) for connected real-handler/browser tests and two API fixes. Customer detail now excludes drafts, but live RLS still permits owned draft rows through direct Data API access; no policy change was made. Supplier history now returns the latest 500 messages. The send/link handoff, live integration and history/refresh limitations remain documented blockers or follow-up work there.
