# Eventwow PR Progress Recap (as of February 14, 2026)

## PR19 - Customer Quote Compare + Shortlist + Ask Question

### What was delivered
- Customer enquiry quotes page and route:
  - `src/pages/marketing/EnquiryQuotesPage.jsx`
  - `src/App.jsx` (`/request/:token`, `/enquiry/:token`)
- Public enquiry quotes API with shortlist data:
  - `api/public-enquiry-quotes.js`
- Shortlist toggle API:
  - `api/public-toggle-shortlist.js`
- Customer->supplier thread start and messaging APIs:
  - `api/public-start-thread.js`
  - `api/public-send-message.js`
- DB migration for shortlist persistence:
  - `supabase/migrations/20260214_enquiry_shortlists.sql`

### Functional outcome
- Customers can compare quotes, sort, shortlist suppliers, and message suppliers in-thread.
- Shortlist state is persisted server-side and returned to UI.
- Token-based access pattern is in place for public enquiry flows.

### Status
- Implemented in codebase.
- UAT checklist exists: `docs/pr19-customer-compare-shortlist-checklist.md`.

---

## PR20 - Supplier Performance Signals + Trust Badges

### What was delivered
- DB migration + performance view support:
  - `supabase/migrations/20260214_supplier_performance_signals.sql`
- Performance signal builder:
  - `api/_lib/performanceSignals.js`
- Public supplier APIs now include performance signals:
  - `api/public-suppliers.js`
  - `api/public-supplier.js`
- Supplier performance API for supplier-side dashboard:
  - `api/supplier-performance.js`
- UI surfacing:
  - Supplier cards trust badges: `src/components/marketing/SupplierCard.jsx`
  - Public supplier profile performance card: `src/pages/marketing/SupplierProfilePage.jsx`
  - Supplier dashboard performance card: `src/supplier/pages/SupplierDashboard.jsx`
- Activity freshness updates (`last_active_at`) wired into supplier actions:
  - `api/supplier-save-draft-quote.js`
  - `api/supplier-send-quote.js`
  - `api/supplier-public-profile-save.js`

### Functional outcome
- Public supplier surfaces show response time, acceptance, and trust badges when available.
- Supplier dashboard shows "Your performance" metrics.
- Supplier activity updates feed performance recency signals.

### Status
- Implemented in codebase.
- UAT checklist exists: `docs/pr20-performance-signals-checklist.md`.

---

## PR20a - Venues Directory + Venue Profile + Admin Venue CMS

### Base delivery
- DB schema/migration for venues CMS + images + venue/supplier links:
  - `supabase/migrations/20260214_venues_public_and_cms.sql`
- Admin venues CMS APIs:
  - `api/admin-venues.js`
  - `api/admin-venue-save.js`
  - `api/admin-venue-upload-image.js`
  - `api/admin-venue-delete-image.js`
  - `api/admin-venue-reorder-gallery.js`
  - `api/admin-venue-set-linked-suppliers.js`
- Admin venues UI:
  - `src/admin/venues/VenueList.jsx`
  - `src/pages/admin/VenuesPage.jsx`
- Public venues APIs/pages:
  - `api/public-venues.js`
  - `api/public-venue.js`
  - `api/public-venues-search.js`
  - `src/pages/marketing/VenuesPage.jsx`
  - `src/pages/marketing/VenueProfilePage.jsx`

### Hotfix work completed
- Admin list API contract aligned to list shape:
  - returns `{ rows }` in list mode (`api/admin-venues.js`)
- Admin list fetch error visibility improved:
  - non-200 now shows clear error text in UI (`src/admin/venues/VenueList.jsx`)
  - temporary dev-only response-shape console log added.
- Admin list query hardened:
  - no publish filter in admin list
  - no INNER JOIN in list path (prevents dropping venues lacking images/links)
  - ordered by `updated_at desc`, then `created_at desc`.
- Publish flag drift mitigation:
  - Admin save writes the canonical flag:
    - `is_published`
  - Added sync migration + trigger:
    - `supabase/migrations/20260214_venues_publish_flags_sync.sql`
- Public venues standardization (venue visibility):
  - public venue list/detail now filter on `is_published` consistently:
    - `api/public-venues.js`
    - `api/public-venue.js`

### Production issue discovered
- `https://www.eventwow.co.uk/api/admin-venues` returned `404` during investigation.
- Added explicit API passthrough rewrite:
  - `vercel.json`: `"/api/:path*" -> "/api/:path*"`
- This points to deployment/routing drift as a key live blocker until redeployed.

### Status
- Code-level fixes implemented.
- UAT checklist exists: `docs/pr20a-venues-directory-cms-checklist.md`.
- Final live verification depends on:
  - deploying latest API/UI changes
  - running latest venues migrations in target database.

---

## Current Cross-PR Summary

### Completed in repository
- PR19 core customer compare/shortlist/messaging flow.
- PR20 performance/trust signal pipeline and UI surfacing.
- PR20a venue CMS + public venue surfaces + admin list hardening + publish flag sync migration.

### Pending environment confirmation (live)
- Apply latest migrations in production DB (including publish-flag sync migration).
- Deploy latest API routes/UI bundle (ensure `/api/admin-venues` is not 404).
- Re-run UAT checklists on production.
