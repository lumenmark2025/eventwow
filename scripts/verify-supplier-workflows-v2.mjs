/* global process, console, setTimeout */
// Every backend request is intercepted. This runner never sends quotes/messages or writes live data.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output =
  process.env.SUPPLIER_WORKFLOW_SCREENSHOTS ||
  "/tmp/eventwow-supplier-workflows-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const nextDate = new Date();
nextDate.setDate(nextDate.getDate() + 1);
const eventDate = nextDate.toISOString().slice(0, 10);
const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 3);
const quote = {
  id: "quote-1",
  status: "draft",
  total_amount: 500,
  currency_code: "GBP",
  enquiry_id: "enquiry-1",
  quote_text: "Seasonal menu and setup included.",
  created_at: "2026-09-10T10:00:00Z",
  customer: { name: "Example Customer" },
  enquiry: { eventDate, startTime: "18:00", guestCount: 80 },
  event_location_label: "Example Assembly Rooms",
};
const booking = {
  id: "booking-1",
  origin_type: "external",
  status: "confirmed",
  event_date: eventDate,
  start_time: "18:00",
  end_time: "22:00",
  customer_name: "Example Customer",
  customer_email: "customer@example.test",
  customer_phone: "07000000000",
  location_text: "Example Assembly Rooms",
  location_label: "Example Assembly Rooms",
  guest_count: 80,
  source_id: "source-1",
  source_name: "Phone",
  value_gross: 500,
  deposit_amount: 100,
  balance_amount: 400,
  is_deposit_paid: false,
  is_balance_paid: false,
  supplier_notes: "Arrive one hour before service.",
  quote_id: "quote-1",
  enquiry_id: "enquiry-1",
  message_thread_id: "thread-1",
};
const thread = {
  id: "thread-1",
  unread: true,
  updatedAt: "2026-09-10T10:00:00Z",
  quote: {
    customerName: "Example Customer",
    venueName: "Example Assembly Rooms",
    eventDate,
    eventPostcode: "M1 1AA",
  },
  lastMessage: {
    body: "Could you confirm the setup time?",
    senderType: "customer",
    createdAt: "2026-09-10T10:00:00Z",
  },
};
async function fixture(options = {}) {
  const f = await common({ role: "supplier", ...options }),
    m = f.mode;
  m.view = "populated";
  m.quote = structuredClone(quote);
  m.items = [
    {
      id: "item-1",
      quote_id: "quote-1",
      title: "Event catering",
      qty: 2,
      unit_price: 250,
      sort_order: 1,
    },
  ];
  m.bookings = [
    structuredClone(booking),
    {
      ...structuredClone(booking),
      id: "booking-2",
      customer_name: "Previous Customer",
      event_date: pastDate.toISOString().slice(0, 10),
      status: "completed",
      origin_type: "eventwow",
    },
  ];
  m.sources = [
    { id: "source-1", name: "Phone", is_active: true, is_default: true },
    { id: "source-2", name: "Referral", is_active: true, is_default: false },
  ];
  m.messages = [
    {
      id: "message-1",
      senderType: "customer",
      body: "Could you confirm the setup time?",
      createdAt: "2026-09-10T10:00:00Z",
    },
    {
      id: "message-2",
      senderType: "supplier",
      body: "We plan to arrive at 17:00.",
      createdAt: "2026-09-10T10:10:00Z",
    },
  ];
  await f.context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await f.context.route(
    /\/api\/supplier[-/]|\/rest\/v1\/(quotes|quote_items)(\?|$)/,
    async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        p = u.pathname,
        method = req.method(),
        mutation = !["GET", "HEAD"].includes(method),
        payload = mutation && req.postData() ? req.postDataJSON() : {};
      f.requests.push({
        url: req.url(),
        method,
        body: req.postData(),
        authorization: req.headers().authorization,
      });
      const detail =
        p.startsWith("/rest/v1/") ||
        /\/bookings\/[^/]+$/.test(p) ||
        p.endsWith("supplier-thread");
      const fail =
        m.view === "error" ||
        (m.failPath && p.includes(m.failPath)) ||
        (m.detailState === "error" && detail) ||
        (mutation && m.failMutation);
      if (
        m.view === "loading" ||
        (detail && m.detailState === "loading") ||
        (mutation && m.delay)
      )
        await new Promise((r) => setTimeout(r, m.delay || 1000));
      let status = 200,
        body = { ok: true };
      if (fail) {
        status = 503;
        body = {
          error: "Fixture service unavailable",
          message: "Fixture service unavailable",
        };
      } else if (p === "/rest/v1/quotes")
        body = m.detailState === "missing" ? null : m.quote;
      else if (p === "/rest/v1/quote_items") body = m.items;
      else if (p === "/api/supplier/quotes")
        body = { rows: m.view === "empty" ? [] : [m.quote] };
      else if (p.endsWith("supplier-credits"))
        body = { ok: true, credits_balance: m.credits ?? 25 };
      else if (
        p.startsWith("/api/supplier/enquiries/") &&
        p.endsWith("quote-text-draft")
      )
        body = { draftText: "Generated fixture reply." };
      else if (p.startsWith("/api/supplier/enquiries/"))
        body = {
          enquiry: {
            customerName: "Example Customer",
            eventDate,
            startTime: "18:00",
            guestCount: 80,
            budget: { label: "£500–£1,000" },
            categoryLabel: "Catering",
            venue: { name: "Example Assembly Rooms" },
            message: "A seasonal menu with vegetarian options.",
          },
        };
      else if (p.endsWith("supplier-save-draft-quote")) {
        m.items = payload.items.map((i, n) => ({
          ...i,
          id: i.id || `added-${n + 1}`,
        }));
        m.quote = {
          ...m.quote,
          quote_text: payload.quote_text,
          total_amount: m.items.reduce(
            (total, i) => total + i.qty * i.unit_price,
            0,
          ),
          ...(m.quote.status === "accepted"
            ? { status: "sent", reaccept_required: true }
            : {}),
        };
        body = {
          quote: m.quote,
          items: m.items,
          total: m.quote.total_amount,
          reacceptRequired: m.quote.reaccept_required,
        };
      } else if (p.endsWith("supplier-send-quote")) {
        if (m.credits === 0) {
          status = 402;
          body = { error: "Insufficient credits" };
        } else {
          m.quote = {
            ...m.quote,
            status: "sent",
            sent_at: new Date().toISOString(),
          };
          body = { quote: m.quote, credits_balance: 24 };
        }
      } else if (p.endsWith("supplier-close-quote")) {
        m.quote = {
          ...m.quote,
          status: "closed",
          closed_at: new Date().toISOString(),
        };
        body = { quote: m.quote };
      } else if (p.endsWith("supplier-reopen-quote")) {
        m.quote = { ...m.quote, status: "sent" };
        body = { quote: m.quote };
      } else if (p.endsWith("supplier-get-public-link"))
        body = { url: "/quote/fixture-token" };
      else if (p.endsWith("supplier-get-thread"))
        body = { threadId: "thread-1" };
      else if (p.endsWith("supplier-threads"))
        body = { threads: m.view === "empty" ? [] : [thread] };
      else if (p.endsWith("supplier-thread"))
        body = { thread, messages: m.emptyMessages ? [] : m.messages };
      else if (p.endsWith("supplier-send-message")) {
        const message = {
          id: "message-3",
          senderType: "supplier",
          body: payload.body,
          createdAt: new Date().toISOString(),
        };
        m.messages.push(message);
        body = { message };
      } else if (p.endsWith("booking-sources")) {
        if (method === "POST")
          m.sources.push({
            id: "source-3",
            name: payload.name,
            is_default: false,
            is_active: true,
          });
        body = { rows: m.sources };
      } else if (p.includes("/booking-sources/")) {
        const id = p.split("/").at(-1);
        m.sources = m.sources.map((s) =>
          s.id === id ? { ...s, ...payload } : s,
        );
        body = { row: m.sources.find((s) => s.id === id) };
      } else if (p.endsWith("/create-access-link"))
        body = { url: base + "/booking/fixture-token" };
      else if (p.endsWith("/revoke-access-link")) body = { ok: true };
      else if (p.endsWith("/bookings")) {
        if (method === "POST") {
          const row = {
            ...booking,
            ...payload,
            id: "booking-3",
            origin_type: "external",
          };
          m.bookings.push(row);
          body = { row };
        } else
          body = {
            rows:
              m.view === "empty"
                ? []
                : m.bookings.filter(
                    (b) =>
                      (!u.searchParams.get("origin") ||
                        u.searchParams.get("origin") === b.origin_type) &&
                      (!u.searchParams.get("status") ||
                        u.searchParams.get("status") === b.status),
                  ),
          };
      } else if (p.includes("/bookings/")) {
        const id = p.split("/").at(-1);
        if (method === "PATCH")
          m.bookings = m.bookings.map((b) =>
            b.id === id ? { ...b, ...payload } : b,
          );
        body = {
          row:
            m.detailState === "missing"
              ? null
              : m.bookings.find((b) => b.id === id),
        };
      } else if (p.endsWith("supplier-notifications"))
        body = { notifications: [], unread_count: 0 };
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    },
  );
  return f;
}
const results = [];
async function go(f, path) {
  await f.page.goto(base + "/supplier/" + path);
  await f.page.locator("main.workspace-ui").waitFor();
}
async function audit(page, label) {
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () =>
    (
      await window.axe.run(
        document.querySelector('[role="dialog"]') || document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } },
      )
    ).violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
      details: v.nodes.map((n) => n.failureSummary),
    })),
  );
  const knownWeekIssue = (v) =>
    label.startsWith("booking-week") &&
    ["aria-required-children", "aria-required-parent"].includes(v.id) &&
    v.targets.every((target) =>
      /^\.rbc-(row-content|header|today\.rbc-header|allday-cell)/.test(
        target[0],
      ),
    );
  assert.deepEqual(
    violations.filter((v) => !knownWeekIssue(v)),
    [],
    label + " accessibility",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    label + " overflow",
  );
}
async function capture(f, name) {
  for (const width of [360, 768, 1024, 1440]) {
    await f.page.evaluate(() => window.scrollTo(0, 0));
    await f.page.setViewportSize({ width, height: 1000 });
    await audit(f.page, `${name}-${width}`);
    await f.page.screenshot({
      path: `${output}/${name}-${width}.png`,
      fullPage: !(await f.page.getByRole("dialog").count()),
    });
  }
  results.push(
    `${name}: 360/768/1024/1440px, document overflow and ${name === "booking-week" ? "axe excluding verified pre-existing week-header/all-day ARIA structure defects" : "axe"} passed`,
  );
}
async function openQuote(f) {
  await go(f, "quotes");
  await f.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .click();
  await f.page.getByLabel("Title", { exact: true }).waitFor();
}
try {
  const q = await fixture();
  await go(q, "quotes");
  await q.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .waitFor();
  await capture(q, "quotes-list");
  await q.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .click();
  await q.page.getByLabel("Title", { exact: true }).waitFor();
  assert.ok(
    await q.page
      .locator("#supplier-quote-detail")
      .evaluate((el) => el === document.activeElement),
  );
  await capture(q, "quote-detail");
  assert.deepEqual(q.errors, []);
  await q.context.close();
  const b = await fixture();
  const chunks = [];
  b.page.on("request", (r) => chunks.push(r.url()));
  await go(b, "bookings");
  await b.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .waitFor();
  assert.equal(
    chunks.some((u) => /BookingsCalendar|react-big-calendar/.test(u)),
    false,
    "List defers calendar",
  );
  await capture(b, "bookings-list");
  await b.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .click();
  await b.page
    .getByRole("button", { name: "Edit booking", exact: true })
    .waitFor();
  await capture(b, "booking-detail");
  await b.page
    .getByRole("button", { name: "Edit booking", exact: true })
    .click();
  await b.page.getByRole("dialog").waitFor();
  await capture(b, "booking-edit");
  await b.page.keyboard.press("Escape");
  await b.page.getByRole("button", { name: "Calendar", exact: true }).click();
  await b.page.locator(".rbc-calendar").waitFor();
  await capture(b, "booking-calendar");
  await b.page.getByRole("button", { name: "Week", exact: true }).click();
  await b.page.locator(".rbc-time-view").waitFor();
  await capture(b, "booking-week");
  assert.deepEqual(b.errors, []);
  await b.context.close();
  const m = await fixture();
  await go(m, "messages");
  await m.page
    .getByRole("button")
    .filter({ hasText: "Example Customer" })
    .waitFor();
  await capture(m, "messages-list");
  await m.page
    .getByRole("button")
    .filter({ hasText: "Example Customer" })
    .click();
  await m.page.getByRole("log").waitFor();
  await capture(m, "message-thread");
  assert.deepEqual(m.errors, []);
  await m.context.close();
  // Quote editor: exact payloads and original transitions, including credit failures.
  const edit = await fixture();
  await openQuote(edit);
  await edit.page
    .getByRole("textbox", { name: "Search customer, location or date" })
    .fill("unmatched");
  await edit.page
    .getByRole("heading", { name: "No quotes found", exact: true })
    .waitFor();
  await edit.page
    .getByRole("textbox", { name: "Search customer, location or date" })
    .fill("");
  await edit.page.getByLabel("Filter by status").selectOption("accepted");
  await edit.page
    .getByRole("heading", { name: "No quotes found", exact: true })
    .waitFor();
  await edit.page.getByLabel("Filter by status").selectOption("all");
  await edit.page.getByLabel("Qty", { exact: true }).fill("3");
  await edit.page
    .getByLabel("Message to customer", { exact: true })
    .fill("Updated menu and setup.");
  assert.ok(
    await edit.page
      .getByRole("button", { name: "Send quote (uses 1 credit)", exact: true })
      .isDisabled(),
  );
  await edit.page
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  await edit.page.getByLabel("Title", { exact: true }).nth(1).fill("");
  assert.ok(
    await edit.page
      .getByRole("button", { name: "Save changes", exact: true })
      .isDisabled(),
  );
  await edit.page
    .getByLabel("Title", { exact: true })
    .nth(1)
    .fill("Table service");
  await edit.page
    .getByLabel("Unit price (£)", { exact: true })
    .nth(1)
    .fill("75");
  await edit.page
    .getByRole("button", { name: "Move Table service up", exact: true })
    .click();
  edit.mode.delay = 700;
  edit.mode.failMutation = true;
  await edit.page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  assert.ok(
    await edit.page
      .getByRole("button", { name: "Saving…", exact: true })
      .isDisabled(),
  );
  await edit.page
    .getByText("Fixture service unavailable", { exact: true })
    .waitFor();
  assert.equal(
    await edit.page
      .getByLabel("Message to customer", { exact: true })
      .inputValue(),
    "Updated menu and setup.",
  );
  edit.mode.failMutation = false;
  await edit.page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await edit.page.getByText("Quote updated.", { exact: true }).waitFor();
  const saved = JSON.parse(
    edit.requests
      .filter((r) => r.url.includes("supplier-save-draft-quote"))
      .at(-1).body,
  );
  assert.deepEqual(saved, {
    quote_id: "quote-1",
    items: [
      {
        id: null,
        title: "Table service",
        qty: 1,
        unit_price: 75,
        sort_order: 1,
      },
      {
        id: "item-1",
        title: "Event catering",
        qty: 3,
        unit_price: 250,
        sort_order: 2,
      },
    ],
    quote_text: "Updated menu and setup.",
  });
  assert.equal(edit.mode.quote.total_amount, 825);
  edit.mode.credits = 0;
  await edit.page
    .getByRole("button", { name: "Send quote (uses 1 credit)", exact: true })
    .click();
  await edit.page.getByText("Insufficient credits", { exact: true }).waitFor();
  assert.equal(edit.mode.quote.status, "draft");
  edit.mode.credits = 25;
  await edit.page
    .getByRole("button", { name: "Send quote (uses 1 credit)", exact: true })
    .click();
  await edit.page.getByText("Quote sent.", { exact: true }).waitFor();
  assert.deepEqual(
    JSON.parse(
      edit.requests.filter((r) => r.url.includes("supplier-send-quote")).at(-1)
        .body,
    ),
    { quote_id: "quote-1", quote_text: "Updated menu and setup." },
  );
  await edit.page
    .getByRole("button", { name: "Copy customer link", exact: true })
    .click();
  await edit.page.getByText("Customer link copied.", { exact: true }).waitFor();
  assert.deepEqual(
    JSON.parse(
      edit.requests
        .filter((r) => r.url.includes("supplier-get-public-link"))
        .at(-1).body,
    ),
    { quote_id: "quote-1" },
  );
  edit.page.once("dialog", (d) => d.dismiss());
  await edit.page
    .getByRole("button", { name: "Close quote", exact: true })
    .click();
  assert.equal(
    edit.requests.filter((r) => r.url.includes("supplier-close-quote")).length,
    0,
  );
  edit.page.once("dialog", (d) => d.accept());
  await edit.page
    .getByRole("button", { name: "Close quote", exact: true })
    .click();
  await edit.page.getByText("Quote closed.", { exact: true }).waitFor();
  assert.deepEqual(
    JSON.parse(
      edit.requests.find((r) => r.url.includes("supplier-close-quote")).body,
    ),
    { quote_id: "quote-1" },
  );
  await edit.page
    .getByRole("button", { name: "Reopen quote", exact: true })
    .click();
  await edit.page.getByText("Quote reopened.", { exact: true }).waitFor();
  assert.deepEqual(
    JSON.parse(
      edit.requests.find((r) => r.url.includes("supplier-reopen-quote")).body,
    ),
    { quote_id: "quote-1" },
  );
  await edit.page
    .getByRole("button", { name: "Open messages", exact: true })
    .click();
  await edit.page.waitForURL("**/supplier/messages?thread=thread-1");
  await edit.page.getByRole("log").waitFor();
  assert.deepEqual(
    JSON.parse(
      edit.requests.find((r) => r.url.includes("supplier-get-thread")).body,
    ),
    { quoteId: "quote-1" },
  );
  assert.deepEqual(edit.errors, []);
  await edit.context.close();
  const accepted = await fixture();
  accepted.mode.quote = {
    ...accepted.mode.quote,
    status: "accepted",
    accepted_at: "2026-09-12T10:00:00Z",
  };
  await openQuote(accepted);
  await accepted.page
    .getByText(
      /If you edit and save this quote, customer acceptance will reset/,
    )
    .waitFor();
  assert.ok(
    await accepted.page
      .getByRole("button", { name: "Send quote (uses 1 credit)", exact: true })
      .isDisabled(),
  );
  await accepted.page
    .getByLabel("Message to customer", { exact: true })
    .fill("Updated accepted quote.");
  await accepted.page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await accepted.page
    .getByText(
      "Quote updated - customer has been notified and must re-accept.",
      { exact: true },
    )
    .waitFor();
  await capture(accepted, "quote-reaccept");
  await accepted.context.close();
  results.push(
    "Quotes: filters, validation, add/reorder items, totals, exact save/send/public-link/close/reopen/thread payloads, failed save preserves draft, insufficient credits, close cancellation, accepted-edit reacceptance and original Messages URL",
  );
  // Booking CRUD and source management use the original API payloads.
  const bookingEdit = await fixture();
  await go(bookingEdit, "bookings");
  await bookingEdit.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .waitFor();
  await bookingEdit.page
    .getByLabel("Origin", { exact: true })
    .selectOption("eventwow");
  await bookingEdit.page
    .getByRole("button", { name: "Previous Customer", exact: true })
    .waitFor();
  assert.equal(
    await bookingEdit.page
      .getByRole("button", { name: "Example Customer", exact: true })
      .count(),
    0,
  );
  await bookingEdit.page
    .getByLabel("Origin", { exact: true })
    .selectOption("all");
  await bookingEdit.page
    .getByRole("button", { name: "Manage sources", exact: true })
    .click();
  await bookingEdit.page.getByRole("dialog").waitFor();
  await bookingEdit.page
    .getByLabel("Source name: Phone", { exact: true })
    .waitFor();
  assert.ok(
    await bookingEdit.page
      .getByLabel("Source name: Phone", { exact: true })
      .isDisabled(),
  );
  await capture(bookingEdit, "booking-sources");
  await bookingEdit.page
    .getByRole("button", { name: "Ensure defaults", exact: true })
    .click();
  await bookingEdit.page
    .getByRole("button", { name: "Ensure defaults", exact: true })
    .waitFor();
  assert.ok(
    bookingEdit.requests.some(
      (r) => r.url.endsWith("/booking-sources") && r.method === "PUT",
    ),
  );
  await bookingEdit.page
    .getByLabel("New source name", { exact: true })
    .fill("Venue referral");
  await bookingEdit.page
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await bookingEdit.page
    .getByLabel("Source name: Venue referral", { exact: true })
    .waitFor();
  assert.deepEqual(
    JSON.parse(
      bookingEdit.requests.find(
        (r) => r.url.endsWith("/booking-sources") && r.method === "POST",
      ).body,
    ),
    { name: "Venue referral" },
  );
  await Promise.all([
    bookingEdit.page.waitForResponse((r) =>
      r.url().endsWith("/booking-sources/source-3"),
    ),
    bookingEdit.page
      .getByRole("dialog")
      .getByLabel("Active", { exact: true })
      .nth(2)
      .click(),
  ]);
  assert.deepEqual(
    JSON.parse(
      bookingEdit.requests.find((r) =>
        r.url.endsWith("/booking-sources/source-3"),
      ).body,
    ),
    { is_active: false },
  );
  await bookingEdit.page.keyboard.press("Escape");
  await bookingEdit.page
    .getByRole("button", { name: "Add external booking", exact: true })
    .click();
  let dialog = bookingEdit.page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel("Date", { exact: true }).fill("");
  await dialog
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await dialog.getByText("Event date is required", { exact: true }).waitFor();
  assert.equal(
    bookingEdit.requests.filter(
      (r) => r.url.endsWith("/bookings") && r.method === "POST",
    ).length,
    0,
  );
  await dialog.getByLabel("Date", { exact: true }).fill(eventDate);
  await dialog.getByLabel("Name", { exact: true }).fill("New Customer");
  await dialog.getByLabel("Location", { exact: true }).fill("Example Hall");
  await dialog.getByLabel("Gross value", { exact: true }).fill("800");
  await dialog.getByLabel("Deposit", { exact: true }).fill("100");
  await dialog.getByLabel("Balance", { exact: true }).fill("700");
  await dialog.getByLabel("Deposit paid", { exact: true }).check();
  await dialog
    .getByLabel("Supplier notes", { exact: true })
    .fill("Access from 17:00.");
  bookingEdit.mode.delay = 700;
  bookingEdit.mode.failMutation = true;
  await dialog
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  assert.ok(
    await dialog
      .getByRole("button", { name: "Saving...", exact: true })
      .isDisabled(),
  );
  await dialog
    .getByText("Fixture service unavailable", { exact: true })
    .waitFor();
  assert.equal(
    await dialog.getByLabel("Name", { exact: true }).inputValue(),
    "New Customer",
  );
  bookingEdit.mode.failMutation = false;
  await dialog
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await dialog.waitFor({ state: "detached" });
  await bookingEdit.page
    .getByRole("button", { name: "Edit booking", exact: true })
    .waitFor();
  const created = JSON.parse(
    bookingEdit.requests
      .filter((r) => r.url.endsWith("/bookings") && r.method === "POST")
      .at(-1).body,
  );
  assert.deepEqual(created, {
    event_date: eventDate,
    start_time: null,
    end_time: null,
    location_text: "Example Hall",
    customer_name: "New Customer",
    customer_email: null,
    customer_phone: null,
    guest_count: null,
    status: "confirmed",
    source_id: "source-1",
    value_gross: 800,
    deposit_amount: 100,
    balance_amount: 700,
    is_deposit_paid: true,
    is_balance_paid: false,
    supplier_notes: "Access from 17:00.",
  });
  await bookingEdit.page
    .getByRole("button", { name: "Edit booking", exact: true })
    .click();
  dialog = bookingEdit.page.getByRole("dialog");
  await dialog.getByLabel("Status", { exact: true }).selectOption("cancelled");
  await dialog
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await dialog.waitFor({ state: "detached" });
  assert.deepEqual(
    JSON.parse(
      bookingEdit.requests
        .filter(
          (r) => r.method === "PATCH" && r.url.endsWith("/bookings/booking-3"),
        )
        .at(-1).body,
    ),
    { ...created, status: "cancelled" },
  );
  await bookingEdit.page
    .getByRole("button", { name: "Get link", exact: true })
    .click();
  await bookingEdit.page
    .getByText("Customer link ready.", { exact: true })
    .waitFor();
  assert.deepEqual(
    JSON.parse(
      bookingEdit.requests.find((r) => r.url.endsWith("/create-access-link"))
        .body,
    ),
    {},
  );
  await bookingEdit.page
    .getByRole("button", { name: "Revoke link", exact: true })
    .click();
  await bookingEdit.page
    .getByText("Customer link revoked.", { exact: true })
    .waitFor();
  assert.deepEqual(
    JSON.parse(
      bookingEdit.requests.find((r) => r.url.endsWith("/revoke-access-link"))
        .body,
    ),
    {},
  );
  assert.deepEqual(bookingEdit.errors, []);
  await bookingEdit.context.close();
  results.push(
    "Bookings: origin/date/status contracts, default/custom sources, exact create/edit/share/revoke payloads, required-date validation, failed save retained form, cancelled transition, paid flags and busy controls",
  );
  // Sending updates local thread state without an extra fetch; preserve client message ID.
  const messaging = await fixture();
  await go(messaging, "messages?thread=thread-1");
  await messaging.page.getByRole("log").waitFor();
  const send = messaging.page.getByRole("button", {
    name: "Send message",
    exact: true,
  });
  assert.ok(await send.isDisabled());
  await messaging.page.getByLabel("Message", { exact: true }).fill("   ");
  assert.ok(await send.isDisabled());
  await messaging.page
    .getByLabel("Message", { exact: true })
    .fill("  Confirmed for 17:00.  ");
  messaging.mode.delay = 700;
  messaging.mode.failMutation = true;
  await send.click();
  assert.ok(
    await messaging.page
      .getByRole("button", { name: "Sending...", exact: true })
      .isDisabled(),
  );
  await messaging.page
    .getByText("Fixture service unavailable", { exact: true })
    .waitFor();
  assert.equal(
    await messaging.page.getByLabel("Message", { exact: true }).inputValue(),
    "  Confirmed for 17:00.  ",
  );
  messaging.mode.failMutation = false;
  const reads = messaging.requests.filter((r) => r.method === "GET").length;
  await send.click();
  await messaging.page
    .getByRole("log")
    .getByText("Confirmed for 17:00.", { exact: true })
    .waitFor();
  assert.equal(
    await messaging.page.getByLabel("Message", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    messaging.requests.filter((r) => r.method === "GET").length,
    reads,
  );
  const sent = JSON.parse(
    messaging.requests
      .filter((r) => r.url.endsWith("supplier-send-message"))
      .at(-1).body,
  );
  assert.deepEqual(Object.keys(sent).sort(), [
    "body",
    "clientMessageId",
    "threadId",
  ]);
  assert.equal(sent.threadId, "thread-1");
  assert.equal(sent.body, "Confirmed for 17:00.");
  assert.match(sent.clientMessageId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(messaging.errors, []);
  await messaging.context.close();
  results.push(
    "Messages: URL-selected thread, empty/whitespace/pending disables, failed send retains composer, exact trimmed body/thread/client-ID payload, local success updates without refetch",
  );

  // Every route retains clear initial and detail states at the required widths.
  for (const route of ["quotes", "bookings", "messages"]) {
    for (const state of ["loading", "empty", "error"]) {
      const f = await fixture();
      f.mode.view = state;
      if (state === "loading") f.mode.delay = 6000;
      await go(f, route);
      if (state === "loading")
        await f.page.locator('main [role="status"]').first().waitFor();
      else if (state === "error")
        await f.page.getByRole("alert").first().waitFor();
      else
        await f.page
          .getByRole("heading", {
            name:
              route === "quotes"
                ? "No quotes found"
                : route === "bookings"
                  ? "No bookings found"
                  : "No threads yet",
            exact: true,
          })
          .waitFor();
      for (const width of [360, 768, 1024, 1440]) {
        await f.page.setViewportSize({ width, height: 1000 });
        if (state !== "loading")
          await audit(f.page, `${route}-${state}-${width}`);
        else
          assert.equal(
            await f.page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            ),
            false,
          );
        if (width === 360)
          await f.page.screenshot({
            path: `${output}/${route}-${state}-360.png`,
            fullPage: true,
          });
      }
      if (state === "error") {
        f.mode.view = "populated";
        await f.page
          .getByRole("button", { name: "Retry", exact: true })
          .click();
        await f.page
          .getByRole("button")
          .filter({ hasText: "Example Customer" })
          .first()
          .waitFor();
      }
      assert.deepEqual(f.errors, []);
      await f.context.close();
    }
  }
  for (const route of ["quotes", "bookings", "messages"]) {
    for (const state of [
      "loading",
      "error",
      ...(route === "messages" ? [] : ["missing"]),
    ]) {
      const f = await fixture();
      f.mode.detailState = state;
      if (state === "loading") f.mode.delay = 6000;
      await go(f, route);
      await f.page
        .getByRole("button")
        .filter({ hasText: "Example Customer" })
        .first()
        .click();
      if (state === "loading")
        await f.page.locator('main [role="status"]').first().waitFor();
      else if (state === "error")
        await f.page.getByRole("alert").first().waitFor();
      else
        await f.page
          .getByText(
            route === "quotes" ? "Quote not found." : "Booking not found",
            { exact: true },
          )
          .last()
          .waitFor();
      await f.page.setViewportSize({ width: 360, height: 1000 });
      if (state !== "loading") await audit(f.page, `${route}-detail-${state}`);
      await f.page.screenshot({
        path: `${output}/${route}-detail-${state}-360.png`,
        fullPage: true,
      });
      assert.deepEqual(f.errors, []);
      await f.context.close();
    }
  }
  const blank = await fixture();
  blank.mode.emptyMessages = true;
  await go(blank, "messages?thread=thread-1");
  await blank.page
    .getByRole("heading", { name: "No messages yet", exact: true })
    .waitFor();
  await audit(blank.page, "Empty message history");
  assert.ok(
    await blank.page
      .getByRole("button", { name: "Send message", exact: true })
      .isDisabled(),
  );
  await blank.context.close();
  results.push(
    "Quotes/Bookings/Messages: loading/empty/error at all four widths, retries; detail loading/error/missing and empty conversation history",
  );
  // Keyboard focus, calendar range/view persistence, and guard boundaries.
  const keyboard = await fixture();
  await go(keyboard, "bookings");
  await keyboard.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .waitFor();
  await keyboard.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .focus();
  await keyboard.page.keyboard.press("Enter");
  await keyboard.page
    .getByRole("button", { name: "Edit booking", exact: true })
    .waitFor();
  assert.ok(
    await keyboard.page
      .locator("#supplier-booking-detail")
      .evaluate((el) => el === document.activeElement),
  );
  const editButton = keyboard.page.getByRole("button", {
    name: "Edit booking",
    exact: true,
  });
  await editButton.focus();
  await keyboard.page.keyboard.press("Enter");
  await keyboard.page.getByRole("dialog").waitFor();
  for (let i = 0; i < 30; i++) {
    await keyboard.page.keyboard.press("Tab");
    assert.ok(
      await keyboard.page
        .getByRole("dialog")
        .evaluate((el) => el.contains(document.activeElement)),
    );
  }
  await keyboard.page.keyboard.press("Escape");
  assert.equal(
    await editButton.evaluate((el) => el === document.activeElement),
    true,
  );
  await keyboard.page
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await keyboard.page.locator(".rbc-calendar").waitFor();
  await keyboard.page
    .getByRole("button", { name: "Next calendar period", exact: true })
    .focus();
  await Promise.all([
    keyboard.page.waitForResponse((r) =>
      r.url().includes("/api/supplier/bookings?"),
    ),
    keyboard.page.keyboard.press("Enter"),
  ]);
  assert.equal(
    await keyboard.page.evaluate(() =>
      localStorage.getItem("supplier_bookings_view_mode"),
    ),
    "calendar",
  );
  assert.ok(
    keyboard.requests.some(
      (r) =>
        r.url.includes("/api/supplier/bookings?") &&
        new URL(r.url).searchParams.has("from") &&
        new URL(r.url).searchParams.has("to"),
    ),
  );
  await keyboard.page
    .getByRole("button", { name: "Today", exact: true })
    .click();
  await keyboard.page.locator(".rbc-month-view").waitFor();
  // Reload clears selection; an already visible detail must not make this pass.
  await keyboard.page.reload();
  await keyboard.page.locator(".rbc-month-view").waitFor();
  assert.equal(
    await keyboard.page
      .getByRole("button", { name: "Edit booking", exact: true })
      .count(),
    0,
  );
  const event = keyboard.page
    .locator(".rbc-event")
    .filter({ hasText: "Example Customer" })
    .first();
  await event.focus();
  assert.ok(await event.evaluate((el) => el === document.activeElement));
  await keyboard.page.keyboard.press("Enter");
  await keyboard.page
    .getByRole("button", { name: "Edit booking", exact: true })
    .waitFor();
  await keyboard.context.close();
  for (const options of [
    { signedIn: false },
    { role: "admin" },
    { role: "customer" },
    { role: "venue_owner" },
  ])
    for (const route of ["quotes", "bookings", "messages"]) {
      const f = await fixture(options);
      await f.page.goto(base + "/supplier/" + route);
      await f.page.waitForURL((u) => !u.pathname.startsWith("/supplier/"));
      const expected =
        options.signedIn === false
          ? "/login"
          : options.role === "admin"
            ? "/admin/"
            : options.role === "customer"
              ? "/customer"
              : "/venue";
      assert.ok(new URL(f.page.url()).pathname.startsWith(expected));
      assert.equal(
        f.requests.some((r) => /\/api\/supplier[-/]/.test(r.url)),
        false,
      );
      await f.context.close();
    }
  results.push(
    "Keyboard: booking row, Radix edit dialog Tab containment/Escape/focus return, calendar navigation/event selection and persisted view; all three routes preserve signed-out/Admin/Customer/Venue guards",
  );

  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
