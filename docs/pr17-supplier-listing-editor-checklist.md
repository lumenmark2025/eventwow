# PR17 UAT Checklist - Supplier Listing Editor

1. Run migration `supabase/migrations/20260213_supplier_listing_editor.sql`.
2. Open `/supplier/listing` as a supplier.
3. Confirm existing listing data loads (short description, about, services, categories, location).
4. Update copy fields and click `Save changes`.
5. Refresh page and confirm saved values persist (DB truth).
6. Toggle `Show this supplier in the public directory` on and save.
7. Verify supplier appears on `/suppliers`.
8. Toggle listing off and save.
9. Verify supplier is removed from `/suppliers`.
10. Upload a hero image and verify it appears on `/suppliers/:slug`.
11. Upload gallery images, move one up/down, refresh, and verify order persists.
12. Delete a gallery image and verify it is removed from UI and public profile.
13. Confirm supplier cannot edit another supplier’s listing via API (server returns 404/409/401).
