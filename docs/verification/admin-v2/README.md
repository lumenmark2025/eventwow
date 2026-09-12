# Admin v2 completion verification

These screenshots show the actual Admin route components using isolated synthetic browser fixtures. All API/Supabase traffic is intercepted, including mutations. No fixture data is embedded in production pages.

| Screen/state | Desktop | Mobile |
| --- | --- | --- |
| Supplier applications | [1440px](applications-1440.png) | [360px](applications-360.png) |
| Venue claims | [1440px](claims-1440.png) | [360px](claims-360.png) |
| Reviews | [1440px](reviews-1440.png) | [360px](reviews-360.png) |
| Categories | [1440px](categories-1440.png) | [360px](categories-360.png) |
| Credits ledger | [1440px](ledger-1440.png) | [360px](ledger-360.png) |
| Supplier performance | [1440px](performance-1440.png) | [360px](performance-360.png) |
| Venue hero images | [1440px](hero-images-1440.png) | [360px](hero-images-360.png) |
| Create category | [1440px](category-create-1440.png) | [360px](category-create-360.png) |
| Edit category | [1440px](category-edit-1440.png) | [360px](category-edit-360.png) |
| Ledger entry | [1440px](ledger-detail-1440.png) | [360px](ledger-detail-360.png) |
| Create supplier | [1440px](supplier-create-1440.png) | [360px](supplier-create-360.png) |
| Supplier detail | [1440px](supplier-detail-1440.png) | [360px](supplier-detail-360.png) |
| Credit adjustment | [1440px](supplier-credit-adjust-1440.png) | [360px](supplier-credit-adjust-360.png) |
| Venue detail | [1440px](venue-detail-1440.png) | [360px](venue-detail-360.png) |
| AI venue builder | [1440px](venue-ai-builder-1440.png) | [360px](venue-ai-builder-360.png) |
| Venue CSV preview | [1440px](venue-bulk-preview-1440.png) | [360px](venue-bulk-preview-360.png) |
| Enquiry detail | [1440px](enquiry-detail-1440.png) | [360px](enquiry-detail-360.png) |
| Quote draft | [1440px](enquiry-quote-draft-1440.png) | [360px](enquiry-quote-draft-360.png) |
| Create enquiry | [1440px](enquiry-create-1440.png) | [360px](enquiry-create-360.png) |

Intermediate-width examples: [categories at 768px](categories-768.png), [performance at 1024px](performance-1024.png). Wide tables scroll within their panel at tablet/laptop widths; mobile tables stack labelled cells. Keyboard focus scrolls table actions into view.

Supporting-state examples: [loading](applications-loading.png), [empty](categories-empty.png), [error](hero-images-error.png). Detail examples: [loading enquiry](enquiry-detail-loading.png), [failed supplier](supplier-detail-error.png), [missing venue](venue-detail-missing.png). The runner generates the full state matrix.

## Checks

- All seven remaining navigation destinations, all three detail editors, enquiry creation and eight dialog/embedded form states checked at 360, 768, 1024 and 1440px. No document/dialog horizontal overflow; internal wide-table scrolling is intentional. Axe WCAG 2 A/AA and 2.1 AA checks pass on each populated screen/dialog at desktop width.
- Supplier publication/rejection (including notes), venue claim approval/rejection and review approval/rejection: original request contracts, busy disabling, error feedback and retry recovery.
- Categories: create/edit validation and payloads, busy featured toggle, save failure, Escape/focus restoration. The existing inline-order persistence issue is documented in the audit; its edit-dialog workaround is retained.
- Ledger: keyboard row activation, detail dialog, CSV download.
- Supplier: create validation, detail/listing/media controls, disabled credit confirmation. Venue: detail save, AI-builder disabled actions, bulk CSV preview. Enquiry: detail, mark-viewed request, quote draft and disabled acceptance before sending.
- Loading, empty and error states on all seven supporting routes; loading/error/not-found feedback in all three detail editors; failed initial loads hide Save and default metrics. Existing empty credit history, ranking, media and quote views remain available.
- The existing workspace regression suite covers primary-screen creation, venue delete cancellation/confirmation, search/filter/navigation, Radix focus behaviour and non-Admin/unauthenticated guards. No Admin route module is requested by those guarded roles.
- Browser runtime error capture is empty. New shared presentation and test modules lint cleanly. The overall repository remains at its baseline 431 lint errors / 12 warnings, with no added Admin diagnostics by file/rule/message (excluding moved source excerpts).
- `npm run build`: Vite compiles successfully; SEO prerender remains blocked by missing Supabase service-role environment credentials. Live storage/AI/backend writes were not exercised.

## Reproduce

Use Node 22 and the isolated Vite environment described in [the audit](../../WORKSPACE_V2_AUDIT.md#reproducing-browser-verification), then run:

```sh
npm run test:workspace
npm run test:admin
```

`ADMIN_SCREENSHOTS` controls this suite's output folder (default `/tmp/eventwow-admin-v2`); `WORKSPACE_TEST_URL` selects the local server. Install Chromium with `npx playwright install chromium` if needed.

[Passing assertions](results.json) · [Full route audit and risks](../../WORKSPACE_V2_AUDIT.md#admin-completion-phase--12-september-2026) · [Canonical reference](../../reference/eventwow_admin_radix_reference.html) · [Foundation regression evidence](../workspace-v2/README.md)
