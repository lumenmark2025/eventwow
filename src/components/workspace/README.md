# EventWow workspace foundation

The canonical visual source is `docs/reference/eventwow_admin_radix_reference.html`, reconciled with the shared geometry in `docs/DESIGN_SYSTEM_V2.md`. See `/design-system` for isolated synthetic examples.

- `WorkspaceShell`: fixed 240px navy sidebar, 64px topbar, responsive Radix navigation drawer, skip link and route Suspense. `nav` accepts `{ key, label, to?, icon?, group?, end? }`. Link navigation or the existing `activeKey` / `onNavigate(key)` callback API both work. The longest matching route owns the active state. `presentation` opts content into Workspace v2 primitive styles. Admin and the migrated Supplier routes enable it; other page bodies retain their existing presentation.
- `WorkspaceSidebar`, `WorkspaceTopbar`, `SearchCommand`, `UserMenu`, `NotificationMenu`: exported building blocks. Search searches available workspace pages, without additional backend requests. Notifications render only when a real callback exists. Account actions use the supplied sign-out callback.
- `WorkspacePageHeader`: the existing shared `PageHeader` API (`title`, `subtitle`, action objects), styled within the workspace. No competing page header implementation.
- `MetricCard`: `label`, `value`, `hint`, `icon`, `tone`, `loading`. Missing values render an em dash; no synthetic trends or sparkline data.
- `DataTable`: `columns` (`key`, `label`, optional `render(row)`), `rows`, `rowKey`, `caption`, `loading`, `error`, `onRetry`, empty-state copy and an optional table `className`. Pass the established `ew-admin-table` class for wrapping form/list cells; it contains no role logic. On mobile, cells stack as labelled rows; actual record buttons remain keyboard accessible. No implicit row-click handler or fabricated pagination totals.
- `FilterBar`: controlled search and optional status options, result count and action children. Filters apply only to loaded records. Queries and server limits belong to each existing data layer.
- `StatusBadge`, `DashboardCard`, `ActivityList`, `QuickActions`, `ApprovalAlert`, `EmptyState`, `ErrorState`: presentation only. Approval counts must be explicitly supplied; the production dashboard omits them because its existing endpoints do not provide them.
- `WorkspaceDialog`: the existing Modal props (`open`, `onClose`, `title`, `children`, `footer`) backed by Radix. Includes focus containment, Escape/outside dismissal, scroll handling and focus return to the opener. Controlled callers can continue refusing close while busy.

`AppShell` is a compatibility adapter for customer, supplier and venue layouts. `navTheme` and `showBrandMeta` are superseded by the canonical shell, while navigation, credits, notifications and sign-out behaviour are preserved. Do not introduce another role-specific geometry.

`workspace.css` scopes tokens under `.workspace-v2`. `.workspace-ui` adapts existing Button, Card, Badge and PageHeader components through `data-ui` markers, so unrelated public/legacy consumers retain their presentation. New workspace component styles are colocated here. Portalled menus/dialogs carry their own scope.

The reference orange remains the brand/decorative token. The orange action token is slightly deeper to give white labels AA contrast. Radius and spacing follow the documented scale; reference-derived 10–13px meta/navigation typography, modal viewport calculations, overlay shadows and structural sidebar/topbar dimensions are intentional centralized exceptions rather than per-page values.

Self-hosted Inter Latin fonts and Radix/Lucide load with the workspace chunk, not the public entry. Icons are decorative when accompanying accessible text labels.

## Admin forms and supporting screens

`AdminPrimitives.jsx` adapts the existing compound component APIs to the same tokens and table geometry. It contains no fetching, sorting, validation rules or mutations.

- `FormSection`, `FormSectionHeader`, `FormSectionTitle`, `FormSectionDescription`, `FormSectionBody`: logical form groups. The `Card*` aliases let large existing editors retain their structure without importing legacy presentation.
- `FormField`: visible label, generated/explicit control ID, optional help and validation error linked by `aria-describedby`, and `aria-invalid`. `Input`, `Textarea` and `Select` share focus, error and disabled styles. Native selects deliberately preserve existing DOM change events and empty option values; dialogs and workspace menus use Radix.
- `FormActions`: a consistent Cancel / Save footer. Existing action callbacks and busy flags remain with each screen. Long editors retain their top actions as well.
- `Feedback`: semantic error/warning/success feedback, with an optional existing retry callback. Do not show empty results or zero counts while a request is failing. Initial-load readiness should gate an editor so missing records do not display defaults or Save controls; a save failure should keep the loaded form available for correction.
- `Table`, `THead`, `TBody`, `TR`, `TH`, `TD`: compatibility composition using the approved DataTable CSS. Header labels are reused on mobile; actionable ledger rows support Enter/Space. Table controls retain their original callbacks.
- File controls remain native, keyboard reachable and visibly labelled. Shared upload, subsection, checkbox and result-count classes are opt-in; other workspace page bodies are unaffected.

The form specimen is available on `/design-system`. Supporting-route and form verification runs with `npm run test:admin`, using the same isolated setup as `npm run test:workspace`.

## Supplier workspace

Supplier uses the same shell and form adapters across all seven workspace routes: dashboard, enquiries, quotes, bookings, messages, notifications and listing. Credits and performance remain sections of the existing overview rather than invented routes. Signup, onboarding and verification remain outside this workspace migration.

`npm run test:supplier` checks all four migrated routes and their states at 360/768/1024/1440px, request/notification/listing/media action payloads, credit checkout failure states, keyboard interactions and role redirects with isolated fixtures. Use the same fixture dev-server setup as the Admin suites.


`ConversationThread` and `MessageComposer` are presentation-only components demonstrated on `/design-system`. The thread accepts title, subtitle and message rows, with a labelled, focusable live log and plain text content. The composer accepts the existing controlled value, limit, disabled/busy state and send callback. Neither component fetches, marks read, validates business rules or sends messages.

Supplier Quotes uses the shared FilterBar/DataTable through `QuoteList`; search and status filtering operate only on already-loaded rows. Quote and booking selection focus their labelled detail regions. The existing handlers own all mutations and validation.

`BookingsCalendar` retains react-big-calendar's views, dates, selection and range callbacks. Its shared Button toolbar is portalled above the horizontal scroll region so navigation remains visible on narrow screens. The centralized 640px minimum grid width and 680px calendar height preserve usable event/time cells; these are deliberate structural exceptions. The region is keyboard focusable, explains horizontal scrolling and offers the existing list alternative. The calendar and its stylesheet are lazy-loaded when requested, including the optional design-system specimen. Known pre-existing week-view ARIA structure issues are documented in the verification evidence.

`npm run test:supplier-workflows` checks Quotes, Bookings/calendar and Messages with isolated fixtures, including all four viewport widths, states, keyboard controls, guards and mutation payloads. See `docs/verification/supplier-workflows-v2/README.md`.


## Venue-owner workspace

`/venue` and `/venue/:venueId/edit` use the same WorkspaceShell and form adapters. Navigation contains only the existing My venues destination; no unsupported enquiry, booking, message or notification routes are invented. Overview search filters loaded venue names/locations without additional requests. The editor preserves its existing load/save/upload handlers and review statuses.

`WorkspaceImage` is a shared, presentation-only listing image frame demonstrated on `/design-system`. It reserves a 16:9 aspect ratio, keeps lazy loading/async decoding, and renders labelled missing/failed-image states with a Lucide icon. A changed source resets the failure state. It does not upload, sign or fetch listing records.

Venue forms use labelled descriptions, capacity, facilities and file controls, with shared feedback and Submit/Cancel actions. File controls are disabled during saves/uploads; all backend contracts remain with the existing handlers. The empty overview's Browse venues link is rendered explicitly, since EmptyState accepts actionLabel/onAction rather than an action element.

Run `npm run test:venue` using the fixture setup documented in `docs/verification/venue-v2/README.md`.


## Customer workspace

`/customer`, `/customer/enquiries` and `/customer/enquiries/:id` share WorkspaceShell and its route-driven navigation. The dashboard is a navigation overview without a data endpoint; no metrics/feed are fabricated. Enquiry creation remains on the existing public `/request` route.

Customer lists and enquiry-local quote/item presentation reuse DataTable, Section, PageHeader, form feedback and status adapters. Supplier messaging remains an enquiry-local Radix dialog using ConversationThread and a labelled Textarea. The existing Customer API owns its different send validation and payload, so the dialog retains its caller-controlled Send/Close footer rather than adopting Supplier composer limits. Conversation display rows are memoized to avoid reformatting dates while typing.

Loaded enquiry data remains available after action/target-fetch errors, while missing or mismatched enquiry IDs hide all detail actions. Send is disabled until a thread exists. No shared component contract or other role presentation was changed.

Run `npm run test:customer` with the fixture setup in `docs/verification/customer-v2/README.md`.
