# EventWow UI v2 Migration Plan

## Goal

Move the existing EventWow public marketplace and customer, supplier, venue and admin workspaces onto one coherent premium design system without destabilising working product logic.

This is not a backend rewrite and not a framework migration.

Current stack remains React + Vite + Tailwind + Supabase during this phase.

---

# Phase 0 — establish the visual contract

Before migrating production screens:

1. implement v2 colour, typography, spacing, radius and shadow tokens
2. create `/design-system`
3. rebuild/extend UI primitives
4. build shared `PageHeader`
5. build new unified `AppShell`
6. build `MarketingHeader` and `MarketingFooter`
7. build first marketplace cards and data-table patterns
8. verify at 360, 768, 1024 and 1440px

No wide page migration should start until the reference route is visually approved.

Suggested first implementation PR scope:

- tokens only
- typography only
- Button
- Input/Select/Textarea
- Badge/StatusBadge
- Card/Panel
- PageHeader
- DataTable styling
- AppShell prototype
- SupplierCard
- CategoryCard
- `/design-system`

---

# Phase 1 — public homepage

Rebuild the homepage as the public benchmark for EventWow v2.

Recommended section order:

1. MarketingHeader
2. bright hero
3. value proposition: exceptional suppliers for any event
4. EventSearchPanel
5. genuine trust signals
6. event-type/category discovery
7. popular supplier categories
8. featured suppliers
9. venues
10. How EventWow works
11. reviews/social proof
12. supplier recruitment CTA
13. MarketingFooter

Key visual goals:

- predominantly light page
- broad events imagery rather than wedding-dominated imagery
- strong EventWow orange CTA
- dark navy headings
- colourful photography
- restrained pastel accent surfaces
- minimal card chrome

Data rule: public modules must filter out test/demo records.

---

# Phase 2 — marketplace search and public profiles

Migrate commercially important discovery surfaces:

- service/category pages
- supplier search/results
- venue search/results
- supplier public profiles
- venue public profiles

Build/reuse:

- MarketplaceResultsPage pattern
- filters
- SupplierCard
- VenueCard
- gallery
- review section
- pricing/service cues
- quote CTA
- service area/location presentation

Public profiles should feel like real portfolios, not database record pages.

---

# Phase 3 — unified workspace shell

Replace the existing shared `AppShell` presentation while keeping role navigation configuration and working behaviour.

Target desktop structure:

- 64px topbar
- 240px sidebar
- consistent PageHeader baseline
- responsive drawer on smaller screens
- role-driven nav
- notification/account area

Customer, supplier and venue already share `AppShell`; use this as the principal migration leverage point.

Admin should then be moved from its bespoke shell onto the same workspace geometry.

---

# Phase 4 — supplier workspace

Supplier is the most complete workspace and should prove the new application patterns first.

Migration order:

1. Dashboard
2. Requests / enquiries
3. Quote creation and quote list
4. Messages
5. Bookings
6. Listing/profile editing
7. Notifications
8. Settings/credits if applicable

Design direction:

- operational information first
- useful metrics only
- list/table-based enquiries and bookings
- clear quote status
- strong unread/message states
- long forms split into consistent FormSections
- sticky save actions for profile/listing editing where useful

No decorative hero treatment in the workspace.

---

# Phase 5 — customer workspace

Migrate customer dashboard and enquiry management onto the same shell/components.

Priorities:

- current event/enquiry status
- supplier responses
- comparison of quotes
- messages
- clear next action

The customer workspace can be visually warmer than supplier/admin but must retain identical structural alignment.

---

# Phase 6 — venue workspace

Move venue management onto the same shell.

Priorities:

- venue listing completeness
- edit profile/details
- imagery
- leads/enquiries if/when supported
- status and visibility

Do not create a separate venue design language.

---

# Phase 7 — admin workspace

Replace the current bespoke admin visual shell last, after application components have been proven by supplier/customer/venue.

Admin priorities:

- high information density
- fast scanning
- strong filters/search
- consistent tables
- moderation/status actions
- minimal decorative content

Admin should look like EventWow, not a separate blue SaaS product.

---

# Component migration strategy

Prefer adapter/refactor migration rather than deleting working code.

Example:

1. improve shared `Button` API while retaining compatible variants where practical
2. migrate callers gradually
3. deprecate old variants only after usage is removed

Do the same for:

- Card
- Badge
- Input
- Table
- EmptyState
- Modal
- AppShell

Use code search before removing old props/variants.

---

# Visual QA gate

Each migration PR should be checked at:

- 360px mobile
- 768px tablet
- 1024px laptop
- 1440px desktop

Check:

- common left alignment
- page title baseline
- sidebar/topbar geometry
- control height consistency
- responsive navigation
- table/list behaviour
- long text wrapping
- loading/empty/error states
- no clipped dropdowns/modals
- photography aspect ratios
- focus/keyboard behaviour

A migrated feature should not be merged solely because it compiles.

---

# Non-goals during the v2 visual migration

Do not combine this work with:

- Next.js migration
- Supabase schema redesign
- major auth changes
- pricing model changes
- marketplace logic redesign
- broad feature expansion

Those can follow once the product has a stable visual foundation.

---

# Success criteria

The migration is successful when:

- EventWow looks recognisably like one product everywhere
- public pages feel current, energetic and credible
- weddings are important but no longer visually dominate the brand
- customer/supplier/venue/admin pages align consistently
- one shared shell drives all workspaces
- common controls come from shared components
- Codex can add a page without inventing a new design language
- there is an approved `/design-system` route that acts as the visual source of truth
- changes to the visual system propagate through the product rather than requiring page-by-page repair
