# PR23 Smart Enquiry Form Checklist

## Migration
- [ ] Run `supabase/migrations/20260214_smart_enquiries_upgrade.sql`.
- [ ] Confirm new enquiry columns exist:
  - `event_type`, `enquiry_category_slug`, `start_time`, `budget_range`
  - `venue_known`, `venue_name`, `venue_postcode`
  - `indoor_outdoor`, `power_available`, `dietary_requirements`
  - `contact_preference`, `urgency`
  - `message_quality_score`, `message_quality_flags`
  - `structured_answers`, `source_page`, `created_ip_hash`

## Public API
- [ ] `POST /api/public/enquiries` accepts valid structured payload and returns:
  - `ok: true`
  - `enquiry_id`
  - `publicToken`
  - confirmation `message`
- [ ] Validation rejects:
  - message under 80 chars
  - venue known with no venue name/postcode
  - wedding/corporate/festival with no guest count
  - contact-only or repeated-character junk
- [ ] Legacy route `/api/public-create-enquiry` still works (wrapper to same logic).

## Frontend UX
- [ ] `/request` has structured inputs and conditional power toggle for pizza catering.
- [ ] `/suppliers/:slug/request-quote` has the same structured validation and uses `/api/public/enquiries`.
- [ ] Inline message-length warning appears below 80 chars.
- [ ] Error summary shows user-friendly suggestions/hints.

## Admin visibility
- [ ] `GET /api/admin/enquiries/:id` returns internal fields including:
  - `message_quality_score`
  - `message_quality_flags`
  - `structured_answers`
- [ ] Admin enquiry detail screen displays score + flags and structured fields.

## PR18 compatibility checks
- [ ] Successful submit still creates `enquiry_suppliers` invites.
- [ ] Redirect still goes to `/enquiry/:publicToken`.
- [ ] Existing quote/invite flow remains functional.

## Local verify
1. Run `npm run dev`.
2. Submit short/junk request on `/request` and verify 400 + hints.
3. Submit complete structured request and verify redirect to `/enquiry/:token`.
4. Open admin enquiry detail and verify quality score and flags are visible.
