# PR16 UAT Checklist - Public Supplier Profile

1. Open `/suppliers` and click `View profile` on a published supplier card.
2. Confirm `/suppliers/:slug` loads with:
   - Name, category badges, location badge
   - About, Services, Gallery, Reviews sections
   - Request quote CTA and back link
3. Confirm unpublished or unknown slug returns branded not-found state.
4. Confirm canonical URL is set to `https://eventwow.co.uk/suppliers/:slug`.
5. Confirm API response from `/api/public-supplier?slug=...` does not include private fields like `auth_user_id`, credits, private email, or phone.
6. Confirm mobile layout stacks correctly and tap targets are comfortable.
