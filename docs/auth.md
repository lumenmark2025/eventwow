# Auth Redirect Configuration (Vercel + Supabase)

This app now computes auth redirect origins from:

1. `VITE_SITE_URL` (preferred)
2. `window.location.origin` (browser fallback)

Redirect paths used by the app:

- Magic link / OTP: `${origin}/auth/callback`
- OAuth callback: `${origin}/auth/callback` (if OAuth is added)
- Password reset callback: `${origin}/auth/reset` (if reset flow is added)

## 1) Supabase Dashboard settings

In **Authentication -> URL Configuration**:

- **Site URL**: `https://YOURDOMAIN`
- **Redirect URLs** should include:
  - `https://YOURDOMAIN/*`
  - `https://www.YOURDOMAIN/*` (if used)
  - `https://YOURPROJECT.vercel.app/*` (optional for preview)
  - `http://localhost:5173/*` (local dev)

## 2) Vercel environment variables

Set in **Project -> Settings -> Environment Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SITE_URL=https://YOURDOMAIN`

Then redeploy.

## 3) Local development

In local env (for example `.env.local`):

- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`
- Optional for local-only testing:
  - `VITE_SITE_URL=http://localhost:5173`

If `VITE_SITE_URL` is not set locally, the app falls back to `window.location.origin`.

## 4) Notes

- If `VITE_SITE_URL` is set to localhost in a deployed environment, a dev warning is logged.
- Never set service role keys in browser env vars.
