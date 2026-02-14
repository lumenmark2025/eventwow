# PR19 UAT Checklist: Customer Quote Compare + Shortlist + Ask Question

## Setup
- Ensure `20260214_enquiry_shortlists.sql` is applied.
- Use an enquiry token with at least 2 supplier quotes in status `sent` or later.

## Customer quote page
- Open `/enquiry/<token>`.
- Confirm enquiry summary renders (date/guests/venue where present).
- Confirm quotes list loads with supplier-safe fields only.

## Compare view
- Switch to `Compare`.
- Confirm side-by-side columns render for each quote.
- Confirm sorting works: `Recommended`, `Cheapest`, `Newest`.

## Shortlist
- Click `Shortlist` on one quote.
- Confirm badge/state updates immediately.
- Refresh page and confirm shortlist persisted.
- Enable `Shortlisted only` and confirm filtering works.

## Ask a question
- Click `Ask a question` on a quote card.
- Confirm thread opens and historical messages load.
- Send a message; confirm message appears in drawer.
- Confirm supplier can see the message in supplier messages.

## Accept/Decline
- Click `Accept quote` on a `sent` quote.
- Confirm quote status updates to `accepted` after refresh.
- Confirm accept/decline controls lock on non-`sent` quotes.
- Try conflicting action after terminal status; confirm UI shows API conflict message.

## Security and indexing
- Invalid token returns `404` behavior in UI.
- Confirm enquiry page includes robots noindex (`noindex,nofollow`).
- Confirm no private supplier fields are exposed in `/api/public-enquiry-quotes`.
