# Admin mini-tool: Create supplier + login

This adds a "Create supplier + login" flow inside the Admin → Suppliers tab.

## 1) Database (one-time)

Ensure `suppliers.auth_user_id` exists:

```sql
alter table public.suppliers
add column if not exists auth_user_id uuid unique;

create index if not exists suppliers_auth_user_id_idx
on public.suppliers(auth_user_id);
```

## 2) Vercel / Server env vars (one-time)

Set these env vars on Vercel (Project → Settings → Environment Variables):

- `SUPABASE_URL` (or reuse `VITE_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (or reuse `VITE_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`  **(server-only, do not expose to client)**

## 3) Install dependency (if not already)

Serverless function uses `@supabase/supabase-js`.

```bash
npm i @supabase/supabase-js
```

## 4) How it works

From Admin → Suppliers:

- Enter business name + login email
- Click **Create supplier + login**

The API route:
- verifies the caller is an admin via `public.user_roles`
- creates the supplier auth user (email confirmed)
- inserts the supplier row with `auth_user_id` linked

Supplier can then sign in via **magic link** on the normal login page.
