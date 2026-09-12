# Auth, onboarding and claims UI v2

## Pre-migration audit

Baseline `cacddc95c59d7ec6c7adec20c9d9e3f22240551a` on `ui-v2-design-system`.

| Routes | Existing behavior |
| --- | --- |
| `/login`, `/supplier/login` alias | Shared password/OTP login for all roles, unconfirmed-email resend; App resolves role and role-prefixed returnTo. Alias discards query parameters. |
| `/supplier/signup`, `/suppliers/join` alias | Existing seven Supplier fields; public signup POST; automatic password login; existing account/error and login fallback. |
| `/suppliers/verify` | Session/refresh confirmation, signup resend, legacy localStorage draft restoration, role-specific next destination; logout. |
| `/suppliers/onboarding`, `/supplier/onboarding` alias | Three existing steps: categories, descriptions, location/links. Bearer-authenticated me/update/submit endpoints; pending-review state. No media step exists. |
| `/venues/:slug/claim` | Public venue GET and unchanged claim-request POST; existing name/email/role/context fields. |
| `/claim/venue?token=` | Verification GET, missing/invalid/expired token, pending Admin review. Approval/provisioning stays in the existing Admin APIs. |
| `/auth/callback` | Existing code exchange and/or session; normalize returnTo/redirect_to, then shared role resolver. |
| `/forgot-password`, `/reset-password` | Recovery email redirect; token_hash + recovery verification and session check; password validation/update and delayed login redirect. |
| `/auth/reset`, `/update-password` | Existing redirects to reset-password, including their existing parameter-dropping behavior. |
| App access/loading states | Shared role-check presentation only; all guard and session code remains unchanged. |

No dedicated Customer registration or Venue login/signup screen exists. Shared OTP login retains its existing account-creation options; enquiry/claim/provisioning mechanisms are not changed or expanded. There are no additional onboarding questions, upload steps, OAuth providers or MFA controls to migrate.

Existing limitations to preserve and document: login-generated magic links use the bare callback URL and do not forward returnTo; callbacks/login permit role-prefixed workspace destinations rather than arbitrary public booking return paths. Onboarding save catches errors internally, so submit-for-review can proceed after a failed save; this needs a separate workflow correction. Recovery checks session existence rather than requiring a newly established recovery session. No schema, RLS, role, email, token or architecture change is authorized in this presentation pass.

## Delivered presentation

All active routes above use the same focused Public UI v2 auth pattern. The existing AuthShell now reuses PageHeader, public tokens, Inter and the shared EventWow logo. Signup/onboarding use a wider variant of that same panel. Existing buttons, inputs, selects, checkboxes and password controls retain their field constraints and handlers. Visible label associations, error/status announcements, focus outlines, large controls, claim status and Supplier step progress replace the legacy small-text/blue-gradient presentation.

The new pattern is registered at `/design-system`. PublicLogo was extracted unchanged from MarketingHeader into a small shared module, avoiding importing the public navigation and Radix drawer into eager authentication UI. No new password reveal, provider, signup workflow, field or media step was added.

Customer, Supplier, Venue and Admin all retain `/login`; `/supplier/login` retains its redirect. There is no separate Customer register or Venue signup route to claim as migrated. Existing Supplier listing/media editors and Admin approval screens were already Workspace v2 and remain unchanged. No active auth/onboarding/claim route retains its old presentation. Legacy logo asset and route aliases remain for compatibility; unrelated marketing bodies, global route-loading fallback and unused RequestStatusPage remain candidates for the final sweep.

## Security and contract checks

`test:auth` compares parsed code to the baseline: all non-presentation component statements, named helpers, hooks, field constraints, handlers, URLs, autocomplete and action bindings are unchanged across ten auth/onboarding modules. API, Supabase migrations and `src/lib` are byte-identical. App comparison excludes only the two explicitly migrated presentation functions (`AccessDenied`, `LoadingAccess`) and their new UI imports; the complete remaining App—including route elements, all guards, normalization, auth state effects and sign-out—is identical as parsed JavaScript. Earlier journey/SEO contract scripts now use this same precise App comparison instead of rejecting any presentation edit to App.

Browser tests use the installed Supabase JS client and real React routes with an isolated Auth/PostgREST/API transport. They do not patch auth methods in production, call a live identity provider or write real account/claim data.

Verified:

- Shared password login: exact email/password request, unconfirmed-email branch, resend payload, invalid credentials and role-specific successful return.
- OTP: missing email, send/busy/error/check-email presentation, existing `create_user: true` option and exact bare callback URL. This checks the current possible registration entry, not live new-Customer provisioning.
- Supplier signup: existing validation/disabled conditions, exact six-field POST (confirm password remains local), existing-account error and subsequent password login. Existing signup sign-in failure fallback remains source-identical.
- Supplier onboarding: three step bodies/current-step announcements, Back/Next disabling, category selection, exact bearer update/review requests, failed save retaining draft, pending review and empty/unavailable category states.
- Supplier verification: unverified refresh, resend's existing dashboard redirect, successful refreshed verification, and legacy localStorage draft restoration/removal with the original payload.
- Venue claim: existing name/email/role/context payload, check-email response, token verification/pending review and missing/expired-token error. No ownership is granted by presentation.
- Recovery: email redirect, token_hash/type verify request, missing-session/expired-token denial, password mismatch, unchanged updateUser password payload and success state. Aliases still redirect to reset-password with their existing dropped parameters.
- Callback: code exchange (PKCE request), existing implicit magic-link session consumption, invalid/expired code and safe missing-session error. Supplied valid role-prefixed returnTo works for Customer/Supplier/Venue/Admin; external URLs fall back to the original role destination.
- Logout then login as another role in the same browser clears stored auth and displays the new role's workspace. Existing workspace suites verify cross-role/anonymous redirects and that protected API/page code is not fetched by disallowed roles.

## Verification and evidence

- **80 screenshots**: 360 / 768 / 1024 / 1440px for login, forgot password, reset invalid/ready, callback invalid, signup, Supplier verification, claim request/pending, all three onboarding steps/pending review, login error, magic-link sent, expired recovery/claim, onboarding empty/error and access denied. Axe WCAG A/AA and page overflow checks pass without exceptions. Keyboard focus moves through labelled password/form controls and existing navigation/actions. Screenshots were visually reviewed at all four widths.
- `test:auth`: source contracts plus browser assertions above.
- `test:workspace`, `test:admin`, `test:supplier`, `test:supplier-workflows`, `test:venue`, `test:customer`: passed, including existing role guards and media/approval regression checks. The previous calendar week-view accessibility exceptions remain unchanged.
- `test:customer-supplier`: actual-handler regressions and connected browser with simulated stored sessions, refresh/logout, enquiry/send/accept/re-accept, booking and message persistence passed. Email/credit RPC/live storage boundaries remain simulated as previously documented.
- `test:public`, `test:public-journey`, `test:public-seo`: public header/logo, prior request/decision contracts and SEO/route contracts verified after shared presentation changes.
- Agent-browser smoke: login renders its labelled password/magic-link controls without browser errors.
- Vite compilation passes; full lint retains the pre-existing **429 errors / 12 warnings**, with no new diagnostics by file/rule/severity/message. No unrelated lint debt was changed. Build sizes and command summaries are recorded in `checks.json`.

Run `npm run test:auth` using Node 22 and the existing dummy local Vite settings in the [journey verification](../public-journey-v2/README.md). `WORKSPACE_TEST_URL` and `AUTH_SCREENSHOTS` override the local server/output folder. Fixtures block external data traffic and must never be deployed.

## Performance and remaining risks

The auth panel is stateless: no additional session reads, fetches, subscriptions or polling. Existing route lazy boundaries are unchanged; Login retains its existing eager import. Self-hosted Inter/public tokens are shared. Entry JavaScript is **436.44 kB / 128.11 kB gzip**, versus **433.70 / 126.86** before this change (about 1.25 kB additional gzip). The focused stylesheet and shared logo add a small measured initial-asset cost, recorded in `checks.json`; no new production dependencies or imagery are introduced. Existing StrictMode/session/verification duplicate reads remain untouched.

This is **not live authentication or provisioning sign-off**. Staging still needs real password/OTP signup, email confirmation/resend, code/token expiry, session revocation/refresh, recovery, Supplier credit provisioning and Venue Admin approval/ownership tests with designated accounts. Email templates, allowlisted callback origins, Supabase settings and role assignment were not changed or deployed. The earlier RLS hardening migration also still needs confirmed staging deployment.

Existing behavior requiring separately scoped decisions:

1. Login-generated magic links omit returnTo; role-prefixed return handling does not honor arbitrary public booking paths. Supplier login and password-reset aliases discard query parameters. These limitations are explicitly tested/preserved, not reported as working destination retention.
2. Recovery permits any existing session after its bootstrap; it does not require proof that the session was established by the current recovery link. That auth behavior needs its own security review rather than a silent UI rewrite.
3. Supplier submit-for-review calls saveProgress, whose internal catch does not rethrow; review submission may still proceed after a failed save. Submission atomicity and error propagation need a separate workflow fix.
4. Password login has no existing in-flight submit guard; Supplier resend has no dedicated success confirmation. Signup's disabled validation gate can prevent its fieldErrors from being reached. Existing errors/success/disabled branches are preserved.
5. No dedicated Customer register, Venue signup, or onboarding media step exists. Do not infer missing production workflows from the visual references.

Recommended final visual sweep: `/how-it-works`, `/pricing`, `/contact`, global loading/not-found/fallback states, and static prerender home/detail fallbacks; inventory unused legacy components before removal. Keep auth return/recovery hardening, onboarding save/review reliability, public message history and live RLS deployment as separate reviewed tasks.

Supabase references reviewed for the existing contracts: [OTP sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), and the changelog. No Supabase behavior/configuration was implemented or upgraded here.

[Checks](checks.json) · [Browser results](browser-results.json) · [Source contracts](source-contracts.txt) · [Mobile login](login-360.png) · [Desktop signup](signup-1440.png) · [Onboarding](onboarding-1-1440.png) · [Claim status](claim-pending-768.png)
