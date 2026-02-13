# PR18 Supplier-Specific Request Flow Checklist

1. Run migration `supabase/migrations/20260213_supplier_specific_request_flow.sql`.
2. Open a publish-ready supplier profile and click `Request a quote`.
3. Confirm route is `/suppliers/:slug/request-quote`.
4. Confirm page title says `Request a quote from {SupplierName}`.
5. Confirm phone is required (client + server).
6. Confirm venue autocomplete returns venue matches from `/api/public-venues-search`.
7. Select a venue and submit; verify `enquiries.venue_id` and `enquiries.venue_name` are stored.
8. Test free-text venue (no selection) and verify `venue_id` is null but `venue_name` is stored.
9. If supplier has one category, confirm category field is hidden and auto-applied.
10. If supplier has multiple categories, confirm dropdown is shown and required.
11. Verify useful-details rule:
   - fail when notes < 40 chars and fewer than 2 structured fields filled
   - pass when notes >= 40 OR 2+ structured fields are filled
12. Submit enquiry and confirm exactly one invite row is created for that supplier.
13. Confirm redirect to `/request/:token` and status page shows `Request sent to {SupplierName}`.
