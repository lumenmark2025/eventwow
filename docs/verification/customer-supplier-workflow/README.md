# Customer-to-Supplier workflow verification — 12 September 2026

Branch `ui-v2-design-system`, starting commit `74c8887af0e1682ac7d7b467fe2f5db908a2de03`. This pass verifies existing workflows and changes only two API reads. No screen, route, guard, schema, pricing, credit mutation, quote decision, booking mutation or message-send code changed.

**This is not a live end-to-end sign-off.** Local tests connect the real React pages, API handlers and installed Supabase JS client through an isolated, stateful Auth/PostgREST transport. The transport models the operations used by these handlers and the credit RPC boundary; it does not emulate PostgreSQL transactions, RLS, triggers, email delivery or real Auth. Browser contexts share the same synthetic stored records, rather than receiving independent canned success responses. No external network is allowed by that transport.

## Results by workflow

| Flow | Evidence and result |
| --- | --- |
| Customer submits enquiry | Actual `/request` form posts to actual public-enquiry handler, links the fixture customer, creates enquiry/invites and supplier notification. Customer list/detail and Supplier requests consume those stored records. |
| Supplier receives/opens enquiry and creates quote | Actual request list/detail and quote editor; handler validates invite ownership, creates a draft, reuses an existing draft, saves items and computes £1,000 from 80 × £12.50. |
| Draft visibility | Regression reproduces original leak, then verifies draft text/items/token/thread history are absent from Customer detail and are not fetched as quote relations. All four existing visible statuses remain. **Direct Data API exposure still needs an RLS change below.** |
| Send and credits | Actual send handler moves draft → sent, updates invite to quoted, invokes the existing credit RPC contract and notification code. Injected RPC failure rolls back to draft; replay does not spend a second credit. RPC arithmetic is simulated; its SQL concurrency behavior is not tested. |
| Customer compares/accepts/declines | Existing quote views/decisions remain covered by Customer browser suite. Connected browser verifies acceptance, including the existing missing-token workaround. Handler tests cover decline, replay, invalid tokens, rejected terminal transitions and supplier state on subsequent reads. |
| Booking and re-acceptance | Acceptance creates one confirmed booking/thread/access link. Accepted replay does not duplicate it. Supplier edits reset booking to draft and mark quote as awaiting acceptance; re-acceptance confirms the same booking with its revised £1,200 value. Supplier cancellation works through its existing PATCH. No real booking was changed. |
| Messages | Customer and Supplier send through actual handlers; the other role retrieves the stored trimmed body and sender. Browser closes/reopens Customer dialog and reads Supplier reply. Failed inserts do not append data. Supplier ownership and Customer enquiry ownership are checked. |
| History limits | 505-message fixture: Supplier gets messages 6–505 in chronological order, Customer gets 456–505, and the existing Customer cursor retrieves the preceding page. No older-history UI was added. |
| Notifications/counts | Actual backend notification creation and mark-all read are exercised. Inbox reaches zero unread; the existing topbar count remains stale until reload/navigation. Screenshots and browser result record this known defect rather than treating it as a pass for synchronization. |
| Sessions/guards | Real client stored-session reload, simulated Auth refresh, onAuthStateChange, local signout and subsequent protected-route redirect. Actual handler tests reject missing/expired fixture sessions, wrong roles and wrong owners. All six browser suites cover role guards. **Live token refresh, revocation, magic links and ownership enforcement are unverified.** |

## Small fixes delivered

1. `api/customer/enquiries/[id].js` filters quotes to `sent`, `accepted`, `declined`, `closed` before fetching their relations. This matches existing public comparison and Customer messaging rules. DTOs and ownership checks remain unchanged. This is an **API-layer mitigation**, not a complete resolution of draft confidentiality.
2. `api/supplier-thread.js` selects the newest 500 messages, then reverses the result for the existing chronological response. Previously it selected the oldest 500 and marked the thread read even when newer replies were absent. Limit, DTO, endpoint, ownership and read-state writes remain unchanged.

Both regressions fail against the previous API source and pass with these changes. No new production dependency, automatic request, cache, UI pattern or product feature was introduced.

## Live read-only investigation and production blockers

The connected Supabase project named `eventwow` is active, with no development branches. This workspace has no `.env` files or Supabase/Vercel credentials, and no designated staging URL or role test accounts were supplied. Only project metadata, aggregate counts, trigger/index metadata and RLS definitions were read. No rows, users, messages, quotes or policies were created/changed in the live project.

At inspection time the database contained one sent quote, no drafts linked to customer enquiries and no conversation over 50 messages. These aggregates do not prove safety for future drafts or longer threads. The credit RPC exists and bookings have a unique index on non-null quote_id. No quote-link creation trigger was found on quotes.

**Stop condition reached for draft RLS remediation:** the live `quotes_select_customer_owned` SELECT policy checks ownership through enquiries/customer identity but has no quote-status predicate. RLS is enabled and the authenticated role has SELECT permission on quotes. Consequently, fixing the service-role-backed Customer endpoint does not close direct authenticated Data API reads of owned draft quotes. This needs a reviewed RLS policy migration and real Customer/Supplier/Admin permission regression checks. As requested, remediation stopped at that boundary; no schema or policy change was attempted. Do not treat this branch as production-ready for confidential supplier drafts.

Other issues requiring follow-up:

- **Send/link handoff:** send succeeds and spends a credit without creating `quote_public_links`. Its customer-email function only reads an existing token. Until Supplier reopens the sent quote or uses Copy customer link, Customer sees a sent quote with disabled Accept/Decline. The connected test reproduces this gap and then follows the supported workaround. Link creation, revoked links, retry semantics and notification timing need one reviewed send-path fix; this pass does not add another partial send mutation.
- **Decision side effects:** acceptance/event/notification/booking writes are not one transaction. Booking/notification exceptions are logged while acceptance can return success. Replays and re-acceptance also need review around already-cancelled bookings and notification dedupe keys tied only to quote ID. Happy-path tests do not prove crash recovery or race safety.
- **History:** Customer has a latest-50 window with server cursor but no older-page control; Supplier now has a latest-500 window with no pagination. Timestamp-only Customer cursors may skip tied timestamps at a boundary. Supplier thread previews also use a global 500-message query across up to 100 threads. Pagination, stable cursors and retention presentation require a separate scope.
- **Refresh:** incoming messages and quote decisions are not pushed live into another open tab. Supplier thread initial loading calls both the selected-thread effect and the list loader, producing duplicate reads (amplified by development StrictMode and auth initialization). Notification inbox and topbar maintain separate counts; marking read refreshes only the inbox. These call paths predate Workspace v2 and were preserved during migration. Customer detail still embeds unused histories and separately loads messaging targets. No frontend fetching code changed in this pass.
- **Live integrations:** staging login/magic links/session expiry, RLS behavior under real JWTs, quote emails, credit ledger concurrency, booking recovery, notification delivery and durable message persistence remain unverified. Real test accounts and a designated staging application are needed. Do not run synthetic fixture writes against the public marketplace.

## Checks and evidence

- `test:customer`, `test:supplier`, `test:supplier-workflows`, `test:venue`, `test:workspace`, `test:admin`: all passed. Existing suites cover 360/768/1024/1440px, keyboard/accessibility, loading/empty/error/disabled states and frontend payloads/guards. The prior Supplier calendar week-view ARIA exceptions remain unchanged.
- `test:customer-supplier`: handler regressions/connected state tests plus connected browser run. This adds real handler coverage beyond the original route-response fixtures.
- Vite compilation passed in 4.51 seconds. Full `npm run build` still fails during SEO prerender without Supabase service-role credentials. Entry artifact unchanged at 450.90 kB / 131.66 kB gzip.
- Lint remains 429 errors / 12 warnings; no new diagnostics. Unrelated backlog was not changed.

[Connected browser results](browser-results.json) · [Handler test output](handler-results.txt) · [Checks](checks.json) · [Customer conversation](customer-conversation.png) · [Supplier conversation](supplier-conversation.png) · [Stale notification topbar](notification-count-after-read.png)

Use Node 22 and installed Playwright Chromium. Start the existing isolated fixture server:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
```

Then run `npm run test:customer-supplier` and the six existing browser scripts. `WORKSPACE_TEST_URL` controls the local browser origin; `WORKFLOW_SCREENSHOTS` controls the new runner's output (default `/tmp/eventwow-connected-workflow`). The handler transport always replaces credentials with dummy values and blocks external fetches. Never deploy fixture settings.

Recommended next step: separately authorize/review the Customer quote RLS correction and send/link recovery, then provide staging role accounts for a real cross-role flow with email, credits, bookings and messages. Resolve those blockers before production sign-off.

Supabase references consulted: [server-validated getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS ownership policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog](https://supabase.com/changelog). Live policy conclusions above come from the connected project's read-only metadata, not from assumptions about default RLS.
