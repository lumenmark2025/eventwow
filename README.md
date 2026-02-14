# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Auth Redirect Setup

See `docs/auth.md` for required Supabase URL configuration and Vercel env vars to keep auth callbacks on the correct domain.

## Stripe Deposits

See `docs/payments.md` for PR12 env vars, webhook setup, and local test steps.

## Local Dev Routing Note

- Use `npm run dev` (Vite) for frontend development.
- Do not add broad rewrites that capture arbitrary two-segment paths (e.g. `/:a/:b`) to `index.html`, because this can rewrite Vite internal requests like `/@vite/client` and `/src/main.jsx`, causing HTML-to-JS parse errors in dev.
