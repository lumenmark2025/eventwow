# PR20 UAT Checklist: Supplier Performance Signals + Trust Badges

## Apply migration
- Run `supabase/migrations/20260214_supplier_performance_signals.sql`.

## Public suppliers directory
- Open `/suppliers`.
- Confirm cards can show:
  - `Replies in ~Xh` (when data exists)
  - `Y% acceptance` (when data exists)
  - Trust badges (`Fast responder`, `High conversion`, `Active`) when thresholds are met.
- Confirm new suppliers with no history show no broken stats (null-safe UI).

## Public supplier profile
- Open `/suppliers/:slug`.
- Confirm `Performance` card shows:
  - Typical reply time
  - Acceptance rate
  - Last active
- Confirm no sensitive fields are exposed.

## Supplier dashboard
- Open supplier dashboard.
- Confirm `Your performance` card renders and loads values from `/api/supplier-performance`.

## Last active updates
- Perform supplier actions:
  - Save draft quote
  - Send quote
  - Save public profile
- Verify `suppliers.last_active_at` updates in DB.

## Data verification
- For a known supplier, compare API values to SQL:
  - `supplier_performance_30d.acceptance_rate`
  - `supplier_performance_30d.response_time_seconds_median`
  - `supplier_performance_30d.last_active_at`
