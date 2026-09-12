/* global process, console */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { authFixtures } from "./fixtures/auth-browser.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.AUTH_SCREENSHOTS || "/tmp/eventwow-auth-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const fixture = authFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const results = [];
async function inspect(f, name, width) {
  await f.page.evaluate(() => document.fonts.ready);
  await f.page.waitForTimeout(180);
  assert.ok(
    await f.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `${name} overflow ${width}`,
  );
  await f.page.addScriptTag({ content: axe });
  const errors = await f.page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  );
  assert.deepEqual(errors, [], `${name} accessibility ${width}`);
  assert.deepEqual(f.errors, []);
  await f.page.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
  });
  results.push({ name, width, axe: "pass", overflow: false });
}
async function open(f, path, title) {
  await f.page.goto(base + path);
  await f.page.getByRole("heading", { name: title, exact: true }).waitFor();
}
try {
  for (const width of [360, 768, 1024, 1440]) {
    const f = await fixture();
    await f.page.setViewportSize({ width, height: 1000 });
    for (const [path, title, name] of [
      ["/login", "Welcome back", "login"],
      ["/forgot-password", "Reset your password", "forgot"],
      ["/reset-password", "Set your new password", "reset-invalid"],
      ["/auth/callback", "Signing you in", "callback-invalid"],
      ["/supplier/signup", "Join Eventwow as a supplier", "signup"],
      ["/suppliers/verify", "Verify your email", "supplier-verify"],
      ["/venues/fixture-hall/claim", "Claim this venue", "claim"],
      [
        "/claim/venue?token=fixture-token",
        "Venue claim status",
        "claim-pending",
      ],
    ]) {
      await open(f, path, title);
      if (name === "reset-invalid" || name === "callback-invalid")
        await f.page.getByRole("alert").waitFor();
      if (name === "claim-pending")
        await f.page.getByText(/is pending admin review/).waitFor();
      await inspect(f, name, width);
    }
    await f.context.close();
    const s = await fixture({ signedIn: true, role: "supplier" });
    await s.page.setViewportSize({ width, height: 1000 });
    await open(s, "/suppliers/onboarding", "Complete your supplier profile");
    await s.page.getByRole("checkbox", { name: "Catering" }).waitFor();
    await inspect(s, "onboarding-1", width);
    await s.page.getByRole("button", { name: "Next", exact: true }).click();
    await s.page.getByLabel("Short description", { exact: true }).waitFor();
    await inspect(s, "onboarding-2", width);
    await s.page.getByRole("button", { name: "Next", exact: true }).click();
    await inspect(s, "onboarding-3", width);
    s.state.onboarding = "pending_review";
    await s.page.reload();
    await s.page
      .getByRole("heading", { name: "Thanks, your listing is under review" })
      .waitFor();
    await inspect(s, "onboarding-pending", width);
    await s.context.close();
    const r = await fixture({ signedIn: true });
    await r.page.setViewportSize({ width, height: 1000 });
    await open(r, "/reset-password", "Set your new password");
    await r.page.getByLabel("New password", { exact: true }).waitFor();
    await inspect(r, "reset-ready", width);
    await r.context.close();
  }
  // Real installed Supabase JS over isolated Auth transport; retain exact outgoing contracts.
  const f = await fixture();
  await open(f, "/login?returnTo=%2Fcustomer%2Fenquiries", "Welcome back");
  await f.page
    .getByRole("button", { name: "Send magic link", exact: true })
    .click();
  await f.page
    .getByRole("alert")
    .filter({ hasText: "Enter your email first." })
    .waitFor();
  await f.page
    .getByLabel("Email", { exact: true })
    .fill("customer@example.test");
  await f.page
    .getByRole("button", { name: "Send magic link", exact: true })
    .click();
  await f.page
    .getByRole("status")
    .filter({ hasText: "Magic link sent" })
    .waitFor();
  const otp = f.state.calls.find((c) => c.path.endsWith("/otp"));
  assert.equal(otp.body.email, "customer@example.test");
  assert.equal(otp.body.create_user, true);
  assert.equal(otp.query.redirect_to, base + "/auth/callback");
  assert.ok(!otp.query.redirect_to.includes("returnTo"));
  f.state.authError = "Email not confirmed";
  await f.page
    .getByLabel("Password", { exact: true })
    .fill("FixturePassword123");
  await f.page.getByRole("button", { name: "Sign in (password)" }).click();
  await f.page.getByText("Please verify your email", { exact: true }).waitFor();
  f.state.authError = "";
  await f.page
    .getByRole("button", { name: "Resend verification email" })
    .click();
  await f.page
    .getByText("Verification email sent. Please check your inbox.")
    .waitFor();
  assert.equal(
    f.state.calls.filter((c) => c.path.endsWith("/resend")).at(-1).body.type,
    "signup",
  );
  f.state.authError = "Invalid login credentials";
  await f.page.getByRole("button", { name: "Sign in (password)" }).click();
  await f.page
    .getByRole("alert")
    .filter({ hasText: "Invalid login credentials" })
    .waitFor();
  f.state.authError = "";
  await f.page.getByRole("button", { name: "Sign in (password)" }).click();
  await f.page.waitForURL("**/customer/enquiries");
  assert.deepEqual(
    f.state.calls
      .filter(
        (c) => c.path.endsWith("/token") && c.query.grant_type === "password",
      )
      .at(-1).body,
    {
      email: "customer@example.test",
      password: "FixturePassword123",
      gotrue_meta_security: {},
    },
  );
  await f.page.getByRole("button", { name: "Open account menu" }).click();
  await f.page.getByRole("menuitem", { name: "Sign out" }).click();
  await f.page.waitForURL(base + "/");
  assert.equal(
    await f.page.evaluate(() => localStorage.getItem("sb-127-auth-token")),
    null,
  );
  f.state.role = "supplier";
  f.state.onboarding = "draft";
  await open(f, "/login", "Welcome back");
  await f.page
    .getByLabel("Email", { exact: true })
    .fill("supplier@example.test");
  await f.page
    .getByLabel("Password", { exact: true })
    .fill("FixturePassword123");
  await f.page.getByRole("button", { name: "Sign in (password)" }).click();
  await f.page.waitForURL("**/suppliers/onboarding");
  assert.equal(
    await f.page.getByText("Your enquiries", { exact: true }).count(),
    0,
  );
  await f.context.close();
  // Signup constraints + exact seven-field form -> six-field payload (confirm stays local).
  const sign = await fixture({ role: "supplier" });
  await open(sign, "/supplier/signup", "Join Eventwow as a supplier");
  assert.ok(
    await sign.page
      .getByRole("button", { name: "Create supplier account", exact: true })
      .isDisabled(),
  );
  for (const [label, value] of [
    ["Login email *", "supplier@example.test"],
    ["Business name *", "Fixture catering"],
    ["Location label", "Manchester"],
    ["Password *", "FixturePassword123"],
    ["Confirm password *", "FixturePassword123"],
    ["Phone", "01234567890"],
    ["Website URL", "https://example.test"],
  ])
    await sign.page.getByLabel(label, { exact: true }).fill(value);
  sign.state.apiError = "Already registered";
  await sign.page
    .getByRole("button", { name: "Create supplier account", exact: true })
    .click();
  await sign.page
    .getByRole("alert")
    .filter({ hasText: "already has an account" })
    .waitFor();
  sign.state.apiError = "";
  sign.state.onboarding = "approved";
  await sign.page
    .getByRole("button", { name: "Create supplier account", exact: true })
    .click();
  await sign.page.waitForURL("**/supplier/dashboard");
  assert.deepEqual(
    sign.state.calls
      .filter((c) => c.path === "/api/public/suppliers/signup")
      .at(-1).body,
    {
      email: "supplier@example.test",
      business_name: "Fixture catering",
      location_label: "Manchester",
      phone: "01234567890",
      website_url: "https://example.test",
      password: "FixturePassword123",
    },
  );
  await sign.context.close();
  const s = await fixture({ role: "supplier", signedIn: true });
  await open(s, "/suppliers/onboarding", "Complete your supplier profile");
  await s.page.getByRole("checkbox", { name: "Catering" }).check();
  await s.page.getByRole("button", { name: "Next", exact: true }).click();
  const short = "Seasonal event catering with thoughtful service.";
  const about = "Seasonal menus for parties and corporate events. ".repeat(4);
  await s.page.getByLabel("Short description", { exact: true }).fill(short);
  await s.page.getByLabel("About", { exact: true }).fill(about);
  await s.page.getByRole("button", { name: "Next", exact: true }).click();
  await s.page.getByLabel("Service area").fill("Manchester");
  await s.page
    .getByLabel("Website URL", { exact: true })
    .fill("https://example.test");
  await s.page
    .getByLabel("Instagram URL")
    .fill("https://instagram.com/example");
  s.state.apiError = "Save unavailable";
  await s.page
    .getByRole("button", { name: "Save progress", exact: true })
    .click();
  await s.page
    .getByRole("alert")
    .filter({ hasText: "Save unavailable" })
    .waitFor();
  assert.equal(
    await s.page.getByLabel("Service area").inputValue(),
    "Manchester",
  );
  s.state.apiError = "";
  await s.page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await s.page
    .getByRole("heading", { name: "Thanks, your listing is under review" })
    .waitFor();
  const saved = s.state.calls
    .filter((c) => c.path === "/api/suppliers/me/update")
    .at(-1);
  assert.match(saved.authorization, /^Bearer /);
  assert.deepEqual(saved.body, {
    categories: ["Catering"],
    short_description: short,
    about,
    location: "Manchester",
    website_url: "https://example.test",
    instagram_url: "https://instagram.com/example",
  });
  assert.equal(
    s.state.calls
      .filter((c) => c.path === "/api/suppliers/submit-for-review")
      .at(-1).body,
    null,
  );
  await s.context.close();
  const verify = await fixture({
    role: "supplier",
    signedIn: true,
    confirmed: false,
  });
  await open(verify, "/suppliers/verify", "Verify your email");
  await verify.page
    .getByRole("button", { name: "I've verified my email" })
    .click();
  await verify.page
    .getByRole("alert")
    .filter({ hasText: "Email is still unverified" })
    .waitFor();
  await Promise.all([
    verify.page.waitForResponse((r) => r.url().includes("/auth/v1/resend")),
    verify.page
      .getByRole("button", { name: "Resend verification email" })
      .click(),
  ]);
  assert.equal(
    verify.state.calls.filter((c) => c.path.endsWith("/resend")).at(-1).query
      .redirect_to,
    base + "/supplier/dashboard",
  );
  verify.state.confirmed = true;
  await verify.page
    .getByRole("button", { name: "I've verified my email" })
    .click();
  await verify.page.waitForURL("**/suppliers/onboarding");
  await verify.context.close();
  const claim = await fixture();
  await open(claim, "/venues/fixture-hall/claim", "Claim this venue");
  await claim.page
    .getByLabel("Your name", { exact: true })
    .fill("Fixture Owner");
  await claim.page
    .getByLabel("Your email", { exact: true })
    .fill("owner@example.test");
  await claim.page
    .getByLabel("Role at venue", { exact: true })
    .selectOption("manager");
  await claim.page.getByLabel("Context (optional)").fill("Venue manager.");
  await claim.page
    .getByRole("button", { name: "Submit claim request" })
    .click();
  await claim.page
    .getByRole("status")
    .filter({ hasText: "Check your email" })
    .waitFor();
  assert.deepEqual(
    claim.state.calls.find((c) => c.path.endsWith("/claim-request")).body,
    {
      requester_name: "Fixture Owner",
      requester_email: "owner@example.test",
      role_at_venue: "manager",
      message: "Venue manager.",
    },
  );
  await open(claim, "/claim/venue", "Venue claim status");
  await claim.page
    .getByRole("alert")
    .filter({ hasText: "Missing claim token." })
    .waitFor();
  claim.state.apiError = "Claim link is invalid or expired.";
  await claim.page.goto(base + "/claim/venue?token=expired");
  await claim.page
    .getByRole("alert")
    .filter({ hasText: "invalid or expired" })
    .waitFor();
  await claim.context.close();
  const recover = await fixture();
  await open(recover, "/forgot-password", "Reset your password");
  await recover.page.getByRole("button", { name: "Send reset link" }).click();
  await recover.page
    .getByRole("alert")
    .filter({ hasText: "Enter your email." })
    .waitFor();
  await recover.page
    .getByLabel("Email", { exact: true })
    .fill("customer@example.test");
  await recover.page.getByRole("button", { name: "Send reset link" }).click();
  await recover.page
    .getByRole("status")
    .filter({ hasText: "Check your email" })
    .waitFor();
  assert.equal(
    recover.state.calls.find((c) => c.path.endsWith("/recover")).query
      .redirect_to,
    base + "/reset-password",
  );
  await open(
    recover,
    "/reset-password?token_hash=recovery-token&type=recovery",
    "Set your new password",
  );
  await recover.page
    .getByLabel("New password", { exact: true })
    .fill("FixturePassword123");
  await recover.page
    .getByLabel("Confirm password", { exact: true })
    .fill("DifferentPassword123");
  await recover.page.getByRole("button", { name: "Update password" }).click();
  await recover.page
    .getByRole("alert")
    .filter({ hasText: "Passwords do not match" })
    .waitFor();
  await recover.page
    .getByLabel("Confirm password", { exact: true })
    .fill("FixturePassword123");
  await recover.page.getByRole("button", { name: "Update password" }).click();
  await recover.page
    .getByRole("status")
    .filter({ hasText: "Password updated successfully" })
    .waitFor();
  assert.deepEqual(
    recover.state.calls.find((c) => c.path.endsWith("/verify")).body,
    {
      type: "recovery",
      token_hash: "recovery-token",
      gotrue_meta_security: {},
    },
  );
  assert.equal(
    recover.state.calls.find(
      (c) => c.path.endsWith("/user") && c.method === "PUT",
    ).body.password,
    "FixturePassword123",
  );
  await recover.context.close();
  // Callback/login allowed role destinations and safe fallback for cross-role/external paths.
  for (const role of ["customer", "supplier", "venue_owner", "admin"]) {
    const prefix = {
      customer: "/customer",
      supplier: "/supplier/dashboard",
      venue_owner: "/venue",
      admin: "/admin/dashboard",
    }[role];
    for (const entry of ["/login?returnTo=", "/auth/callback?returnTo="]) {
      const r = await fixture({ role, signedIn: true, onboarding: "approved" });
      await r.page.goto(
        base + entry + encodeURIComponent(prefix + "?fixture=return"),
      );
      await r.page.waitForURL(base + prefix + "?fixture=return");
      await r.context.close();
      const x = await fixture({ role, signedIn: true, onboarding: "approved" });
      await x.page.goto(
        base + entry + encodeURIComponent("https://untrusted.example/path"),
      );
      await x.page.waitForURL(base + prefix);
      await x.context.close();
    }
  }
  const pkce = await fixture();
  await pkce.page.goto(
    base + "/auth/callback?code=fixture-code&returnTo=%2Fcustomer%2Fenquiries",
  );
  await pkce.page.waitForURL("**/customer/enquiries");
  assert.ok(
    pkce.state.calls.some(
      (c) =>
        c.query.grant_type === "pkce" && c.body.auth_code === "fixture-code",
    ),
  );
  await pkce.context.close();
  const anon = await fixture();
  for (const [path, expected] of [
    ["/suppliers/onboarding", "/login?returnTo=%2Fsuppliers%2Fonboarding"],
    ["/supplier/login?returnTo=%2Fsupplier%2Fmessages", "/login"],
    ["/update-password?token_hash=old", "/reset-password"],
    ["/auth/reset?token_hash=old", "/reset-password"],
  ]) {
    await anon.page.goto(base + path);
    await anon.page.waitForURL(base + expected);
  }
  await anon.context.close();

  // Error/loading/disabled/empty states plus keyboard and legacy verification recovery.
  for (const width of [360, 768, 1024, 1440]) {
    const e = await fixture();
    await e.page.setViewportSize({ width, height: 1000 });
    await open(e, "/login", "Welcome back");
    await e.page.getByLabel("Email", { exact: true }).focus();
    await e.page.keyboard.press("Tab");
    assert.equal(
      await e.page.evaluate(() => document.activeElement.id),
      "login-password",
    );
    await e.page
      .getByLabel("Email", { exact: true })
      .fill("customer@example.test");
    e.state.authError = "Too many requests. Please try again later.";
    await e.page
      .getByRole("button", { name: "Send magic link", exact: true })
      .click();
    await e.page.getByRole("alert").waitFor();
    await inspect(e, "login-error", width);
    e.state.authError = "";
    e.state.delay = 800;
    await e.page
      .getByRole("button", { name: "Send magic link", exact: true })
      .click();
    assert.ok(
      await e.page
        .getByRole("button", { name: "Sending magic link..." })
        .isDisabled(),
    );
    await e.page
      .getByRole("status")
      .filter({ hasText: "Magic link sent" })
      .waitFor();
    await inspect(e, "magic-sent", width);
    e.state.authError = "Recovery link expired";
    e.state.delay = 0;
    await open(
      e,
      "/reset-password?token_hash=expired&type=recovery",
      "Set your new password",
    );
    await e.page
      .getByRole("alert")
      .filter({ hasText: "Recovery link expired" })
      .waitFor();
    assert.equal(
      await e.page.getByRole("button", { name: "Update password" }).count(),
      0,
    );
    await inspect(e, "recovery-expired", width);
    e.state.authError = "";
    e.state.apiError = "Claim link is invalid or expired.";
    await open(e, "/claim/venue?token=expired", "Venue claim status");
    await e.page.getByRole("alert").waitFor();
    await inspect(e, "claim-expired", width);
    await e.context.close();
    const s = await fixture({ signedIn: true, role: "supplier" });
    await s.page.setViewportSize({ width, height: 1000 });
    s.state.categoriesEmpty = true;
    await open(s, "/suppliers/onboarding", "Complete your supplier profile");
    await s.page
      .getByText("No categories available. Please try again later.")
      .waitFor();
    await inspect(s, "onboarding-empty", width);
    s.state.apiError = "Onboarding unavailable";
    await s.page.reload();
    await s.page.getByRole("alert").waitFor();
    await inspect(s, "onboarding-error", width);
    await s.context.close();
    const denied = await fixture({ signedIn: true, role: "none" });
    await denied.page.setViewportSize({ width, height: 1000 });
    await open(denied, "/login", "Access denied");
    await inspect(denied, "access-denied", width);
    await denied.context.close();
  }
  const restore = await fixture({ signedIn: true, role: "supplier" });
  const stored = {
    business_name: "Legacy fixture business",
    location_label: "Manchester",
  };
  await restore.context.addInitScript(
    (value) =>
      localStorage.setItem("supplier_join_basics_v1", JSON.stringify(value)),
    stored,
  );
  await restore.page.goto(base + "/suppliers/verify");
  await restore.page.waitForURL("**/suppliers/onboarding");
  assert.deepEqual(
    restore.state.calls.find((c) => c.path === "/api/suppliers/create-draft")
      .body,
    stored,
  );
  assert.equal(
    await restore.page.evaluate(() =>
      localStorage.getItem("supplier_join_basics_v1"),
    ),
    null,
  );
  await restore.context.close();
  const magic = await fixture({ role: "venue_owner" });
  const session = magic.session();
  await magic.page.goto(
    base +
      "/auth/callback?returnTo=%2Fvenue#" +
      new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: "3600",
        token_type: "bearer",
        type: "magiclink",
      }),
  );
  await magic.page.waitForURL(base + "/venue");
  await magic.context.close();
  const failed = await fixture();
  failed.state.authError = "Code expired";
  await open(failed, "/auth/callback?code=expired", "Signing you in");
  await failed.page
    .getByRole("alert")
    .filter({ hasText: "Code expired" })
    .waitFor();
  assert.equal(
    await failed.page.evaluate(() => localStorage.getItem("sb-127-auth-token")),
    null,
  );
  await failed.context.close();
  await writeFile(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        auth: "Installed Supabase JS with isolated Auth/PostgREST transport; no live identity provider",
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS auth: ${results.length} responsive/accessibility snapshots; password/OTP/signup/recovery/verification/claim/return and logout-role-transition contracts`,
  );
} finally {
  await browser.close();
}
