/* global process, console, Buffer, URL, localStorage, sessionStorage */
// Real pages + real API handlers, sharing the isolated transport used by handler tests.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { workflowBackend, invoke, uid } from "./fixtures/workflow-backend.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output =
  process.env.WORKFLOW_SCREENSHOTS || "/tmp/eventwow-connected-workflow";
await mkdir(output, { recursive: true });
const db = workflowBackend(),
  restore = db.install(),
  browser = await chromium.launch();
const calls = [],
  errors = [],
  unexpected = [];
const routes = {
  "/api/public/enquiries": "public/enquiries.js",
  "/api/public-enquiry": "public-enquiry.js",
  "/api/public-enquiry-quotes": "public-enquiry-quotes.js",
  "/api/supplier-credits": "supplier-credits.js",
  "/api/supplier-enquiries": "supplier-enquiries.js",
  "/api/supplier-start-quote-from-enquiry":
    "supplier-start-quote-from-enquiry.js",
  "/api/supplier-save-draft-quote": "supplier-save-draft-quote.js",
  "/api/supplier-send-quote": "supplier-send-quote.js",
  "/api/supplier-get-public-link": "supplier-get-public-link.js",
  "/api/supplier/quotes": "supplier/quotes.js",
  "/api/customer/enquiries": "customer/enquiries/index.js",
  "/api/customer/threads/get-or-create": "customer/threads/get-or-create.js",
  "/api/public-quote-accept": "public-quote-accept.js",
  "/api/public-quote-decline": "public-quote-decline.js",
  "/api/supplier-get-thread": "supplier-get-thread.js",
  "/api/supplier-threads": "supplier-threads.js",
  "/api/supplier-thread": "supplier-thread.js",
  "/api/supplier-send-message": "supplier-send-message.js",
  "/api/supplier-notifications": "supplier-notifications.js",
  "/api/supplier-notifications-mark-read":
    "supplier-notifications-mark-read.js",
};
async function context(role) {
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    user = db.users[role];
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
  await ctx.addInitScript(
    ({ user, token }) => {
      // Seed once per tab so logout/reload behaviour remains observable.
      if (!sessionStorage.getItem("workflow-seeded")) {
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: token,
            refresh_token: "fixture-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
        );
        sessionStorage.setItem("workflow-seeded", "1");
      }
    },
    { user, token },
  );
  await ctx.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.port === "54321") {
      if (url.pathname.includes("/auth/v1/logout")) return reply({});
      if (url.pathname.includes("/auth/v1/token"))
        return reply({
          access_token: token,
          refresh_token: "fixture-refreshed",
          token_type: "bearer",
          expires_in: 3600,
          user,
        });
      if (url.pathname.includes("/auth/")) return reply({ user });
      const response = await db.fetch(
        `http://workflow.invalid${url.pathname}${url.search}`,
        { method: req.method(), headers: req.headers(), body: req.postData() },
      );
      return route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    }
    if (!url.pathname.startsWith("/api/"))
      return url.origin === base ? route.continue() : route.abort();
    const query = Object.fromEntries(url.searchParams);
    let file = routes[url.pathname];
    let match = url.pathname.match(
      /^\/api\/customer\/enquiries\/([^/]+)(\/messaging-targets)?$/,
    );
    if (match) {
      query.id = match[1];
      file = `customer/enquiries/[id]${match[2] ? "/messaging-targets" : ""}.js`;
    }
    match = url.pathname.match(/^\/api\/customer\/threads\/([^/]+)\/messages$/);
    if (match) {
      query.threadId = match[1];
      file = "customer/threads/[threadId]/messages.js";
    }
    match = url.pathname.match(/^\/api\/supplier\/enquiries\/([^/]+)$/);
    if (match) {
      query.id = match[1];
      file = "supplier/enquiries/[id].js";
    }
    // Public catalog chrome is not part of the workflow API under test.
    if (
      [
        "/api/public-categories",
        "/api/public/categories",
        "/api/public-venues",
      ].includes(url.pathname)
    )
      return reply({ categories: [], venues: [], rows: [] });
    if (!file) {
      unexpected.push(url.pathname);
      return reply({ error: `Unmodelled API ${url.pathname}` }, 501);
    }
    const handler = (await import(new URL(`../api/${file}`, import.meta.url)))
      .default;
    const body = req.postDataJSON() || {};
    calls.push({ role, path: url.pathname, method: req.method(), body });
    const result = await invoke(handler, {
      role: url.pathname.startsWith("/api/public-quote-") ? null : role,
      method: req.method(),
      query,
      body,
    });
    return reply(result.data, result.status);
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(12000);
  return { ctx, page };
}
try {
  const c = await context("customer"),
    s = await context("supplier");
  await c.page.goto(`${base}/request`);
  await c.page.getByPlaceholder("Your name *").fill("Fixture Customer");
  await c.page
    .getByPlaceholder("Email *", { exact: true })
    .fill(db.users.customer.email);
  await c.page
    .locator("select")
    .filter({ has: c.page.locator('option[value="corporate"]') })
    .selectOption("corporate");
  await c.page.getByLabel("Date", { exact: true }).fill("2026-12-12");
  await c.page.getByLabel("Time", { exact: true }).fill("18:00");
  await c.page.getByPlaceholder("Guest count", { exact: true }).fill("80");
  await c.page
    .getByPlaceholder("Venue name", { exact: true })
    .fill("Manchester");
  await c.page.getByLabel("Budget amount").fill("1200");
  await c.page
    .locator("textarea")
    .last()
    .fill(
      "We are organising a community celebration with seasonal catering for eighty guests. Please include setup, vegetarian options and serving staff for the evening.",
    );
  await c.page.getByRole("button", { name: /Send request/i }).click();
  await c.page.waitForURL("**/enquiry/**");
  assert.equal(db.tables.enquiries.length, 1);
  const id = db.tables.enquiries[0].id;
  assert.equal(db.tables.enquiry_suppliers.length, 2);
  await s.page.goto(`${base}/supplier/enquiries`);
  await s.page
    .getByRole("button", { name: "Fixture Customer", exact: true })
    .click();
  await s.page.getByRole("dialog").waitFor();
  await s.page.keyboard.press("Escape");
  await s.page
    .getByRole("button", { name: "Create quote", exact: true })
    .click();
  await s.page
    .getByRole("heading", { name: "Quote detail", exact: true })
    .waitFor();
  await c.page.goto(`${base}/customer/enquiries/${id}`);
  await c.page.getByText("No quotes received yet", { exact: true }).waitFor();
  await s.page.getByRole("button", { name: /Add item/i }).click();
  await s.page.getByLabel("Title", { exact: true }).fill("Seasonal catering");
  await s.page.getByLabel("Qty", { exact: true }).fill("80");
  await s.page.getByLabel(/Unit price/i).fill("12.5");
  await s.page
    .getByRole("button", { name: /Save draft|Save changes/i })
    .click();
  await s.page.getByText("Saved", { exact: true }).waitFor();
  await s.page
    .getByRole("button", { name: "Send quote (uses 1 credit)", exact: true })
    .click();
  await s.page.getByText("Quote sent.", { exact: true }).waitFor();
  assert.ok(db.tables.quotes[0].id);
  await c.page.reload();
  const accept = c.page.getByRole("button", {
    name: "Accept quote from Fixture supplier",
    exact: true,
  });
  await accept.waitFor();
  assert.equal(
    await accept.isDisabled(),
    false,
    "Send must provide decisions without reopening Supplier quote",
  );
  await accept.click();
  await c.page.getByText("accepted", { exact: true }).waitFor();
  assert.equal(db.tables.supplier_bookings[0].status, "confirmed");
  await s.page.reload();
  await s.page
    .locator(".ew-status")
    .filter({ hasText: /^accepted$/i })
    .waitFor();
  await c.page
    .getByRole("button", {
      name: /Message supplier.*Fixture supplier/,
      exact: true,
    })
    .click();
  await c.page
    .getByRole("dialog")
    .getByLabel("Message body")
    .fill("Please arrive at 17:00.");
  await c.page
    .getByRole("dialog")
    .getByRole("button", { name: "Send", exact: true })
    .click();
  await c.page
    .getByRole("dialog")
    .getByText("Please arrive at 17:00.", { exact: true })
    .waitFor();
  const threadId = db.tables.message_threads[0].id;
  await s.page.goto(`${base}/supplier/messages?thread=${threadId}`);
  await s.page
    .getByRole("log")
    .getByText("Please arrive at 17:00.", { exact: true })
    .waitFor();
  const initialMessageReads = calls.filter(
    (r) => r.path === "/api/supplier-thread",
  ).length;
  assert.ok(
    initialMessageReads <= 4,
    "Initial thread effect must not be duplicated by the thread-list loader (including StrictMode/auth remounts)",
  );
  await s.page.getByLabel("Message", { exact: true }).fill("We will be there.");
  await s.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await s.page
    .getByRole("log")
    .getByText("We will be there.", { exact: true })
    .waitFor();
  await c.page.keyboard.press("Escape");
  await c.page
    .getByRole("button", {
      name: /Message supplier.*Fixture supplier/,
      exact: true,
    })
    .click();
  await c.page
    .getByRole("log")
    .getByText("We will be there.", { exact: true })
    .waitFor();
  await c.page.screenshot({ path: `${output}/customer-conversation.png` });
  await s.page.screenshot({ path: `${output}/supplier-conversation.png` });
  // Delay a different conversation's response, then switch back. A stale response
  // must never put another thread's history under the current participant header.
  const secondThreadId = uid(),
    secondQuoteId = uid();
  db.tables.quotes.push({ ...db.tables.quotes[0], id: secondQuoteId });
  db.tables.message_threads.push({
    ...db.tables.message_threads[0],
    id: secondThreadId,
    quote_id: secondQuoteId,
  });
  db.tables.messages.push({
    id: uid(),
    thread_id: secondThreadId,
    body: "Alternate conversation fixture.",
    sender_type: "customer",
    created_at: new Date().toISOString(),
  });
  await s.page.getByRole("button", { name: "Refresh", exact: true }).click();
  await s.page
    .locator(".ew-thread-choice")
    .filter({ hasText: "Alternate conversation fixture." })
    .waitFor();
  let releaseDelayed, startedDelayed;
  const delayed = new Promise((resolve) => {
    releaseDelayed = resolve;
  });
  const started = new Promise((resolve) => {
    startedDelayed = resolve;
  });
  const delayedRoute = `**/api/supplier-thread?threadId=${secondThreadId}`;
  await s.page.route(delayedRoute, async (route) => {
    startedDelayed();
    await delayed;
    await route.fallback();
  });
  await s.page
    .locator(".ew-thread-choice")
    .filter({ hasText: "Alternate conversation fixture." })
    .click();
  await started;
  await s.page
    .locator(".ew-thread-choice")
    .filter({ hasText: "We will be there." })
    .click();
  await s.page
    .getByRole("log")
    .getByText("We will be there.", { exact: true })
    .waitFor();
  const response = s.page.waitForResponse((r) =>
    r.url().includes(`/api/supplier-thread?threadId=${secondThreadId}`),
  );
  releaseDelayed();
  await response;
  await s.page.waitForTimeout(150);
  assert.equal(
    await s.page
      .getByRole("log")
      .getByText("Alternate conversation fixture.", { exact: true })
      .count(),
    0,
  );
  await s.page
    .getByRole("log")
    .getByText("We will be there.", { exact: true })
    .waitFor();
  await s.page.unroute(delayedRoute);
  await s.page.goto(`${base}/supplier/notifications`);
  await s.page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await s.page.getByText("Marked as read.", { exact: true }).waitFor();
  assert.equal(
    db.tables.notifications.filter(
      (n) => n.supplier_id === db.tables.suppliers[0].id && !n.read_at,
    ).length,
    0,
  );
  await s.page.screenshot({
    path: `${output}/notification-count-after-read.png`,
  });
  const customerRequests = calls.filter((r) => r.role === "customer");
  await s.page
    .getByRole("button", { name: "Open notifications", exact: true })
    .waitFor();
  const topbarAfterRead = await s.page
    .getByRole("button", { name: /Open notifications/ })
    .getAttribute("aria-label");
  assert.equal(
    topbarAfterRead,
    "Open notifications",
    "Inbox and topbar count must agree without reload",
  );
  await s.page
    .getByRole("button", { name: "Open notifications", exact: true })
    .waitFor();
  const refreshed = await c.page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const { data, error } = await supabase.auth.refreshSession();
    return { userId: data.session?.user?.id, error: error?.message || null };
  });
  assert.deepEqual(refreshed, { userId: db.users.customer.id, error: null });
  await c.page.keyboard.press("Escape");
  await c.page.getByRole("button", { name: "Open account menu" }).click();
  await c.page.getByRole("menuitem", { name: "Sign out" }).click();
  await c.page.waitForURL(`${base}/`);
  assert.equal(
    await c.page.evaluate(() => localStorage.getItem("sb-127-auth-token")),
    null,
  );
  const callsBeforeGuard = calls.filter((r) =>
    r.path.startsWith("/api/customer/"),
  ).length;
  await c.page.goto(`${base}/customer/enquiries/${id}`);
  await c.page.waitForURL("**/login**");
  assert.equal(
    calls.filter((r) => r.path.startsWith("/api/customer/")).length,
    callsBeforeGuard,
  );
  const messageReads = calls.filter(
    (r) => r.path === "/api/supplier-thread",
  ).length;
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(db.blocked, []);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        passed: true,
        scope:
          "Real pages and API handlers; Auth/PostgREST/RPC transport simulated",
        calls,
        customerRequestCount: customerRequests.length,
        supplierInitialThreadReads: initialMessageReads,
        supplierTotalThreadReads: messageReads,
        staleThreadResponseIgnored: true,
        topbarAfterRead: topbarAfterRead,
        simulatedSessionRefreshAndLogout: "passed; live Auth not exercised",
        errors,
        unexpected,
      },
      null,
      2,
    ),
  );
  console.log(
    `Connected browser workflow passed (${calls.length} API calls; Supplier initial thread reads: ${initialMessageReads}).`,
  );
} catch (error) {
  for (const ctx of browser.contexts())
    for (const page of ctx.pages()) {
      console.error(
        "At:",
        page.url(),
        "\n",
        (await page.locator("body").innerText()).slice(-6500),
      );
    }
  console.error("Unexpected endpoints:", unexpected);
  throw error;
} finally {
  await browser.close();
  restore();
}
