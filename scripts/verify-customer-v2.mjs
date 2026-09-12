/* global process, console, setTimeout */
// Browser-local fixtures intercept all API/Supabase traffic. No live quote decisions or messages.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.CUSTOMER_SCREENSHOTS || "/tmp/eventwow-customer-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const enquiryId = "11111111-1111-4111-8111-111111111111";
const supplierId = "22222222-2222-4222-8222-222222222222";
const quoteId = "33333333-3333-4333-8333-333333333333";
const threadId = "44444444-4444-4444-8444-444444444444";
const enquiry = {
  id: enquiryId,
  status: "quoted",
  eventDate: "2026-12-12",
  startTime: "18:00",
  guestCount: 80,
  venueName: "Example Assembly Rooms",
  message: "A community celebration with seasonal food and live music.",
  categorySlug: "catering",
};
const quote = {
  id: quoteId,
  quoteToken: "fixture-quote-token",
  supplierId,
  supplierName: "Example Event Catering",
  status: "sent",
  reacceptRequired: false,
  totalAmount: 500,
  currencyCode: "GBP",
  quoteText: "Seasonal menu and setup included.",
  items: [{ id: "item-1", title: "Event catering", qty: 2, unitPrice: 250 }],
};
const detail = {
  ok: true,
  enquiry,
  invites: [
    {
      id: "invite-1",
      supplierId,
      supplierName: quote.supplierName,
      status: "quoted",
    },
  ],
  quotes: [
    quote,
    {
      ...quote,
      id: "quote-2",
      supplierName: "Example Live Music",
      quoteToken: "fixture-second-token",
      totalAmount: 350,
      quoteText: "Two live sets with a short interval.",
      items: [
        { id: "item-2", title: "Live performance", qty: 1, unitPrice: 350 },
      ],
    },
  ],
};
const initialMessages = [
  {
    id: "message-1",
    senderType: "supplier",
    body: "Can you confirm the setup time?",
    createdAt: "2026-09-10T10:00:00Z",
  },
  {
    id: "message-2",
    senderType: "customer",
    body: "The venue opens at 17:00.",
    createdAt: "2026-09-10T10:05:00Z",
  },
];
async function fixture(options = {}) {
  const f = await common({ role: "customer", ...options });
  f.mode.data = structuredClone(detail);
  f.mode.messages = structuredClone(initialMessages);
  const respond = async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    f.requests.push({
      url: req.url(),
      method: req.method(),
      body: req.postData(),
      authorization: req.headers().authorization,
    });
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (f.mode.delay) await new Promise((r) => setTimeout(r, f.mode.delay));
    if (f.mode.state === "error")
      return reply({ error: "Fixture customer service unavailable" }, 503);
    if (url.pathname === "/api/customer/enquiries")
      return reply({
        ok: true,
        rows:
          f.mode.state === "empty"
            ? []
            : [
                enquiry,
                {
                  ...enquiry,
                  id: "enquiry-2",
                  venueName: "Example Riverside Hall",
                  eventDate: "2026-12-18",
                  guestCount: null,
                  status: "new",
                },
              ],
      });
    if (url.pathname.endsWith("/messaging-targets")) {
      if (f.mode.failTargets)
        return reply({ error: "Messaging suppliers unavailable" }, 503);
      if (f.mode.targetDelay)
        await new Promise((r) => setTimeout(r, f.mode.targetDelay));
      return reply({
        ok: true,
        rows: f.mode.noTargets
          ? []
          : [
              {
                supplier_id: supplierId,
                supplier_name: quote.supplierName,
                quote_id: quoteId,
                thread_id: null,
              },
            ],
      });
    }
    if (url.pathname.startsWith("/api/customer/enquiries/")) {
      if (f.mode.failDetail)
        return reply({ error: "Enquiry refresh unavailable" }, 503);
      return reply(
        f.mode.state === "empty" ? { ok: true, enquiry: null } : f.mode.data,
      );
    }
    if (url.pathname.startsWith("/api/public-quote-")) {
      if (f.mode.failDecision)
        return reply(
          { details: "Quote changed; review the latest version." },
          409,
        );
      const chosen = f.mode.data.quotes.find(
        (q) => q.quoteToken === req.postDataJSON().token,
      );
      chosen.status = url.pathname.endsWith("accept") ? "accepted" : "declined";
      chosen.reacceptRequired = false;
      return reply({ ok: true });
    }
    if (url.pathname === "/api/customer/threads/get-or-create") {
      if (f.mode.noQuote)
        return reply(
          { details: "A message thread starts once a quote exists." },
          409,
        );
      if (f.mode.noThread) return reply({ ok: true });
      return reply({ ok: true, thread_id: threadId, quote_id: quoteId });
    }
    if (url.pathname.endsWith("/messages") && req.method() === "GET") {
      if (f.mode.failHistory)
        return reply({ error: "Message history unavailable" }, 503);
      return reply({
        ok: true,
        thread: { id: threadId },
        messages: f.mode.messages,
      });
    }
    if (url.pathname.endsWith("/messages") && req.method() === "POST") {
      if (f.mode.failSend)
        return reply({ error: "Message could not be sent" }, 503);
      if (req.postDataJSON().body.length > 2000)
        return reply(
          { details: "Message body must be between 2 and 2000 chars" },
          400,
        );
      const message = {
        id: "new-message",
        senderType: "customer",
        body: req.postDataJSON().body,
        createdAt: "2026-09-10T10:10:00Z",
      };
      f.mode.messages.push(message);
      return reply({ ok: true, message });
    }
    throw new Error("Unexpected customer fixture request: " + req.url());
  };
  await f.context.route("**/api/customer/**", respond);
  await f.context.route("**/api/public-quote-*", respond);
  return f;
}
const results = [];
async function audit(page, label) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    label + " overflow",
  );
  await page.evaluate(axe);
  const violations = await page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  );
  assert.deepEqual(violations, [], label + " accessibility");
}
async function capture(f, label) {
  for (const width of [360, 768, 1024, 1440]) {
    await f.page.setViewportSize({ width, height: 1000 });
    await f.page.evaluate(() => window.scrollTo(0, 0));
    await audit(f.page, label + width);
    await f.page.screenshot({
      path: `${output}/${label}-${width}.png`,
      fullPage: !(await f.page.getByRole("dialog").count()),
    });
  }
  assert.deepEqual(f.errors, []);
  results.push(`${label}: 360/768/1024/1440px, overflow and axe passed`);
}
async function openDetail(f) {
  await f.page.goto(base + "/customer/enquiries/" + enquiryId);
  await f.page
    .getByRole("heading", { name: "Your event", exact: true })
    .waitFor();
}
async function openMessages(f) {
  await f.page
    .getByRole("button", { name: /Message supplier.*Example Event Catering/ })
    .click();
  await f.page.getByRole("dialog").waitFor();
  await f.page
    .getByRole("textbox", { name: "Message body", exact: true })
    .waitFor();
}
try {
  const f = await fixture();
  const chunks = [];
  f.page.on("request", (req) => chunks.push(req.url()));
  await f.page.goto(base + "/customer");
  await f.page
    .getByRole("heading", { name: "Welcome back", exact: true })
    .waitFor();
  await capture(f, "dashboard");
  assert.equal(
    f.requests.filter((r) => r.url.includes("/api/customer/")).length,
    0,
    "Dashboard adds no fetches",
  );
  assert.equal(
    await f.page
      .getByRole("link", { name: "Create new enquiry", exact: true })
      .getAttribute("href"),
    "/request",
  );
  await f.page
    .getByRole("link", { name: "View my enquiries", exact: true })
    .click();
  await f.page
    .getByRole("link", { name: /View enquiry for Example Assembly Rooms/ })
    .waitFor();
  await capture(f, "enquiries");
  assert.equal(
    await f.page
      .getByRole("link", { name: "New enquiry", exact: true })
      .getAttribute("href"),
    "/request",
  );
  const requests = f.requests.length;
  await f.page
    .getByRole("textbox", { name: "Search venue, date or status" })
    .fill("Riverside");
  assert.equal(
    await f.page.getByRole("link", { name: /View enquiry/ }).count(),
    1,
  );
  await f.page
    .getByRole("textbox", { name: "Search venue, date or status" })
    .fill("not a fixture");
  await f.page
    .getByRole("heading", { name: "No matching enquiries" })
    .waitFor();
  assert.equal(f.requests.length, requests, "Search adds no API calls");
  await f.page
    .getByRole("textbox", { name: "Search venue, date or status" })
    .fill("");
  const view = f.page.getByRole("link", {
    name: /View enquiry for Example Assembly Rooms/,
  });
  await view.focus();
  await f.page.keyboard.press("Enter");
  await f.page
    .getByRole("heading", { name: "Your event", exact: true })
    .waitFor();
  await capture(f, "detail");
  assert.equal(
    await f.page
      .getByRole("link", { name: "Create another enquiry", exact: true })
      .getAttribute("href"),
    "/request",
  );
  assert.ok(
    !chunks.some((u) =>
      /src\/(admin|supplier|venue)|src\/pages\/(admin|supplier|venue)|BookingsCalendar/.test(
        u,
      ),
    ),
    "Customer routes defer other roles",
  );
  assert.ok(
    f.requests
      .filter((r) => r.url.includes("/api/customer/"))
      .every((r) => r.authorization?.startsWith("Bearer ")),
  );
  f.mode.delay = 500;
  await f.page
    .getByRole("button", {
      name: "Accept quote from Example Event Catering",
      exact: true,
    })
    .click();
  assert.ok(
    await f.page
      .getByRole("button", {
        name: "Decline quote from Example Live Music",
        exact: true,
      })
      .isDisabled(),
  );
  await f.page.getByText("accepted", { exact: true }).waitFor();
  f.mode.delay = 0;
  const accept = f.requests.find((r) =>
    r.url.endsWith("/api/public-quote-accept"),
  );
  assert.deepEqual(JSON.parse(accept.body), { token: "fixture-quote-token" });
  assert.equal(accept.authorization, undefined);
  assert.ok(
    await f.page
      .getByRole("button", {
        name: "Accept quote from Example Event Catering",
        exact: true,
      })
      .isDisabled(),
  );
  await f.page
    .getByRole("button", {
      name: "Decline quote from Example Live Music",
      exact: true,
    })
    .click();
  await f.page.getByText("declined", { exact: true }).waitFor();
  assert.deepEqual(
    JSON.parse(
      f.requests.find((r) => r.url.endsWith("/api/public-quote-decline")).body,
    ),
    { token: "fixture-second-token" },
  );
  await f.context.close();
  results.push(
    "Dashboard/navigation uses original request routes; local search adds no fetch; quote accept/decline exact token payloads, no new bearer contract, refresh and global busy/terminal disabling passed",
  );

  const reaccept = await fixture();
  reaccept.mode.data.quotes[0].reacceptRequired = true;
  reaccept.mode.data.quotes[1].quoteToken = null;
  await openDetail(reaccept);
  await capture(reaccept, "reaccept");
  assert.ok(
    await reaccept.page
      .getByRole("button", { name: "Accept quote from Example Live Music" })
      .isDisabled(),
  );
  reaccept.mode.failDecision = true;
  await reaccept.page
    .getByRole("button", { name: "Accept quote from Example Event Catering" })
    .click();
  await reaccept.page
    .getByRole("alert")
    .filter({ hasText: "Quote changed" })
    .waitFor();
  assert.ok(
    await reaccept.page
      .getByRole("heading", { name: "Your event", exact: true })
      .isVisible(),
  );
  await audit(reaccept.page, "Quote failure retains enquiry");
  reaccept.mode.failDecision = false;
  await reaccept.page
    .getByRole("button", { name: "Accept quote from Example Event Catering" })
    .click();
  await reaccept.page.getByText("accepted", { exact: true }).waitFor();
  assert.equal(
    await reaccept.page
      .getByText("Updated - awaiting acceptance", { exact: true })
      .count(),
    0,
  );
  await reaccept.context.close();

  const messages = await fixture();
  await openDetail(messages);
  const opener = messages.page.getByRole("button", {
    name: /Message supplier.*Example Event Catering/,
  });
  await opener.focus();
  await messages.page.keyboard.press("Enter");
  await messages.page.getByRole("log").waitFor();
  await capture(messages, "messages");
  const dialog = messages.page.getByRole("dialog");
  for (let i = 0; i < 12; i++) {
    await messages.page.keyboard.press("Tab");
    assert.ok(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    );
  }
  const create = messages.requests.find((r) =>
    r.url.endsWith("/api/customer/threads/get-or-create"),
  );
  assert.deepEqual(JSON.parse(create.body), {
    enquiry_id: enquiryId,
    supplier_id: supplierId,
    quote_id: quoteId,
  });
  assert.ok(
    messages.requests.some((r) =>
      r.url.endsWith(`/api/customer/threads/${threadId}/messages?limit=50`),
    ),
  );
  const body = messages.page.getByRole("textbox", {
    name: "Message body",
    exact: true,
  });
  const send = messages.page.getByRole("button", { name: "Send", exact: true });
  for (const text of ["", " ", "x"]) {
    await body.fill(text);
    assert.ok(await send.isDisabled());
  }
  await body.fill("  Please confirm the arrival time.  ");
  messages.mode.failSend = true;
  await send.click();
  await messages.page
    .getByRole("alert")
    .filter({ hasText: "Message could not be sent" })
    .waitFor();
  assert.equal(await body.inputValue(), "  Please confirm the arrival time.  ");
  messages.mode.failSend = false;
  messages.mode.delay = 500;
  const getCount = messages.requests.filter((r) => r.method === "GET").length;
  await send.click();
  assert.ok(await body.isDisabled());
  assert.ok(
    await messages.page
      .getByRole("button", { name: "Sending...", exact: true })
      .isDisabled(),
  );
  await messages.page
    .getByRole("log")
    .getByText("Please confirm the arrival time.", { exact: true })
    .waitFor();
  assert.equal(await body.inputValue(), "");
  assert.equal(
    messages.requests.filter((r) => r.method === "GET").length,
    getCount,
    "Successful send appends without refetch",
  );
  assert.deepEqual(
    JSON.parse(
      messages.requests
        .filter(
          (r) =>
            r.url.endsWith(`/api/customer/threads/${threadId}/messages`) &&
            r.method === "POST",
        )
        .at(-1).body,
    ),
    { body: "Please confirm the arrival time." },
  );
  messages.mode.delay = 0;
  await body.fill("a".repeat(2001));
  await send.click();
  await messages.page
    .getByRole("alert")
    .filter({ hasText: "between 2 and 2000" })
    .waitFor();
  assert.equal(
    (await body.inputValue()).length,
    2001,
    "Server maximum validation remains intact",
  );
  await messages.page.keyboard.press("Escape");
  assert.ok(await opener.evaluate((el) => el === document.activeElement));
  assert.deepEqual(messages.errors, []);
  await messages.context.close();
  results.push(
    "Reacceptance, missing-token disabling and decision errors retain detail; messaging exact get-or-create/limit=50/trimmed-body contracts, min/server-max validation, busy controls, failed-send draft retention, local append, Radix Tab/Escape/focus restoration passed",
  );

  for (const state of ["empty", "loading", "error"]) {
    for (const kind of ["enquiries", "detail"]) {
      const f = await fixture();
      f.mode.state = state;
      if (state === "loading") f.mode.delay = 20000;
      await f.page.goto(
        base +
          (kind === "detail"
            ? `/customer/enquiries/${enquiryId}`
            : "/customer/enquiries"),
      );
      if (state === "loading")
        await f.page.locator('main [role="status"]').first().waitFor();
      else if (state === "error" || kind === "detail")
        await f.page.getByRole("alert").waitFor();
      else
        await f.page
          .getByRole("heading", { name: "No enquiries yet", exact: true })
          .waitFor();
      await capture(f, `${kind}-${state}`);
      if (state === "error") {
        f.mode.state = "populated";
        await f.page
          .getByRole("button", { name: "Retry", exact: true })
          .click();
        if (kind === "detail")
          await f.page
            .getByRole("heading", { name: "Your event", exact: true })
            .waitFor();
        else
          await f.page
            .getByRole("link", {
              name: /View enquiry for Example Assembly Rooms/,
            })
            .waitFor();
      }
      await f.context.close();
    }
  }
  const refreshFailure = await fixture();
  await openDetail(refreshFailure);
  refreshFailure.mode.failDetail = true;
  await refreshFailure.page
    .getByRole("button", { name: "Accept quote from Example Event Catering" })
    .click();
  await refreshFailure.page
    .getByRole("alert")
    .filter({ hasText: "Enquiry refresh unavailable" })
    .waitFor();
  assert.ok(
    await refreshFailure.page
      .getByRole("heading", { name: "Your event", exact: true })
      .isVisible(),
  );
  refreshFailure.mode.failDetail = false;
  await refreshFailure.page
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await refreshFailure.page.getByText("accepted", { exact: true }).waitFor();
  await refreshFailure.context.close();
  const targetLoading = await fixture();
  targetLoading.mode.targetDelay = 1500;
  await openDetail(targetLoading);
  assert.ok(
    await targetLoading.page
      .getByRole("button", { name: /Message supplier.*Example Event Catering/ })
      .isDisabled(),
  );
  await targetLoading.page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent.includes("Message supplier") && !el.disabled,
    ),
  );
  await targetLoading.context.close();
  const emptyDetail = await fixture();
  emptyDetail.mode.data.invites = [];
  emptyDetail.mode.data.quotes = [];
  await openDetail(emptyDetail);
  await capture(emptyDetail, "no-suppliers-quotes");
  await emptyDetail.context.close();
  const targets = await fixture();
  targets.mode.failTargets = true;
  await openDetail(targets);
  await targets.page
    .getByRole("alert")
    .filter({ hasText: "Messaging suppliers unavailable" })
    .waitFor();
  assert.ok(
    await targets.page
      .getByRole("heading", { name: "Supplier quotes", exact: true })
      .isVisible(),
  );
  targets.mode.failTargets = false;
  await targets.page
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await targets.page
    .getByRole("heading", { name: "Your event", exact: true })
    .waitFor();
  await targets.context.close();

  for (const mode of [
    "noQuote",
    "noThread",
    "failHistory",
    "emptyMessages",
    "loadingMessages",
  ]) {
    const f = await fixture();
    await openDetail(f);
    if (mode === "emptyMessages") f.mode.messages = [];
    else if (mode === "loadingMessages") f.mode.delay = 20000;
    else f.mode[mode] = true;
    await openMessages(f);
    if (mode === "loadingMessages")
      await f.page.getByText("Loading messages...", { exact: true }).waitFor();
    else if (mode === "emptyMessages")
      await f.page
        .getByRole("heading", { name: "No messages yet", exact: true })
        .waitFor();
    else await f.page.getByRole("alert").waitFor();
    await capture(f, `messages-${mode}`);
    if (["noQuote", "noThread", "failHistory"].includes(mode)) {
      await f.page
        .getByRole("textbox", { name: "Message body", exact: true })
        .fill("Hello supplier");
      assert.ok(
        await f.page
          .getByRole("button", { name: "Send", exact: true })
          .isDisabled(),
      );
    }
    await f.context.close();
  }
  const mismatched = await fixture();
  await mismatched.page.goto(base + "/customer/enquiries/not-owned");
  await mismatched.page
    .getByRole("heading", { name: "Enquiry unavailable", exact: true })
    .waitFor();
  assert.equal(
    await mismatched.page
      .getByRole("button", { name: /Accept quote from/ })
      .count(),
    0,
  );
  await mismatched.page.goto(base + "/customer/unsupported");
  await mismatched.page.waitForURL(base + "/customer");
  await mismatched.context.close();
  results.push(
    "List/detail loading/empty/error/retry at all widths; missing/mismatched enquiry hides actions; targets failure retains loaded quotes; empty suppliers/quotes and message loading/empty/no-quote/no-thread/history-failure states passed",
  );

  const keyboard = await fixture();
  await keyboard.page.setViewportSize({ width: 360, height: 1000 });
  await keyboard.page.goto(base + "/customer");
  await keyboard.page
    .getByRole("button", { name: "Open workspace navigation", exact: true })
    .click();
  await keyboard.page.getByRole("dialog").waitFor();
  await keyboard.page.keyboard.press("Escape");
  assert.ok(
    await keyboard.page
      .getByRole("button", { name: "Open workspace navigation", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  await keyboard.page.keyboard.press("Control+k");
  await keyboard.page.getByRole("dialog").waitFor();
  await keyboard.page.keyboard.press("Escape");
  await keyboard.context.close();
  for (const options of [
    { signedIn: false },
    { role: "admin" },
    { role: "supplier" },
    { role: "venue_owner" },
  ]) {
    for (const path of [
      "/customer",
      "/customer/enquiries",
      `/customer/enquiries/${enquiryId}`,
    ]) {
      const f = await fixture(options);
      await f.page.goto(base + path);
      await f.page.waitForURL((u) => !u.pathname.startsWith("/customer"));
      const expected =
        options.signedIn === false
          ? "/login"
          : options.role === "admin"
            ? "/admin/dashboard"
            : options.role === "supplier"
              ? "/supplier/dashboard"
              : "/venue";
      assert.ok(new URL(f.page.url()).pathname.startsWith(expected));
      assert.equal(
        f.requests.filter((r) => r.url.includes("/api/customer/")).length,
        0,
      );
      await f.context.close();
    }
  }
  results.push(
    "Mobile navigation/command keyboard controls; signed-out/Admin/Supplier/Venue guards on all three routes without Customer API calls passed",
  );
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
