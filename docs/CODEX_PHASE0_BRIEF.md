# Codex Brief — EventWow UI v2 Phase 0

## Objective

Implement the EventWow UI v2 foundation and reference design-system route without changing product business logic, routes, Supabase schema, authentication or permissions.

Read first:

- `AGENTS.md`
- `docs/DESIGN_SYSTEM_V2.md`
- `docs/UI_MIGRATION_V2.md`

This task is about establishing the reusable visual framework that later migration work will use. Do not start redesigning production marketplace or workspace pages beyond what is needed to integrate/test the new shared components.

---

# Required work

## 1. Design tokens

Refactor the global Tailwind/CSS foundation to expose the semantic EventWow v2 tokens from `DESIGN_SYSTEM_V2.md`.

Requirements:

- keep Tailwind working
- map brand/surface/text/border/status colours into usable utilities or CSS variables
- add typography foundation for Manrope marketing headings and Inter UI/body text using an appropriate web-safe loading approach for the current Vite app
- establish approved radius, shadow and content-width conventions
- remove dependence on the existing bright-blue brand default for newly built v2 components
- do not globally break legacy pages that have not yet migrated

## 2. Shared primitives

Refactor existing components where sensible instead of creating parallel duplicates.

Required v2-capable primitives for this phase:

- Button
- IconButton
- Input
- Textarea
- Select
- Checkbox
- Badge
- StatusBadge
- Card/Panel
- Tabs
- Pagination
- Skeleton
- EmptyState
- Modal/Dialog

Requirements:

- consistent focus states
- consistent disabled states
- consistent heights and radii
- accessible labels/keyboard behaviour
- no page-specific colours embedded in these primitives

Maintain backwards compatibility with current callers where reasonable. If a breaking component API is genuinely cleaner, update all affected callers in the same change and verify them.

## 3. PageHeader

Create a shared application `PageHeader` component supporting:

- optional breadcrumb/eyebrow
- title
- optional description
- primary action
- optional secondary actions
- optional tabs

This defines the alignment baseline for all future workspace pages.

## 4. Unified AppShell v2 prototype

Refactor the existing shared `AppShell` so it can represent the eventual customer/supplier/venue/admin shell without changing role logic yet.

Target geometry:

- 64px topbar
- 240px desktop sidebar
- light/white workspace
- dark navy/neutral text
- orange active/action accents
- notification/account area
- responsive mobile drawer
- consistent content padding

Important:

- do not turn all existing customer/supplier/venue pages into final v2 screens in this task
- the shell can be demonstrated fully on `/design-system` first
- preserve working existing shell behaviour until migration of each area is intentional

If safest, add a v2 shell component and retain a compatibility wrapper temporarily.

## 5. Marketplace components

Create reusable v2 components:

### CategoryCard

- event/supplier category image
- title
- optional supplier count
- optional small approved accent icon

### SupplierCard

- landscape image
- business name
- category
- location/service area
- optional genuine rating/review count
- optional genuine pricing cue
- optional favourite control
- optional verified/featured status

### VenueCard

- landscape image
- name
- location
- optional genuine price/capacity/review metadata where supplied

Do not manufacture fallback ratings/counts/claims when data is absent. Missing commercial metadata should simply not render.

## 6. DataTable visual foundation

Refactor or extend the existing Table components to define a consistent operational table style:

- header style
- row spacing/height
- hover
- alignment
- action column
- status handling
- empty state integration
- mobile strategy

Do not migrate every current table yet.

## 7. Marketing shell primitives

Create:

- `MarketingHeader`
- `MarketingFooter`
- `EventSearchPanel` visual component

These are reference-ready components; the production homepage migration is Phase 1.

MarketingHeader should include the structural pattern for:

- EventWow logo
- Suppliers
- Venues
- Ideas
- For Suppliers
- Sign in
- Get Quotes primary CTA

Responsive behaviour is required.

## 8. `/design-system` route

Create a development/reference route at `/design-system`.

It should be visually polished enough that it can be used for approval and future regression checking.

Display:

- logo/brand direction
- colour palette
- typography scale
- spacing/radius reference
- buttons in all variants/sizes/states
- form controls including error/disabled states
- badges/statuses
- tabs
- modal example
- pagination
- empty/loading states
- PageHeader
- operational DataTable sample
- CategoryCard sample
- SupplierCard sample
- VenueCard sample
- EventSearchPanel
- MarketingHeader/Footer
- AppShell v2 sample or representative workspace frame

Use clearly labelled synthetic design-system demo data only on this route. Do not mix demo data into production queries.

---

# Visual direction

The v2 reference should feel:

- brighter than the current EventWow presentation
- modern marketplace rather than wedding directory
- clean white/light background
- strong dark-navy typography
- EventWow orange primary CTA
- colourful event photography
- restrained mint/blue/violet/amber accents
- little or no gradient use
- modest radii
- very restrained shadows
- aligned and systematic

Public inspiration should conceptually sit between modern UK event marketplaces such as Hitched, Add to Event, Togather and Poptop, while remaining a distinct EventWow design.

Do not copy competitor branding/layouts literally.

---

# Explicit non-goals

Do not in this phase:

- rewrite the public homepage
- migrate every supplier/customer/venue/admin page
- migrate Vite to Next.js
- change the Supabase schema
- change authentication
- change marketplace matching/quote logic
- change pricing/credits logic
- add invented marketplace statistics
- introduce a large new component framework that competes with the existing app without a strong reason

---

# Verification

Before considering the task complete:

1. run the existing build
2. run lint and fix new issues caused by the work
3. verify `/design-system` at 360, 768, 1024 and 1440px widths
4. visually check focus/hover/disabled states
5. verify existing core routes still load
6. verify no auth/role behaviour has changed
7. verify no raw one-off colours/spacing have been introduced into the new v2 components contrary to the design-system rules
8. report any legacy component API that should be removed later rather than silently rewriting unrelated pages

## Deliverable summary

At completion, report:

- files added/changed
- component APIs introduced or changed
- any backwards-compatibility decisions
- screenshots/visual verification summary for `/design-system`
- any recommended follow-up before Phase 1 homepage migration
