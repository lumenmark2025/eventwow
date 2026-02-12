# PR11 Manual Test Checklist

## 1) Run migrations
- Apply `supabase/migrations/20260212_credits_ledger_and_quote_events.sql`.

## 2) Credits ledger writes
1. Adjust credits in admin supplier screen.
2. Confirm `suppliers.credits_balance` changed.
3. Confirm one new `credits_ledger` row exists with:
   - `reason='admin_adjust'`
   - correct `delta`
   - `balance_after` matching supplier balance.

## 3) Quote send ledger write
1. Send a draft quote as supplier.
2. Confirm one new `credits_ledger` row with:
   - `reason='quote_send'`
   - `delta=-1`
   - `related_type='quote'`
   - `related_id=<quote_id>`.

## 4) Admin endpoints

### `GET /api/admin-credits-ledger`
```bash
curl -H "Authorization: Bearer <ADMIN_JWT>" "http://localhost:3000/api/admin-credits-ledger?limit=20&offset=0"
```

### `GET /api/admin-supplier-metrics`
```bash
curl -H "Authorization: Bearer <ADMIN_JWT>" "http://localhost:3000/api/admin-supplier-metrics?from=2026-01-01&to=2026-02-12"
```

### `GET /api/admin-quote-funnel`
```bash
curl -H "Authorization: Bearer <ADMIN_JWT>" "http://localhost:3000/api/admin-quote-funnel?from=2026-01-01&to=2026-02-12"
```

## 5) Admin UI pages
1. Visit `/admin/dashboard`:
   - stats cards load
   - recent ledger + top supplier tables render.
2. Visit `/admin/credits-ledger`:
   - filters work
   - row modal opens
   - CSV export downloads current page rows.
3. Visit `/admin/performance`:
   - table loads
   - search + sort controls work.
