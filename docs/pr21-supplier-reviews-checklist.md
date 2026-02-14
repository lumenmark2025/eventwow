# PR21 UAT Checklist: Supplier Reviews (Moderated MVP)

## 1) Apply migration
- Run:
  - `supabase/migrations/20260214_supplier_reviews.sql`

## 2) Submit flow
- Submit a review via `POST /api/reviews/submit` with:
  - `supplier_id`
  - `rating` (1-5)
  - `review_text`
  - `reviewer_name`
  - optional `enquiry_id`
- Verify DB row exists in `public.supplier_reviews` with:
  - `is_approved = false`

## 3) Admin moderation
- Open `/admin/reviews`.
- Confirm pending review appears with supplier name, rating, reviewer name, and preview text.
- Click `Approve`:
  - row should disappear from pending list.
  - DB row should have `is_approved = true`.
- Submit another review and click `Reject`:
  - row should disappear from pending list.
  - DB row should be deleted.

## 4) Public visibility + safety
- Unapproved reviews must not appear in:
  - `/suppliers` cards
  - `/suppliers/:slug` review section
  - linked supplier cards on `/venues/:slug`
- Approved reviews appear on `/suppliers/:slug` only.
- Confirm public APIs do not include unapproved review rows.

## 5) Ratings aggregation
- After approving reviews, verify `public.supplier_review_stats` shows:
  - `average_rating` from approved-only rows
  - `review_count` approved-only count
- Confirm rating + count update in:
  - supplier directory cards (`/suppliers`)
  - supplier profile (`/suppliers/:slug`)
  - venue-linked supplier cards (`/venues/:slug`)

## 6) RLS and role boundaries
- Confirm `public.supplier_reviews` has RLS enabled.
- Confirm only approved rows are selectable under public policy.
- Confirm suppliers cannot directly create/update/delete reviews via client RLS paths.
- Confirm admin moderation uses `/api/admin/reviews*` server endpoints.
