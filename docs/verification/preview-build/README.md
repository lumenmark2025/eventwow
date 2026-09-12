# Preview build / strict Production prerender

Baseline: `920cd7dec4e51f8abeffe230609d15d4ed9b6d85` on `ui-v2-design-system`.

## Root cause and minimal change

`package.json` runs `vite build && node scripts/prerender-seo.mjs`. Vite succeeds, but the prerender's existing `requireSupabaseClient()` throws when its URL or service-role key is unavailable, independently of the deployment target.

Added one early return in prerender `main()`, after existing dotenv loading and Vite-template reading, before creating a privileged Supabase client. It applies **only** when `VERCEL_ENV === "preview"` and either required credential is unavailable. The URL resolution and whitespace handling match the existing strict credential check.

The build command, Vite configuration, credential validation, queries, data selection, SEO/schema/canonical/sitemap generation, runtime APIs, auth, RLS and permissions remain unchanged. No broad exception handler or error suppression was added.

| Environment | Credentials | Result |
| --- | --- | --- |
| `preview` | Missing URL or service-role key | Vite runs normally; only prerender skips; exit 0. |
| `preview` | Present | Normal prerender executes; data/other failures still fail the build. |
| `production` | Missing | Existing explicit credential error; build exits 1. |
| `production` | Present | Normal prerender executes; failures remain fatal. |
| Local/unset, `development`, other values | Missing | Existing strict failure retained. |
| Local/unset | Present via existing environment or `.env.local`/`.env` | Existing prerender executes normally. `npm run dev` remains independent of Vercel variables. |

Preview skip log:

```
[prerender-seo] skipped for Preview: required Supabase prerender credentials are unavailable; Vite application build retained.
```

## Verification

Run with the repository's supported Node runtime (Node 22 used here):

```
npm run test:prerender-build
npm run test:public-seo
npm run lint
```

The new build matrix creates a temporary source copy, excludes repository dotenv files, supplies an isolated environment, and uses a loopback HTTP fixture with the real installed Supabase client. It does not query a real Supabase project, mutate data, or create real credentials. Temporary source/output is cleaned up.

- Full `npm run build` with Preview + no key: Vite compiles, original client root remains, no Supabase query, explicit skip log, exit 0.
- Full `npm run build` with Production + no key: Vite compiles first, then the exact existing missing-credential error, exit 1.
- Full Production-like build with fixture URL/key: normal privileged reads, generated home/category/Supplier/Venue HTML and sitemap, canonical assertions, exit 0. This verifies the complete build path rather than mocking `main()`.
- Preview missing URL/whitespace key; Production missing URL; local/development/unknown environment missing credentials; Preview with credentials; local dotenv credentials; Preview/Production data failures: 13 cases total.
- A dynamically generated private canary is present during the Production-like Vite build. All 203 generated files, including client JavaScript/CSS and prerender HTML, were scanned; the canary is absent. Fixture requests prove the prerender server process received it.
- Existing SEO source/static/browser suite verifies metadata, canonicals, schema, sitemap and crawlable output at four widths. Its AST comparison excludes only the new build guard, retaining comparison of every other `main()` statement and the unchanged credential validator.
- Full lint remains **428 errors / 12 warnings**, with no new diagnostic by file/rule/message/severity. The pre-existing backlog is untouched.

Results/logs are under `/tmp/eventwow-preview-build` (`BUILD_VERIFICATION_OUTPUT` can override that path). Committed [results](results.json) and [checks](checks.json) summarize this run.

## Security and deployment requirements

No real secret was read, added to the repository, or logged. No service-role variable was added to Vite's exposed prefix, configuration or client code. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; never rename it with a `VITE_` prefix. Existing public URL/anon configuration and runtime server credentials still need their appropriate environment scopes; skipping SEO does not supply missing runtime capabilities.

For Vercel, retain the normal `npm run build` command, `dist` output and supported Node version. Ensure system environment variables are exposed so the genuine Preview build receives `VERCEL_ENV=preview`; do not manually override Production to `preview`. Preview no longer needs a service-role key merely for SEO build completion. Production still requires the configured Supabase URL and server-only service-role key.

A skipped Preview has the normal client-rendered Vite application rather than generated SEO pages. Validate crawlable prerender output with a fresh Production-target build using its required credentials; promoting a skipped Preview artifact does not rerun a Production build.

After push, inspect the Vercel deployment for this branch's exact commit: target Preview, successful Vite output, the skip line when credentials are absent, and final Ready status. Confirm the deployed URL loads and inspect browser/runtime errors with correctly scoped public/runtime configuration. Existing rewrite/deep-link gaps and live auth/quote/RLS staging requirements from the [final sweep](../final-v2-sweep/README.md) remain separate from this build fix.

References: [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Vite environment exposure](https://vite.dev/guide/env-and-mode). No Supabase SDK/configuration upgrade is included.

## Dependency-install repair

The Vercel log supplied after the build-policy change showed failure **before Vite**: npm rejected the direct `"-": "^0.0.1"` dependency with `EINVALIDPACKAGENAME`. Reproduced that exact failure using npm 11.8.0 in an isolated directory.

Removed `-`, `g` and `npm` from the application dependencies after checking source, API, scripts and build configuration for imports/requires or runtime use. `g` is an unused globalizing utility; the `npm` package is an unused application dependency. Build scripts continue to invoke the environment-provided npm CLI normally. No legitimate application dependency was replaced.

Regenerated `package-lock.json` through npm 11.8.0, then ran `npm install` in the workspace and again in a fresh temporary directory. The fresh install succeeds and leaves the regenerated lockfile byte-identical. npm removed the three unused roots and npm's bundled subtree (164 lock entries), and restored 53 platform-specific optional entries. Every retained package preserves its version, resolved URL and integrity hash; metadata/platform bookkeeping accounts for the wider lockfile diff.

Verification:

- npm 11.8.0, Node 22.23.2: workspace and fresh-directory `npm install` passed.
- npm's package-name validator checked 1,057 references across both manifests and all locked package/dependency names: no malformed names.
- Vite compile passed; entry remains 436.52 kB / 128.11 kB gzip.
- `test:prerender-build`: all 13 cases passed, including successful credentialless Preview, strict Production failure, fixture-backed Production generation and client-secret canary checks.
- `test:final-sweep`: source/static checks and all 40 responsive/axe checks passed. Its dependency assertion now permits the explicitly removed roots and restored platform optionals, while retaining identity checks for every other locked package.
- Lint: 428 existing errors / 12 warnings, zero new diagnostics.

The earlier environment-aware prerender fix remains unchanged. Dependency installation no longer fails on the malformed `-` entry; actual Vercel status must still be checked for the resulting commit.
