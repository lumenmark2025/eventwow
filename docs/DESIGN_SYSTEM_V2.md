# EventWow UI v2 Design System

## Purpose

EventWow must feel like one coherent, premium, modern UK events marketplace across the public marketplace and the customer, supplier, venue and admin applications.

The design system exists to stop page-by-page styling drift. Pages are assembled from approved tokens, primitives, domain components, shells and page patterns. New one-off visual patterns are the exception, not the default.

## Product personality

EventWow should feel:

- modern, energetic and optimistic
- premium without feeling luxury-wedding-only
- useful and direct rather than decorative
- visually confident, with strong event photography
- friendly to consumers while credible to professional suppliers
- clean and information-dense inside logged-in workspaces

Avoid:

- generic blue SaaS gradients
- excessive cards, borders, pills and badges
- wedding-first visual language
- dark/heavy marketing pages
- ornate serif typography
- arbitrary Tailwind values
- decorative dashboard UI that reduces information clarity

## Two visual modes

### 1. Marketplace / marketing

Bright, visual and energetic. Strong photography, white space, dark navy typography and EventWow orange as the principal action colour. Weddings are important but sit alongside parties, corporate events, festivals, celebrations and community events.

### 2. Application / workspace

Clean, calm and precise. White and very light neutral surfaces, fixed structural alignment, compact information density, consistent tables/forms, restrained colour and almost no decorative effects.

Both modes share typography, tokens, controls, iconography and brand colour.

---

# Foundation tokens

## Colours

Use semantic tokens. Do not put raw hex colours into page components.

```css
:root {
  --ew-brand: #ff5a36;
  --ew-brand-hover: #ea4727;
  --ew-brand-soft: #fff1ed;

  --ew-ink: #102047;
  --ew-heading: #102047;
  --ew-text: #344054;
  --ew-muted: #667085;
  --ew-subtle-text: #98a2b3;

  --ew-bg: #ffffff;
  --ew-bg-soft: #f8fafc;
  --ew-bg-muted: #f2f4f7;
  --ew-surface: #ffffff;
  --ew-border: #e4e7ec;
  --ew-border-strong: #d0d5dd;

  --ew-blue: #3974ff;
  --ew-blue-soft: #eef4ff;
  --ew-mint: #14b8a6;
  --ew-mint-soft: #eafbf7;
  --ew-violet: #7c5cff;
  --ew-violet-soft: #f2efff;
  --ew-amber: #f59e0b;
  --ew-amber-soft: #fff7e6;

  --ew-success: #12b76a;
  --ew-success-soft: #ecfdf3;
  --ew-warning: #f79009;
  --ew-warning-soft: #fffaeb;
  --ew-danger: #f04438;
  --ew-danger-soft: #fef3f2;
}
```

The secondary colours are for functional categorisation, small icon circles and status emphasis. They are not alternate primary brands.

## Typography

Recommended:

- Marketing headings: `Manrope`, 700-800
- UI/body: `Inter`, 400-700
- Fallback: system sans-serif

Do not use serif display fonts in the core EventWow brand.

### Marketing scale

- Hero: 56/60 desktop, 40/44 tablet, 34/39 mobile, 800
- H1: 44/52, 750
- H2: 34/42, 750
- H3: 24/32, 700
- Lead: 18/28, 400-500
- Body: 16/24
- Small: 14/20

### Application scale

- Page title: 28/36, 700
- Section heading: 18/28, 650
- Card/table heading: 14/20, 650
- Body: 14/21
- Small/meta: 12/18

Use typography hierarchy before boxes, background colours or badges.

## Spacing

Approved spacing scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`

Do not introduce arbitrary spacing unless required by a real rendering constraint.

## Radius

- `6px` small controls/tags
- `10px` standard controls
- `14px` cards/panels
- `20px` prominent marketing containers
- `999px` true pills only

Do not make every element a pill.

## Shadows

Application:

- default: none
- raised panel: subtle 0 1px 2px rgba(16,24,40,.06)
- modal/dropdown only: stronger shadow permitted

Marketing:

- subtle shadows permitted for floating search panels and selected feature cards
- image cards should rely primarily on imagery and border/radius rather than heavy shadows

## Borders

Use `--ew-border` by default. Avoid stacking bordered Card components inside bordered Card components.

---

# Layout system

## Public marketplace

- maximum page width: 1360px
- standard desktop page gutter: 32px
- tablet: 24px
- mobile: 16px
- hero and major sections should align to the same grid
- use a 12-column grid where complex layouts need alignment

## Logged-in application

Desktop geometry must be consistent across customer, supplier, venue and admin:

- topbar: 64px
- sidebar: 240px
- content max width: 1440px where useful; data tables may fill available workspace
- content horizontal padding: 32px desktop, 24px tablet, 16px mobile
- page top padding: 28-32px
- page header margin-bottom: 24px

Every workspace page begins on the same x/y baseline.

---

# Core UI primitives

All common controls must be implemented once and reused.

Required primitives:

- Button
- IconButton
- Input
- Textarea
- Select
- SearchInput
- Checkbox
- Radio
- Switch
- DateInput
- Badge
- StatusBadge
- Avatar
- Tooltip
- DropdownMenu
- Modal / Dialog
- Drawer
- Tabs
- Breadcrumbs
- Pagination
- Table / DataTable
- Skeleton
- EmptyState
- Toast / Alert
- Divider

## Buttons

Variants:

- primary: EventWow orange, white text
- secondary: white surface, neutral border, ink text
- ghost: transparent
- danger: danger colour

Sizes:

- sm 36px
- md 40px
- lg 48px

A screen should usually have one visually dominant primary action.

## Status badges

Statuses are semantic, not decorative. Examples:

- New: amber soft
- In progress: blue soft
- Responded / booked / approved: success soft
- Closed / inactive: neutral
- Failed / rejected: danger soft

Do not create a different badge colour for every noun.

---

# Shared layout components

## MarketingHeader

- white header
- EventWow logo left
- primary navigation centre/left
- Sign in as understated action
- Get Quotes as orange primary CTA
- responsive mobile drawer

## MarketingFooter

- dark navy footer is permitted because it acts as a visual end-cap
- clear grouped navigation
- supplier CTA
- social links
- newsletter only if retained as a real product feature

## AppShell

One structural shell for customer, supplier, venue and admin.

Contains:

- 64px topbar
- EventWow logo
- optional global search
- notifications
- avatar/user menu
- 240px sidebar desktop
- mobile drawer
- role-driven navigation configuration
- consistent page content region

Role may change navigation and available actions but must not change the fundamental geometry.

## PageHeader

Every application page uses PageHeader.

Supports:

- eyebrow/breadcrumb optional
- title
- description optional
- primary action
- secondary actions
- tabs optional

Do not implement page titles independently inside pages.

---

# Marketplace domain components

Build these once and reuse across the homepage, category pages, search and profiles.

## EventSearchPanel

Fields as applicable:

- event type
- location
- date
- service/category
- Get Quotes CTA

Desktop may be horizontal. Mobile stacks controls.

## CategoryCard

- strong image
- category title
- optional supplier count
- small functional icon/accent allowed
- no unnecessary body copy

## SupplierCard

Must support:

- landscape image
- supplier/business name
- category
- location/service area
- rating/review count when genuine
- pricing cue when genuine
- favourite action where implemented
- optional verified/featured signal

Do not expose fake/test social proof to public users.

## VenueCard

Similar visual language to SupplierCard with venue-specific metadata.

## ReviewCard

Use real reviews only. Strong quote, customer/event context, rating if available.

## TrustStrip

For genuine platform metrics only. Never hard-code fabricated supplier counts, response times, ratings or verification claims.

---

# Application domain components

## MetricCard

Use sparingly. A dashboard should contain only genuinely useful headline metrics, normally 3-5.

## FilterBar

Shared filtering pattern for enquiries, bookings, suppliers, venues and admin tables.

## DataTable

Consistent:

- row height
- typography
- headers
- hover state
- actions menu
- empty state
- pagination
- mobile fallback

Prefer a table/list over a grid of cards for operational records.

## ActivityFeed

Compact chronological activity, not a set of large cards.

## ConversationThread

Shared message layout for customer/supplier communications.

## FormSection

Standard form grouping with heading, description and aligned fields.

## StickySaveBar

Used for long listing/profile/settings forms where appropriate.

---

# Approved page patterns

Pages should instantiate a page pattern rather than invent their own geometry.

1. DashboardPage
2. ListPage
3. DetailPage
4. FormPage
5. SettingsPage
6. ConversationPage
7. MarketplaceResultsPage
8. MarketplaceProfilePage
9. MarketingLandingPage

Each pattern must be represented on `/design-system` before wide migration begins.

---

# Responsive behaviour

The design system must work at minimum at:

- 360px mobile
- 768px tablet
- 1024px laptop
- 1440px desktop

No component is considered complete if only the desktop view has been checked.

Workspace sidebar collapses to a drawer below the desktop breakpoint. Tables must have an intentional mobile representation rather than accidental horizontal overflow unless the data genuinely requires it.

---

# Accessibility

- keyboard-visible focus states
- semantic labels for every input
- AA contrast minimum for normal text
- buttons/controls have accessible names
- colour is never the sole carrier of status
- minimum practical touch target ~40px

---

# Photography

Photography is central to public EventWow quality.

Use:

- real event atmosphere
- food in service context
- performers in action
- genuine venues
- people enjoying events where permissions allow

Avoid:

- generic corporate stock imagery
- repeated wedding tables as the dominant brand image
- dark imagery throughout the entire page
- AI-looking imagery in production unless intentionally approved

Public category imagery should communicate the breadth of EventWow: weddings, parties, corporate, food, music, venues, marquees, entertainment and celebrations.

---

# Design-system reference route

Create a development/reference route at `/design-system` (not linked in public navigation).

It must render:

- colour tokens
- typography scale
- spacing/radius examples
- all button states
- all form controls and error/disabled states
- badges/statuses
- modals/drawers
- tabs
- pagination
- tables and mobile table treatment
- CategoryCard
- SupplierCard
- VenueCard
- MetricCard
- FilterBar
- PageHeader
- AppShell sample
- MarketingHeader/Footer sample
- approved page pattern miniatures

New reusable visual patterns must be added here before being propagated around the product.

---

# Definition of done for UI work

A frontend change is complete only when:

1. it uses semantic design tokens
2. it reuses approved primitives/domain components where available
3. it follows an approved page pattern
4. desktop and mobile have both been verified
5. loading, empty, error and disabled states are handled where relevant
6. no fake/test public data or invented social proof has been introduced
7. there are no new arbitrary colours, radii or spacing values without documented justification
8. existing business logic has not been changed unless the task explicitly requires it
9. public pages remain fast and image loading is handled responsibly
10. the result visually matches the `/design-system` reference implementation
