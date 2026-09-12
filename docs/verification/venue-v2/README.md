# Venue-owner Workspace v2 verification — 12 September 2026

Migrated the two existing owner routes on `ui-v2-design-system`, starting from `46d0e5a`. No backend, Supabase schema, auth/guard, public marketplace or claim-page source changed. All browser data and imagery are synthetic local fixtures; every API/Supabase request is intercepted and no live writes occur.

## Coverage

| Route / screen | Mobile | Tablet | Laptop | Desktop |
| --- | --- | --- | --- | --- |
| `/venue` overview | [360](overview-360.png) | [768](overview-768.png) | [1024](overview-1024.png) | [1440](overview-1440.png) |
| `/venue/:venueId/edit` | [360](editor-360.png) | [768](editor-768.png) | [1024](editor-1024.png) | [1440](editor-1440.png) |
| Pending review | [360](pending-review-360.png) | [768](pending-review-768.png) | [1024](pending-review-1024.png) | [1440](pending-review-1440.png) |
| Empty profile/gallery | [360](empty-profile-360.png) | [768](empty-profile-768.png) | [1024](empty-profile-1024.png) | [1440](empty-profile-1440.png) |

Both routes also have loading, empty and error screenshots at every width (`overview-<state>-<width>.png` and `editor-<state>-<width>.png`). Empty editor data displays the existing not-found/not-owned message and no editable form. All captured states pass document overflow assertions and axe WCAG A/AA checks. Visual inspection covered mobile, tablet, laptop and desktop against the canonical HTML, shared design-system page and existing Admin/Supplier patterns.

## Behaviour verified

- Overview: original owned-venue GET with bearer token, real published/pending-review/draft values, local name/location search without new requests, empty filtered results, keyboard edit link and original encoded route. The empty overview now renders its intended Browse venues link explicitly; the old EmptyState API ignored the supplied action element.
- Editor: all existing descriptions/capacity/facility fields, exact POST payload including empty-to-null/numeric conversion and comma splitting, post-save reload, pending-review status, failed-save draft retention, Submit/Cancel hierarchy and original return route. Existing server validation messages are displayed without adding client business rules.
- Media: keyboard-reachable labelled file inputs; existing JPEG/PNG/WebP chooser and 5MB check; exact GET preparation query, raw signed PUT bytes and MIME header; preparation failure, missing signed URL and failed PUT feedback; save/upload busy controls; original reload after upload. Signed/public image URL fallbacks, missing hero/gallery and failed-image states are covered. No new media endpoint, reorder/delete action or data semantics were introduced.
- States: loading/empty/error at 360/768/1024/1440px, error retry, empty editor fields/gallery and unowned ID with other owned venues present. Errors do not appear as successful empty results. `/venue/*` retains its existing redirect.
- Keyboard: edit link activation, file focus, shared mobile Radix navigation Tab containment/Escape/focus restoration and command search.
- Guards: signed-out, Admin, Supplier and Customer fixtures redirect away from both owner routes without owner API requests. The existing frontend `venue` alias is retained; live server access for that alias is not asserted.
- Lazy loading: Venue navigation does not request Admin, Supplier or calendar page modules. Image frames reserve their aspect ratio and retain lazy loading.

[Fixture results](results.json), [source comparison](source-comparison.json), [build/lint checks](checks.json).

## Preserved contracts and known gaps

All six existing named API/status/load/save/upload helpers compare identically as parsed JavaScript with the starting snapshot. The overview load callback retains its request and cancellation behaviour; its effect can now rerun for an explicit Retry. Routing, auth and all API source are unchanged.

There are no owner enquiries, bookings, messages or notifications screens, no owner claim inbox, and no owner creation/publication controls. The current editor does not expose name/location editing or gallery delete/reorder/caption actions. Alternate owner endpoints have different contracts and were not connected during this migration.

Public claim request `/venues/:slug/claim`, token verification `/claim/venue` and Admin claim review retain their existing presentation and behaviour. They are not owner-workspace routes. The [Venue audit](../../WORKSPACE_V2_AUDIT.md) records their contracts and gaps.

Existing backend risks remain: upload preparation registers metadata and removes previous hero metadata before the file PUT succeeds; uploads do not set the review flag despite existing success copy; private/public bucket assumptions differ between active and alternate endpoints. Venue updates write current fields while marking review, rather than storing a separate draft. Upload/save reloads replace the form from server data. A help message explains the existing unsaved-copy consequence of uploads. These behaviours need a separately scoped backend/integration review.

## Commands and limits

Use Node 22, installed dependencies and Playwright Chromium. Start an isolated dev server:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=workspace-visual-fixture npm run dev -- --host 127.0.0.1
```

Run:

```sh
npm run test:venue
npm run test:workspace
npm run test:admin
npm run test:supplier
npm run test:supplier-workflows
npm run build
npm run lint
```

`WORKSPACE_TEST_URL` overrides the local URL; `VENUE_SCREENSHOTS` overrides the default `/tmp/eventwow-venue-v2` output. Do not deploy dummy fixture settings.

The Venue, Workspace, Admin and both Supplier browser suites passed. Final Vite compilation passes; full build still fails in the pre-existing SEO prerender stage without Supabase URL/service-role credentials. Lint is **430 errors / 12 warnings**, compared with **431 / 12** at the start: removal of the constant Venue tab state/effect removes one existing diagnostic. Changed Venue files, the new image component and runner have no diagnostics. No unrelated lint backlog was repaired.

Live authentication, ownership enforcement, signed storage uploads, claim emails/approval provisioning and publication isolation require configured staging verification. Fixtures establish frontend contracts and states, not live persistence or backend correctness. The Supplier calendar's previously documented week-view ARIA exceptions remain confined to that regression suite; Venue axe checks have no exceptions.
