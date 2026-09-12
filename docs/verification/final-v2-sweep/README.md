# Final EventWow v2 presentation sweep

Baseline `fea139f4c131f21b8322ac90cc6867f949deeee2`, branch `ui-v2-design-system`.

## Audit and delivery

- `/how-it-works`: existing H1, customer/Supplier steps, three FAQ answers and `/categories` CTA. Replaced blue gradients/decorative cards with PublicPageHeader, plain sections, keyboard-operable FAQ and existing PublicCallout.
- `/pricing`: existing three tiers, all bullets and FAQ copy. The roadmap tier remains explicitly “Coming soon”; no unsupported purchase action was added. Responsive plain comparison columns use the same public typography and spacing.
- `/contact`: existing email address and exact mailto subject remain. There is no contact form/API handler to migrate.
- Global lazy-route loading and import/render failure: focused public AuthShell and shared Button, retaining the existing reload action and error-boundary lifecycle. These add no auth/session work.
- Existing flat-slug/profile/category not-found and data-error states were already v2; checked without changing their behavior. The unmatched multi-segment fallback still redirects to `/`, and role wildcard redirects remain intact. No new 404 route or URL/status semantics were introduced.
- Static `appShell` now applies the shared public-token/Inter adapter to home, list and Supplier/Venue detail output. Removed its duplicate legacy CSS. All existing crawlable content, lists, CTA links and empty states remain visible without JavaScript. Existing head/schema, data selection, route generation and sitemap functions are unchanged.
- All active MarketingShell consumers now use one public width/padding pattern. Retired the legacy geometry branch and CSS. Shared `PublicInfoSection`/`PublicFAQ` are registered on `/design-system` and documented in the design system.
- One existing comparison-page “Messaging panel open” notice still used legacy brand utilities. It now uses the existing journey border/surface tokens; its condition, text and workflow are unchanged.

The audit found no additional active legacy public page body. Existing native confirmation dialogs and file/date controls retain browser presentation intentionally. Shared base UI primitives retain compatibility Tailwind defaults, overridden by the public/auth/workspace scopes; they have active callers and are not dead code. The Supplier calendar's previously documented week-view ARIA exceptions remain.

## Safe cleanup

Removed **eleven files** after parsing static and dynamic source imports from `src/main.jsx`, checking incoming references, and searching the rest of the repository/build configuration for alternate entry points. No import glob or secondary frontend entry references these files:

| Removed | Evidence/replacement |
| --- | --- |
| `src/pages/marketing/RequestStatusPage.jsx` | Unrouted; `/request/:token` uses EnquiryQuotesPage. |
| `src/pages/marketing/ListYourBusinessPage.jsx` | Unrouted; `/list-your-business` redirects to Supplier signup. |
| `src/pages/AuthResetPage.jsx` | Unrouted; current reset/callback pages and aliases remain. |
| `src/public/pages/PublicQuote.jsx` | Disconnected earlier implementation; `/quote/:token` uses `src/pages/PublicQuotePage.jsx`. |
| `src/components/layout/Section.jsx` | No consumer. Current sections use workspace/public patterns. |
| `src/components/ui/Card.jsx` | Remaining callers were only disconnected files removed here. |
| `src/components/ui/Divider.jsx`, `StatCard.jsx`, `Table.jsx`, `Modal.jsx` | No consumer. Active workspace equivalents/Radix dialogs remain. |
| `src/App.css` | Unimported Vite starter stylesheet. |

Retained and flagged: `src/supplier.rar` archive, legacy logo/starter assets, and compatibility root theme variables. No speculative asset/archive deletion. Server modules are not reachable from the browser entry because APIs import them separately; they were explicitly retained. Historical verification documents mention removed files as the state at those earlier commits.

## Verification

Run Node 22 with the isolated dummy Vite server described in [auth verification](../auth-v2/README.md). Then `npm run test:final-sweep`; this runs static contracts first and then the new browser runner. Never deploy fixture credentials/data.

- **40 responsive/axe checks at 360 / 768 / 1024 / 1440px**: all three marketing pages, global loading/error, flat-slug not-found, and populated/empty static home/detail templates. No horizontal overflow or WCAG A/AA violations. Screenshots were visually reviewed across all four widths.
- FAQ Enter toggling, link/button focus, exact email handoff, route-error keyboard reload recovery, and existing unknown-URL redirect verified. Marketing pages have no async forms, unavailable result states or disabled actions to invent.
- Static home/detail also checked in a separate JavaScript-disabled browser context; content and anchors remain usable. Axe runs against the same documents with JS enabled because the audit library needs JavaScript. Category static checks remain in the existing SEO suite.
- Parsed metadata/content constants unchanged for all three marketing pages. App route/guard/session source is identical as AST. API, Supabase, `src/lib`, dependency lockfile and Vercel rewrites unchanged. No schema or RLS change.
- Every prerender function except the explicitly styled shared `appShell` is identical as AST to the pre-SEO-migration baseline. Removing CSS/class markers yields identical static home/list/detail content and hrefs, including empty and escaped-character fixtures. Title, description, canonical, Open Graph/Twitter, JSON-LD and sitemap bytes remain identical.
- Existing public/profile/SEO/journey/auth, six workspace suites and connected Customer/Supplier regression results are recorded in `checks.json`. These cover role guards, loading/error/empty/disabled states, shell/mobile controls and existing payloads.
- Vite compiles. Full build reaches the unchanged prerender credential requirement and fails locally because Supabase URL/service-role credentials are unavailable. Lint has no new diagnostics; deletion removes one existing error, leaving **428 errors / 12 warnings**. Unrelated lint debt is untouched.

## Performance and release limits

Entry JavaScript is **436.52 kB / 128.11 kB gzip**, compared with **436.44 / 128.11** at baseline. No new dependency, request, image, cache, polling or auth lookup. Lazy boundaries remain; marketing browsing does not fetch role page/calendar modules. Dead-file removal reduces maintenance surface, not a claimed runtime speed gain because those files were already unreachable. Static CSS uses existing emitted Inter fonts with system fallback.

No migration-specific compile or browser blocker was found. Before Vercel Preview/staging sign-off:

1. Configure the existing build/runtime Supabase settings securely and run the complete prerender against designated staging data. Local fixtures do not prove live content eligibility, generated route coverage or Vercel delivery. Do not use service-role credentials in any `VITE_` variable.
2. Verify deployment rewrites/direct deep links and document status codes. Existing category/location two-segment rewrite and flat unknown-slug soft-404 gaps remain; Customer/auth direct-link coverage also needs Vercel QA. This pass preserves `vercel.json`.
3. Confirm deployment of the prior Customer quote/token RLS migration and run live role/session/quote/message/booking checks. See [security verification](../customer-supplier-security/README.md). This pass does not deploy a database migration.
4. Resolve/review the previously recorded auth return-destination/recovery and Supplier onboarding failed-save/review risks in their own security/workflow task. Live email, provisioning, uploads, credit/booking side effects and message history limits remain unverified or constrained as documented previously.
5. Review existing marketing copy/roadmap assertions with the product owner before production. Copy was preserved, not independently validated or expanded.

Recommended next step: configured Vercel Preview/staging release QA, followed by the separately scoped auth/workflow and SEO delivery fixes. No merge to main.

[Responsive results](results.json) · [Static contracts](static-contracts.json) · [Check summary](checks.json) · [Desktop how it works](how-it-works-1440.png) · [Mobile pricing](pricing-360.png) · [Static homepage](static-home-1440.png)
