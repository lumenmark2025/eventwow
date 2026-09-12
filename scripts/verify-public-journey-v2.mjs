/* global process, console */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output =
  process.env.JOURNEY_SCREENSHOTS || "/tmp/eventwow-public-journey-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const results = [];
const details =
  "We are organising a community celebration with seasonal catering for eighty guests. Please include setup, vegetarian options and serving staff for the evening.";
async function fixture(signedIn = false) {
  const f = await common({ signedIn, role: "customer" });
  f.page.setDefaultTimeout(12000);
  const state = {
    status: "sent",
    reaccept: false,
    empty: false,
    error: "",
    loading: false,
    messages: [],
    calls: [],
    submitError: false,
  };
  const quote = () => ({
    quote: {
      id: "quote-1",
      status: state.status,
      reaccept_required: state.reaccept,
      currency: "GBP",
      total: 1000,
      subtotal: 1000,
      tax: 0,
      quote_text: "Seasonal menu, setup and evening service.",
      sent_at: "2026-09-12T12:00:00Z",
    },
    items: state.empty
      ? []
      : [
          {
            id: "item-1",
            title: "Seasonal catering",
            description: "Vegetarian options and serving staff",
            qty: 80,
            unit_price: 12.5,
            line_total: 1000,
          },
        ],
    supplier: { name: "Fixture Seasonal Table" },
    enquiry: { event_date: "2026-12-12", location_summary: "Manchester" },
  });
  const comparison = () => ({
    enquiry: {
      eventDate: "2026-12-12",
      guestCount: 80,
      locationLabel: "Manchester",
    },
    shortlist: state.shortlist || [],
    quotes: state.empty
      ? []
      : [1, 2].map((i) => ({
          quoteId: `quote-${i}`,
          quoteToken: `decision-${i}`,
          quoteStatus: i === 1 ? state.status : "sent",
          reacceptRequired: i === 1 && state.reaccept,
          supplier: {
            supplierId: `supplier-${i}`,
            name: `Fixture ${i === 1 ? "Seasonal Table" : "Celebration Kitchen"}`,
            locationLabel: "Manchester",
          },
          totals: { total: i * 1000, currency: "GBP" },
          quoteText: "Seasonal menu, setup and evening service.",
          items: [
            {
              id: `item-${i}`,
              description: "Seasonal catering with vegetarian options",
              qty: 80,
              unitPrice: 12.5,
              lineTotal: 1000,
            },
          ],
          sentAt: "2026-09-12T12:00:00Z",
        })),
  });
  await f.context.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (
      ![
        "/api/public-supplier-request-context",
        "/api/public-venues-search",
        "/api/public-venue",
        "/api/public/enquiries",
        "/api/public-enquiry-quotes",
        "/api/public-quote",
        "/api/public-quote-accept",
        "/api/public-quote-decline",
        "/api/public-thread",
        "/api/public-send-message",
        "/api/public-start-thread",
        "/api/public-toggle-shortlist",
        "/api/public/booking-access",
        "/api/public/booking-magic-link",
        "/api/public-payment-status",
      ].includes(path)
    )
      return route.fallback();
    const body = req.postDataJSON();
    state.calls.push({ path, method: req.method(), body, search: url.search });
    const reply = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (state.loading) await new Promise((resolve) => setTimeout(resolve, 650));
    if (state.error)
      return reply(
        { details: state.error },
        state.error === "Quote not found" ? 404 : 410,
      );
    if (path === "/api/public-supplier-request-context")
      return reply({
        supplierId: "supplier-1",
        supplierName: "Fixture Seasonal Table",
        activeCategoryCount: 2,
        activeCategories: [
          { id: "cat-1", slug: "pizza-catering", name: "Pizza Catering" },
          { id: "cat-2", slug: "wedding-caterers", name: "Wedding Caterers" },
        ],
      });
    if (path === "/api/public-venues-search")
      return reply({
        rows: [
          {
            id: "venue-1",
            name: "Fixture Event Hall",
            town: "Manchester",
            postcode: "M1 1AA",
          },
        ],
      });
    if (path === "/api/public-venue")
      return reply({
        venue: {
          id: "venue-1",
          name: "Fixture Event Hall",
          locationLabel: "Manchester",
          guestMin: 50,
          guestMax: 100,
        },
      });
    if (path === "/api/public/enquiries")
      return state.submitError
        ? reply(
            {
              details: "Please check your event details.",
              hints: ["Add event date"],
            },
            400,
          )
        : reply({ publicToken: "enquiry-token" });
    if (path === "/api/public-enquiry-quotes") return reply(comparison());
    if (path === "/api/public-quote") return reply(quote());
    if (
      path === "/api/public-quote-accept" ||
      path === "/api/public-quote-decline"
    ) {
      state.status = path.endsWith("accept") ? "accepted" : "declined";
      state.reaccept = false;
      return reply(quote());
    }
    if (path === "/api/public-thread")
      return reply({ thread: { id: "thread-1" }, messages: state.messages });
    if (path === "/api/public-start-thread")
      return reply({ threadId: "thread-1", quoteToken: "decision-1" });
    if (path === "/api/public-send-message") {
      const message = {
        id: `message-${state.messages.length}`,
        senderType: "customer",
        createdAt: "2026-09-12T12:30:00Z",
        body: body.body || body.messageText,
      };
      state.messages.push(message);
      return reply({ message });
    }
    if (path === "/api/public-toggle-shortlist") {
      state.shortlist = body.action === "add" ? [body.supplierId] : [];
      return reply({ shortlist: state.shortlist });
    }
    if (path === "/api/public/booking-access")
      return reply({
        booking: {
          id: "booking-1",
          event_date: "2026-12-12",
          start_time: "18:00",
          event_location_label: "Manchester",
          guest_count: 80,
          status: "confirmed",
          value_gross: 1000,
          deposit_amount: null,
          balance_amount: null,
          message_thread_id: "thread-1",
          has_customer_email: true,
          customer_email_masked: "f***@example.test",
        },
        quote: {
          total_amount: 1000,
          currency_code: "GBP",
          public_quote_path: "/quote/decision-1",
          items: [],
        },
      });
    if (path === "/api/public/booking-magic-link")
      return reply({
        message:
          "If the email matches, you will receive a sign-in link shortly.",
      });
    return reply({ payment: null });
  });
  return { ...f, state };
}
async function inspect(f, name, width) {
  await f.page.evaluate(() => document.fonts.ready);
  await f.page.waitForTimeout(200);
  assert.ok(
    await f.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `${name} overflow at ${width}`,
  );
  await f.page.addScriptTag({ content: axe });
  const violations = await f.page.evaluate(
    async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations,
  );
  assert.deepEqual(
    violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    `${name} accessibility ${width}`,
  );
  await f.page.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
  });
  results.push({ name, width, accessibility: "pass", overflow: false });
}
try {
  for (const width of [360, 768, 1024, 1440]) {
    const f = await fixture();
    await f.page.setViewportSize({ width, height: 1000 });
    for (const [path, name, heading] of [
      ["/request?category=pizza-catering", "request", "Post your enquiry"],
      [
        "/suppliers/fixture/request-quote",
        "supplier-request",
        "Request a quote from Fixture Seasonal Table",
      ],
      ["/enquiry/enquiry-token", "quotes-list", "Your quotes"],
      ["/quote/decision-1", "quote", "Your Quote"],
      ["/booking-access?t=booking-token", "booking", "Booking details"],
    ]) {
      await f.page.goto(base + path);
      await f.page
        .getByRole("heading", { name: heading, exact: true })
        .waitFor();
      if (name === "quote")
        await f.page.getByText("No messages yet", { exact: true }).waitFor();
      await inspect(f, name, width);
      if (name === "quotes-list") {
        await f.page
          .getByRole("button", { name: "Compare", exact: true })
          .click();
        await inspect(f, "quotes-compare", width);
        await f.page
          .getByRole("region", {
            name: "Quote comparison, scroll for more suppliers",
          })
          .focus();
        await f.page.keyboard.press("ArrowRight");
        await f.page
          .getByRole("button", { name: "Ask", exact: true })
          .first()
          .click();
        await f.page.getByRole("dialog").waitFor();
        await f.page.getByText("No messages yet.", { exact: true }).waitFor();
        await inspect(f, "quote-message", width);
        for (let tab = 0; tab < 8; tab++) {
          await f.page.keyboard.press("Tab");
          assert.ok(
            await f.page
              .getByRole("dialog")
              .evaluate((panel) => panel.contains(document.activeElement)),
            "Dialog retains keyboard focus",
          );
        }
        await f.page.keyboard.press("Escape");
        assert.equal(await f.page.getByRole("dialog").count(), 0);
        assert.equal(
          await f.page.evaluate(() => document.activeElement?.textContent),
          "Ask",
        );
      }
    }
    assert.deepEqual(f.errors, []);
    await f.context.close();
  }
  const f = await fixture();
  await f.page.goto(base + "/suppliers/fixture/request-quote");
  await f.page
    .getByLabel("Your name *", { exact: true })
    .fill("Fixture Customer");
  await f.page
    .getByLabel("Email *", { exact: true })
    .fill("fixture@example.test");
  await f.page
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await f.page
    .getByRole("alert")
    .filter({ hasText: "Please choose a category" })
    .waitFor();
  await f.page
    .getByLabel("Category", { exact: true })
    .selectOption("pizza-catering");
  await f.page
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await f.page
    .getByRole("alert")
    .filter({ hasText: "at least 80 characters" })
    .waitFor();
  await f.page.getByLabel("Event details").fill(details);
  await f.page.getByLabel("Venue / Location name").fill("Fixture");
  await f.page.getByRole("button", { name: /Fixture Event Hall/ }).focus();
  await f.page.keyboard.press("Enter");
  assert.equal(
    await f.page.getByLabel("Venue postcode").inputValue(),
    "M1 1AA",
  );
  await f.page.getByLabel("Budget amount").fill("20");
  await f.page.getByRole("button", { name: "Per person", exact: true }).click();
  await f.page.getByRole("button", { name: "Yes", exact: true }).click();
  f.state.submitError = true;
  await f.page
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await f.page.getByRole("alert").filter({ hasText: "Please check" }).waitFor();
  f.state.submitError = false;
  f.state.empty = true;
  await f.page
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await f.page.waitForURL("**/enquiry/enquiry-token");
  await f.page
    .getByRole("heading", { name: "Waiting for suppliers" })
    .waitFor();
  const posted = f.state.calls
    .filter((c) => c.path === "/api/public/enquiries")
    .at(-1).body;
  assert.equal(posted.supplier_id, "supplier-1");
  assert.equal(posted.venue_id, "venue-1");
  assert.equal(posted.budget_range, "£20 per person");
  assert.equal(posted.power_available, true);
  assert.equal(posted.message, details);
  await inspect(f, "request-success-empty", 1440);
  f.state.empty = false;
  await f.page.goto(base + "/request/enquiry-token");
  await f.page
    .getByRole("button", { name: "Shortlist", exact: true })
    .first()
    .click();
  await f.page.getByLabel("Shortlisted only").check();
  assert.equal(
    await f.page
      .getByRole("button", { name: "Accept quote", exact: true })
      .count(),
    1,
  );
  await f.page
    .getByRole("button", { name: "Ask a question", exact: true })
    .click();
  await f.page.getByLabel("Message body").fill("  Question from comparison  ");
  await f.page.getByRole("button", { name: "Send", exact: true }).click();
  await f.page.getByText("Question from comparison", { exact: true }).waitFor();
  assert.deepEqual(
    f.state.calls.filter((c) => c.path === "/api/public-send-message").at(-1)
      .body,
    {
      token: "decision-1",
      threadId: "thread-1",
      messageText: "Question from comparison",
    },
  );
  await f.page.keyboard.press("Escape");
  await f.page.goto(base + "/quote/decision-1");
  await f.page
    .getByRole("button", { name: "Accept quote", exact: true })
    .waitFor();
  await f.page
    .getByLabel("Message (optional)", { exact: true })
    .fill("Our decision note");
  f.page.once("dialog", (d) => d.dismiss());
  await f.page
    .getByRole("button", { name: "Accept quote", exact: true })
    .click();
  assert.equal(f.state.status, "sent");
  f.page.once("dialog", (d) => d.accept());
  await f.page
    .getByRole("button", { name: "Accept quote", exact: true })
    .click();
  await f.page.getByText("Quote accepted.", { exact: true }).waitFor();
  assert.deepEqual(
    f.state.calls.filter((c) => c.path === "/api/public-quote-accept").at(-1)
      .body,
    { token: "decision-1", note: "Our decision note" },
  );
  assert.equal(
    await f.page
      .getByRole("button", { name: "Accept quote", exact: true })
      .count(),
    0,
  );
  await inspect(f, "accepted", 1440);
  f.state.status = "sent";
  f.state.reaccept = true;
  await f.page.reload();
  await f.page
    .getByText(
      "This quote has been updated since you accepted it. Please review and accept again to confirm.",
    )
    .waitFor();
  await inspect(f, "reaccept", 1440);
  f.page.once("dialog", (d) => d.accept());
  await f.page
    .getByRole("button", { name: "Accept quote", exact: true })
    .click();
  await f.page.getByText("Quote accepted.", { exact: true }).waitFor();
  f.state.status = "sent";
  await f.page.reload();
  await f.page
    .getByRole("button", { name: "Decline quote", exact: true })
    .click();
  await f.page.getByText("Quote declined.", { exact: true }).waitFor();
  await inspect(f, "declined", 1440);
  await f.page
    .getByPlaceholder("Send a message to your supplier...")
    .fill("  Message from quote  ");
  await f.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await f.page.getByText("Message sent.", { exact: true }).waitFor();
  const sent = f.state.calls
    .filter((c) => c.path === "/api/public-send-message")
    .at(-1).body;
  assert.equal(sent.body, "Message from quote");
  assert.equal(sent.token, "decision-1");
  assert.ok(sent.clientMessageId);
  await f.page.reload();
  await f.page.getByText("Message from quote", { exact: true }).waitFor();
  assert.deepEqual(
    await f.page.locator("[role=log] .whitespace-pre-wrap").allTextContents(),
    ["Question from comparison", "Message from quote"],
  );
  for (const error of [
    "Quote not found",
    "Quote link expired",
    "Quote link revoked",
  ]) {
    f.state.error = error;
    await f.page.goto(base + "/quote/invalid");
    await f.page
      .getByRole("heading", { name: "Quote not found", exact: true })
      .waitFor();
    assert.equal(
      await f.page
        .getByRole("button", { name: "Accept quote", exact: true })
        .count(),
      0,
    );
    await inspect(f, error.replaceAll(" ", "-").toLowerCase(), 1440);
  }
  f.state.error = "Request link expired";
  await f.page.goto(base + "/enquiry/invalid");
  await f.page.getByRole("heading", { name: "Request not found" }).waitFor();
  await inspect(f, "enquiry-error", 1440);
  f.state.error = "";
  f.state.loading = true;
  await f.page.goto(base + "/quote/decision-1");
  await f.page.locator(".public-journey .animate-pulse").first().waitFor();
  await f.page.screenshot({
    path: `output/loading.png`.replace("output", output),
  });
  await f.page.getByRole("heading", { name: "Your Quote" }).waitFor();
  f.state.loading = false;
  await f.page.goto(base + "/booking-access");
  await f.page.getByRole("heading", { name: "Booking link missing" }).waitFor();
  await f.page.goto(base + "/booking-access?t=booking-token");
  await f.page
    .getByRole("link", { name: "Login to message", exact: true })
    .waitFor();
  assert.equal(
    await f.page
      .getByRole("link", { name: "Login to message", exact: true })
      .getAttribute("href"),
    "/login?returnTo=%2Fbooking-access%3Ft%3Dbooking-token",
  );
  await f.page.getByRole("button", { name: /Email sign-in link/ }).click();
  await f.page
    .getByText("If the email matches, you will receive a sign-in link shortly.")
    .waitFor();
  assert.deepEqual(
    f.state.calls
      .filter((c) => c.path === "/api/public/booking-magic-link")
      .at(-1).body,
    { token: "booking-token" },
  );
  assert.deepEqual(f.errors, []);
  await f.context.close();
  const logged = await fixture(true);
  await logged.page.goto(base + "/booking-access?t=booking-token");
  await logged.page
    .getByPlaceholder("Send a message...")
    .fill("Booking question");
  await logged.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await logged.page.getByText("Booking question", { exact: true }).waitFor();
  assert.deepEqual(logged.errors, []);
  await logged.context.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        results,
        contracts:
          "payloads, validation, decisions, confirmation, revision, message order and handoffs passed; synthetic fixture transport",
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS public journey: ${results.length} responsive/state/accessibility checks plus action payloads`,
  );
} finally {
  await browser.close();
}
