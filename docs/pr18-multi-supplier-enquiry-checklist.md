# PR18 UAT Checklist - Multi-Supplier Enquiry + Micro Gate

1. Run migration `supabase/migrations/20260213_public_enquiry_flow.sql`.
2. Ensure at least one supplier is `listed_publicly=true` and passes micro gate:
   - short description >= 30 chars
   - about >= 120 chars
   - location label >= 3 chars
   - at least 1 category
   - hero image exists
   - at least 2 gallery images
   - at least 3 services
3. Submit a request on `/request`.
4. Confirm API returns `publicToken` and page redirects to `/request/:token`.
5. Confirm status page shows invited count and invite rows.
6. Confirm non-gated suppliers are not invited.
7. Log in as invited supplier and open `/supplier/enquiries`.
8. Confirm enquiry appears with event/location/message summary.
9. Click `Create quote` and confirm it opens quote draft in `/supplier/quotes`.
10. Click `Decline` and confirm status updates to declined.
11. Re-open `/request/:token` and confirm supplier status/quote summary reflects updates.
12. In `/supplier/listing`, attempt publish with missing gate fields and confirm server blocks with gate reasons.
