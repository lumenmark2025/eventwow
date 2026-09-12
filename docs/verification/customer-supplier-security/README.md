# Customer/Supplier security and reliability — 12 September 2026

Branch `ui-v2-design-system`, starting commit `83a1ff6`. This follows the [connected workflow investigation](../customer-supplier-workflow/README.md). No redesign, routes, payload shapes, database columns, pricing rules or quote/booking decision transitions changed.

**Migration prepared and verified locally; not applied to the live project.** Live inspection was read-only metadata. Tests use synthetic records in a disposable PostgreSQL/PostgREST database or an isolated API transport, never production records. Production confidentiality remains unresolved until the migration is deployed. These results are not live Auth, email or transaction-recovery sign-off.

## Audit and focused policy change

[Migration: 20260912143031_customer_quote_visibility.sql](../../../supabase/migrations/20260912143031_customer_quote_visibility.sql)

The connected project's `quotes_select_customer_owned` policy permits Customer-owned enquiries through either `enquiries.customer_user_id` or `customers.user_id`, without restricting quote status. RLS is enabled, but that permissive SELECT policy exposes owned draft rows directly through PostgREST, independently of the filtered Customer API.

The audit also found **RLS disabled on `quote_public_links`**, with anonymous/authenticated table grants. These UUID tokens authorize quote decisions, so hiding draft rows alone would leave a separate capability-enumeration hole. The migration enables RLS on that table with an Admin-only authenticated policy. Customer/Supplier access to decision links continues through the existing authorized service-role endpoints; there are no direct frontend queries to this table.

| Relation | Audited access and final behavior |
| --- | --- |
| `quotes` | Amend only `quotes_select_customer_owned`: existing enquiry ownership **and** status in `sent`, `accepted`, `declined`, `closed`. Drafts and future unknown statuses fail closed. Existing Supplier SELECT/UPDATE-own and Admin ALL policies stay intact. |
| `quote_items` | Existing Supplier-own and Admin policies retained. Customer direct item access was already denied; the Customer API returns items only after its visible-owned-quote check. |
| `quote_events` | RLS enabled, no direct-client policy. Existing service-role DTO reads remain unchanged. |
| `quote_public_links` | Enable RLS, add `quote_public_links_admin_all` with `is_admin()` for USING/WITH CHECK. Anonymous, Customer and Supplier direct enumeration/mutation denied; Admin and service-role access preserved. No token deletion, rotation or revocation migration. |
| `message_threads` | Retain enquiry ownership; if linked to a quote, require that quote to match the same enquiry and be in the visible status set. Preserve legacy enquiry-only threads when quote_id is null. |
| `messages` | Existing Customer SELECT policy checks `message_threads` under RLS and inherits its restrictions. No new policy or bypass function needed. Supplier/Admin message APIs already use service_role; no new direct message permissions granted. |
| `enquiries`, `enquiry_suppliers`, `customers` | Existing ownership/role policies unchanged. Both Customer identity paths are exercised. |

Existing `is_admin()` and `supplier_id_for_user()` helpers are unchanged. The relevant public views inspected contain supplier/marketplace aggregates for published statuses, not draft text, items or message bodies. This is a focused quote/conversation audit, not a platform-wide authorization audit or column-privacy redesign for legacy fields on published rows.

Because service_role bypasses RLS, the Customer thread GET/POST endpoint now also checks its linked quote's status and enquiry consistency before any message read or insert. A known draft thread ID or mismatched enquiry no longer bypasses the Customer detail filter. Existing ownership checks, enquiry fallback, message validation, cursor, limits and mutation payloads are retained.

The migration is transactional and changes policies only. It requires the existing named policies and lookup helpers, so a mismatched deployment fails rather than silently installing parallel permissive policies.

## Decision-token findings and fix

This was a sequencing defect, not merely a stale response: send previously published the quote and spent a credit before any decision token existed. The customer-email helper only read an existing token. Reopening/copying the Supplier quote created the missing row later.

`ensureQuotePublicLink` now prepares the token after send authorization, draft/item and balance checks, **before publication or the credit RPC**. The send response contract stays unchanged: the next Customer detail read has its existing `quoteToken` field populated. A lookup/insert failure leaves the draft and balance untouched. Concurrent creators reuse the winning unique `quote_id` row. Existing tokens are not rotated, and deliberately revoked links return 409 instead of silently becoming usable again.

The existing Supplier get-public-link endpoint shares that helper and still provides recovery for historical sent quotes with no link. There is no backfill or mutating Customer GET. If the subsequent credit debit fails, the existing rollback returns the quote to draft; public quote/thread readers reject that status even though a token was prepared. The regression tests exercise that boundary. The pre-existing multi-step send/decision transactions are not made atomic by this change.

## Other reliability fixes and reviewed limits

- The notification inbox publishes its authoritative unread count to the Supplier shell through a small shared context. The notifications route no longer makes a second topbar count request. Obsolete shell route requests cannot overwrite the inbox result. Mark-all-read now clears both displays without navigation or reload.
- Supplier thread-list loading no longer triggers a second selected-thread fetch. Explicit Refresh still reloads the list and selected conversation. In the same development fixture, initial thread reads decreased from **8 to 4**, with the remaining calls attributable to existing StrictMode/auth initialization.
- Sequence checks ignore older selected-thread responses. A delayed response from thread B cannot replace thread A after switching back. Selection reloads the conversation, rather than relying on an old cached thread object.
- Own-message sends retain the existing local append and unchanged trimmed body/thread/client-ID payload. The 505-message regression still verifies newest windows in chronological display order and the Customer cursor's preceding page.
- Existing quote decision reloads, booking mutation updates, and explicit message Refresh/reopen paths are exercised. Incoming messages/decisions in another already-open tab are still not pushed live. No polling, subscription, new cache or speculative synchronization layer was added.

## Verification and evidence

- `npm run test:quote-rls`: real PostgreSQL 17 RLS, PostgREST 12.2.12 with signed role/sub JWTs, and the installed Supabase JS client's direct SELECT/UPDATE/INSERT calls. Reproduces both original exposures before applying the actual migration, then tests two Customers/both ownership paths, Supplier-own versus unrelated drafts/items, Admin/service-role access, anonymous denial, token write denial, legacy enquiry-only and draft/mismatched conversations, and sent/accepted/re-accepted/declined/closed/draft visibility transitions. Containers and their network are removed afterward. Supabase Auth issuance itself is not simulated by this database test; the fixture signs the JWTs.
- Five actual-handler regressions cover draft API/thread denial, message history, connected enquiry → draft → send → accept/decline/re-accept → booking state → two-way messages, token lookup/insert and credit faults, concurrent historical recovery and revoked-link behavior. Email is disabled and the credit RPC boundary is simulated.
- Connected browser test uses real React pages and handlers over shared synthetic state: Customer can accept immediately after send without Supplier reopening; persisted replies reach both roles; delayed thread responses are ignored; inbox/topbar counts agree without reload; simulated session refresh/logout and guards pass.
- All six existing browser suites pass: Workspace, Admin, Supplier, Supplier workflows, Venue and Customer. Coverage includes 360/768/1024/1440px, loading/empty/error/disabled states, keyboard controls, payloads and role guards. The pre-existing calendar week-view ARIA exceptions remain documented in the Supplier suite.
- Vite compilation passes. Full `npm run build` still fails only at SEO prerender because local Supabase URL/service-role credentials are absent. Lint remains **429 errors / 12 warnings**, with no new diagnostics; unrelated debt was left alone.

[RLS results](rls-results.json) · [Handler output](handler-results.txt) · [Connected browser results](browser-results.json) · [Verification checks](checks.json) · [Notification count after read](notification-count-after-read.png)

Use Node 22 and Docker for `test:quote-rls`; it needs access to the PostgreSQL/PostgREST images and binds PostgREST only to a random localhost port. It never uses a linked project or environment database URL. The baseline is a minimal snapshot of the audited policies/relations plus the repository's original Customer policy migration, not a complete production schema clone.

For browser runs, install Playwright Chromium and start Vite with the existing dummy fixture settings:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
npm run test:customer-supplier
npm run test:supplier-workflows
```

The remaining suite commands are `test:workspace`, `test:admin`, `test:supplier`, `test:venue`, `test:customer`. Never deploy dummy settings or put service-role credentials in Vite client variables.

## Required staging steps before production

1. Review/apply **this migration only** through the existing Supabase migration process in the designated staging project. Inspect pending migration history first: this repository does not contain a full clean bootstrap, and blindly applying all historical files is not a tested deployment path. Confirm both amended policies and enabled token-table RLS using `pg_policies`/`pg_class`. Deploy the API/frontend changes as the same release. Applying the policy first is compatible with the existing service-role handlers.
2. Repeat direct `supabase.from('quotes').select('*').eq('id', draftId)` with real Customer, owning Supplier, unrelated Supplier and Admin sessions. Customer/unrelated Supplier receive no row; owner/Admin retain it. Check Customers see only their published states, draft-linked message access is denied, token enumeration is denied to anon/Customer/Supplier, and authorized service endpoints still return valid links.
3. With designated test accounts, submit/send/accept/decline/revise/re-accept, verify the real credit ledger, booking values/statuses, message persistence and notifications/email. Verify live login/refresh/revocation and logout. No live writes or role accounts were exercised here.
4. Recover any historical sent quote missing a link using the existing authorized Supplier endpoint. Review deliberately revoked links separately. Review access logs for the previously public token table and determine whether existing capabilities require incident handling/rotation; RLS prevents future enumeration but does not invalidate previously learned URLs. No evidence of actual token access or abuse was collected in this metadata-only audit.
5. Retain policy hardening if rolling back application code. Disabling token RLS or restoring the old Customer policy would reopen exposure. No destructive down migration is supplied.

Remaining separately scoped risks: send/credit/decision/event/booking/notification writes are not one transaction; acceptance replay around cancelled bookings and notification dedupe/re-acceptance needs recovery/concurrency design. History UI still has fixed latest-50/latest-500 windows, timestamp ties can affect the Customer cursor, and Supplier previews have a global 500-message cap. Live updates across open tabs remain manual. These existing limitations are not resolved by the presentation migration or this focused security patch.

Reference: [Supabase RLS and service-role behavior](https://supabase.com/docs/guides/database/postgres/row-level-security). Exact live policy conclusions came from read-only connected-project metadata; enforcement evidence comes from the isolated database test.
