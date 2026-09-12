/* global process, console, setTimeout, Buffer */
// Isolated browser fixtures intercept every API/Supabase request; no production data or payments.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.SUPPLIER_SCREENSHOTS || "/tmp/eventwow-supplier-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const photo =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#eef2f6"/><text x="300" y="150" text-anchor="middle" font-family="sans-serif" fill="#475569">Local image fixture</text></svg>',
  );
const originalProfile = {
  name: "Example Event Catering",
  slug: "example-event-catering",
  shortDescription: "Seasonal menus for conferences and celebrations.",
  about:
    "Our catering team prepares seasonal menus for conferences, celebrations and community events. We work with organisers to plan menus for dietary needs and event schedules.",
  services: ["Event catering", "Menu planning", "Dietary options"],
  locationLabel: "Manchester and the North West",
  basePostcode: "M1 1AA",
  travelRadiusMiles: 30,
  categories: ["Catering"],
  isPublished: true,
};
const enquiry = {
  id: "invite-1",
  enquiryId: "enquiry-1",
  status: "invited",
  customerName: "Example Customer",
  invitedAt: "2026-09-10T10:00:00Z",
  enquiry: {
    customerName: "Example Customer",
    eventDate: "2026-12-12",
    startTime: "18:00",
    guestCount: 120,
    budget: { label: "£2,000–£3,000" },
    categoryLabel: "Catering",
    locationLabel: "Manchester",
    postcode: "M1 1AA",
    venue: { name: "Example Assembly Rooms", address: "1 Example Street" },
    message:
      "Please provide a seasonal menu with vegetarian options for our annual team celebration.",
  },
};
async function fixture(options = {}) {
  const f = await common({ role: "supplier", ...options });
  const m = f.mode;
  m.view = "populated";
  m.profile = structuredClone(originalProfile);
  m.rows = [
    structuredClone(enquiry),
    {
      ...structuredClone(enquiry),
      id: "invite-2",
      enquiryId: "enquiry-2",
      customerName: "Another Customer",
      status: "quoted",
      quoteId: "quote-2",
    },
  ];
  m.media = {
    hero: { id: "hero-1", url: photo },
    gallery: [
      { id: "image-1", url: photo },
      { id: "image-2", url: photo },
    ],
  };
  m.notifications = [
    {
      id: "notification-1",
      title: "New event request",
      body: "Example Customer invited you to quote for their event.",
      created_at: "2026-09-10T10:00:00Z",
      read_at: null,
      url: "/supplier/enquiries",
    },
  ];
  await f.context.route(
    /\/api\/supplier[-/]|\/rest\/v1\/(credit_transactions|enquiry_suppliers|quotes|supplier_bookings)(\?|$)/,
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      const mutation = req.method() === "POST";
      f.requests.push({
        url: req.url(),
        method: req.method(),
        body: req.postData(),
        authorization: req.headers().authorization,
      });
      const payload = mutation ? req.postDataJSON() : null;
      const shell =
        path.endsWith("supplier-notifications") &&
        url.searchParams.get("limit") === "1";
      if ((m.view === "loading" && !shell) || (mutation && m.delay))
        await new Promise((r) => setTimeout(r, m.delay || 1000));
      let status = 200,
        body = { ok: true };
      if ((m.view === "error" && !shell) || (mutation && m.failSave)) {
        status = 503;
        body = {
          error: "Fixture service unavailable",
          message: "Fixture service unavailable",
        };
      } else if (path.endsWith("supplier-enquiries"))
        body = {
          rows:
            m.view === "empty"
              ? []
              : m.rows.filter(
                  (row) =>
                    !url.searchParams.get("status") ||
                    row.status === url.searchParams.get("status"),
                ),
        };
      else if (path.endsWith("supplier-decline-enquiry"))
        m.rows = m.rows.map((row) =>
          row.enquiryId === payload.enquiryId
            ? { ...row, status: "declined" }
            : row,
        );
      else if (path.endsWith("supplier-start-quote-from-enquiry"))
        body = { quoteId: "quote-1" };
      else if (path.endsWith("supplier-notifications"))
        body = {
          notifications: m.view === "empty" ? [] : m.notifications,
          unread_count:
            m.view === "empty"
              ? 0
              : m.notifications.filter((n) => !n.read_at).length,
        };
      else if (path.endsWith("supplier-notifications-mark-read"))
        m.notifications = m.notifications.map((n) =>
          payload.all || payload.notificationIds?.includes(n.id)
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        );
      else if (path.endsWith("supplier-performance"))
        body = {
          performance:
            m.view === "empty" ? null : { typicalResponseHours: 4.5 },
        };
      else if (path.endsWith("/ranking"))
        body = {
          ranking:
            m.view === "empty"
              ? null
              : {
                  smoothed_acceptance: 0.4,
                  base_quality: 0.8,
                  response_score: 0.7,
                  activity_label: "Recently active",
                },
          tips:
            m.view === "empty"
              ? []
              : ["Keep your profile and images up to date."],
        };
      else if (path.endsWith("supplier-create-credit-checkout")) {
        status = 503;
        body = { error: "Fixture checkout unavailable" };
      } else if (path.endsWith("credit_transactions"))
        body =
          m.view === "empty"
            ? []
            : [
                {
                  id: "credit-1",
                  change: 25,
                  reason: "Credits purchased",
                  created_at: "2026-09-10T10:00:00Z",
                },
              ];
      else if (path.endsWith("supplier-public-profile"))
        body =
          m.view === "empty"
            ? { supplier: null }
            : {
                supplier: m.profile,
                media: m.media,
                categoryOptions: ["Catering", "Event staffing"],
              };
      else if (path.endsWith("supplier-public-profile-save")) {
        m.profile = { ...m.profile, ...payload };
        body = {
          supplier: m.profile,
          media: m.media,
          categoryOptions: ["Catering", "Event staffing"],
        };
      } else if (path.endsWith("supplier-upload-image")) {
        const image = { id: "uploaded-image", url: photo };
        if (payload.type === "hero") m.media.hero = image;
        else m.media.gallery.push(image);
        body = {
          supplier: m.profile,
          media: m.media,
          categoryOptions: ["Catering", "Event staffing"],
        };
      } else if (path.endsWith("supplier-delete-image")) {
        if (m.media.hero?.id === payload.imageId) m.media.hero = null;
        else
          m.media.gallery = m.media.gallery.filter(
            (i) => i.id !== payload.imageId,
          );
        body = { supplier: m.profile, media: m.media };
      } else if (path.endsWith("supplier-reorder-gallery")) {
        m.media.gallery = payload.orderedImageIds.map((id) =>
          m.media.gallery.find((i) => i.id === id),
        );
        body = { supplier: m.profile, media: m.media };
      }
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-range",
        "content-range": `0-0/${m.view === "empty" ? 0 : 4}`,
      };
      await route.fulfill({
        status,
        contentType: "application/json",
        headers,
        body: req.method() === "HEAD" ? "" : JSON.stringify(body),
      });
    },
  );
  return f;
}
const results = [];
async function go(f, route) {
  await f.page.goto(base + "/supplier/" + route);
  await f.page.locator("main.workspace-ui").waitFor();
}
async function ready(f, route) {
  if (route === "dashboard")
    await f.page.getByText("Credits purchased", { exact: true }).waitFor();
  if (route === "enquiries")
    await f.page
      .getByRole("button", { name: "Example Customer", exact: true })
      .waitFor();
  if (route === "notifications")
    await f.page
      .getByRole("button", { name: "Open New event request", exact: true })
      .waitFor();
  if (route === "listing")
    await f.page.getByLabel("Short description", { exact: true }).waitFor();
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
    })),
  );
  assert.deepEqual(violations, [], label + " accessibility");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert.equal(overflow, false, label + " horizontal overflow");
}
try {
  const f = await fixture();
  const chunks = [];
  f.page.on("request", (req) => {
    if (req.url().includes("/src/")) chunks.push(req.url());
  });
  for (const route of ["dashboard", "enquiries", "notifications", "listing"]) {
    await go(f, route);
    await ready(f, route);
    for (const width of [360, 768, 1024, 1440]) {
      await f.page.setViewportSize({ width, height: 1000 });
      await audit(f.page, `${route}-${width}`);
      await f.page.screenshot({
        path: `${output}/${route}-${width}.png`,
        fullPage: true,
      });
    }
    results.push(
      `${route}: 360/768/1024/1440; axe, overflow, populated layout`,
    );
  }
  assert.equal(
    chunks.some((url) =>
      /Supplier(Quotes|Bookings|Messages)\.jsx|\/pages\/admin\/|\/pages\/venue\//.test(
        url,
      ),
    ),
    false,
    "Excluded page code stays unloaded",
  );
  assert.deepEqual(f.errors, []);
  await f.context.close();
  // Request details retain all event fields; keyboard focus returns to the row.
  const e = await fixture();
  await go(e, "enquiries");
  await ready(e, "enquiries");
  const customer = e.page.getByRole("button", {
    name: "Example Customer",
    exact: true,
  });
  await customer.focus();
  await e.page.keyboard.press("Enter");
  await e.page.getByRole("dialog").waitFor();
  await audit(e.page, "Request details");
  for (const text of [
    "18:00",
    "£2,000–£3,000",
    "Please provide a seasonal menu",
  ])
    assert.ok((await e.page.getByRole("dialog").innerText()).includes(text));
  await e.page.keyboard.press("Escape");
  assert.equal(
    await customer.evaluate((el) => el === document.activeElement),
    true,
  );
  await e.page
    .getByRole("textbox", { name: "Search customer, venue, status or notes" })
    .fill("unmatched");
  await e.page.getByText("No enquiries found", { exact: true }).waitFor();
  await e.page
    .getByRole("textbox", { name: "Search customer, venue, status or notes" })
    .fill("");
  await e.page.getByLabel("Filter by status").selectOption("quoted");
  await e.page
    .getByRole("button", { name: "View quote", exact: true })
    .waitFor();
  assert.ok(
    await e.page
      .getByRole("button", { name: "Decline", exact: true })
      .isDisabled(),
  );
  await e.page.getByLabel("Filter by status").selectOption("invited");
  await customer.waitFor();
  e.mode.delay = 700;
  await e.page.getByRole("button", { name: "Decline", exact: true }).click();
  assert.ok(
    await e.page
      .getByRole("button", { name: "Create quote", exact: true })
      .isDisabled(),
  );
  await e.page.getByText("Enquiry declined.", { exact: true }).waitFor();
  assert.deepEqual(
    JSON.parse(
      e.requests.find((r) => r.url.includes("supplier-decline-enquiry")).body,
    ),
    { enquiryId: "enquiry-1" },
  );
  await e.page.getByLabel("Filter by status").selectOption("declined");
  await customer.waitFor();
  assert.ok(
    await e.page
      .getByRole("button", { name: "Create quote", exact: true })
      .isDisabled(),
  );
  await e.context.close();
  const q = await fixture();
  await go(q, "enquiries");
  await ready(q, "enquiries");
  await q.page
    .getByRole("button", { name: "Create quote", exact: true })
    .click();
  await q.page.waitForURL("**/supplier/quotes?open=quote-1");
  assert.deepEqual(
    JSON.parse(
      q.requests.find((r) =>
        r.url.includes("supplier-start-quote-from-enquiry"),
      ).body,
    ),
    { enquiryId: "enquiry-1" },
  );
  await q.page.locator("main.workspace-ui").waitFor();
  await q.context.close();
  results.push(
    "Requests: search, status filtering, quoted/declined disables, details/Escape/focus return, decline payload, original create-quote navigation",
  );
  const n = await fixture();
  await go(n, "notifications");
  await ready(n, "notifications");
  n.mode.delay = 700;
  await n.page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  assert.ok(
    await n.page
      .getByRole("button", { name: "Marking...", exact: true })
      .isDisabled(),
  );
  await n.page.getByText("Marked as read.", { exact: true }).waitFor();
  await n.page
    .getByRole("button", { name: "Mark all read", exact: true })
    .waitFor();
  assert.ok(
    await n.page
      .getByRole("button", { name: "Mark all read", exact: true })
      .isDisabled(),
  );
  assert.deepEqual(
    JSON.parse(n.requests.find((r) => r.url.includes("mark-read")).body),
    { all: true },
  );
  await n.context.close();
  const o = await fixture();
  await go(o, "notifications");
  await ready(o, "notifications");
  await o.page
    .getByRole("button", { name: "Open New event request", exact: true })
    .click();
  await o.page.waitForURL("**/supplier/enquiries");
  assert.deepEqual(
    JSON.parse(o.requests.find((r) => r.url.includes("mark-read")).body),
    { notificationIds: ["notification-1"] },
  );
  await o.context.close();
  results.push(
    "Notifications: mark all/single payloads, pending/zero-unread disables, original open destination",
  );
  const l = await fixture();
  await go(l, "listing");
  await ready(l, "listing");
  const short = l.page.getByLabel("Short description", { exact: true }),
    save = l.page.getByRole("button", { name: "Save changes", exact: true });
  assert.ok(await save.isDisabled());
  await short.fill("Unsaved copy");
  await l.page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await short.inputValue(), originalProfile.shortDescription);
  assert.equal(l.requests.filter((r) => r.method === "POST").length, 0);
  await l.page.getByLabel("Base postcode", { exact: true }).fill("BAD");
  await save.click();
  await l.page.getByRole("alert").first().waitFor();
  assert.equal(
    l.requests.filter((r) => r.url.includes("profile-save")).length,
    0,
  );
  assert.equal(
    await l.page
      .getByLabel("Base postcode", { exact: true })
      .getAttribute("aria-invalid"),
    "true",
  );
  await l.page.getByLabel("Base postcode", { exact: true }).fill("LA11AA");
  await short.fill("Updated seasonal menus for conferences and celebrations.");
  l.mode.delay = 700;
  l.mode.failSave = true;
  await save.click();
  assert.ok(
    await l.page
      .getByRole("button", { name: "Saving...", exact: true })
      .isDisabled(),
  );
  await l.page
    .getByText("Fixture service unavailable", { exact: true })
    .waitFor();
  assert.ok((await short.inputValue()).startsWith("Updated"));
  l.mode.failSave = false;
  await save.click();
  await l.page.getByText("Listing updated.", { exact: true }).waitFor();
  const saved = JSON.parse(
    l.requests.filter((r) => r.url.includes("profile-save")).at(-1).body,
  );
  const { name: _name, slug: _slug, ...expectedFields } = originalProfile;
  assert.deepEqual(saved, {
    ...expectedFields,
    shortDescription:
      "Updated seasonal menus for conferences and celebrations.",
    basePostcode: "LA1 1AA",
  });
  assert.ok(_name && _slug);
  await l.context.close();
  results.push(
    "Listing: labels, initial/save pending disabled states, local Cancel, unchanged postcode validation, failed save retains draft, exact save payload",
  );
  // Media mutations preserve their exact contracts and keyboard-accessible controls.
  const media = await fixture();
  await go(media, "listing");
  await ready(media, "listing");
  assert.ok(
    await media.page
      .getByRole("button", { name: "Move gallery image 1 up", exact: true })
      .isDisabled(),
  );
  await Promise.all([
    media.page.waitForResponse((r) =>
      r.url().includes("supplier-reorder-gallery"),
    ),
    media.page
      .getByRole("button", { name: "Move gallery image 1 down", exact: true })
      .click(),
  ]);
  assert.deepEqual(
    JSON.parse(
      media.requests.find((r) => r.url.includes("supplier-reorder-gallery"))
        .body,
    ),
    { orderedImageIds: ["image-2", "image-1"] },
  );
  await media.page.getByLabel("Upload hero image", { exact: true }).focus();
  assert.equal(
    await media.page
      .getByLabel("Upload hero image", { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMXsAAAAASUVORK5CYII=",
    "base64",
  );
  media.mode.delay = 700;
  await media.page
    .getByLabel("Upload hero image", { exact: true })
    .setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
  assert.ok(
    await media.page.getByLabel("Uploading...", { exact: true }).isDisabled(),
  );
  await media.page.getByText("Hero image updated.", { exact: true }).waitFor();
  const upload = JSON.parse(
    media.requests.find((r) => r.url.includes("supplier-upload-image")).body,
  );
  assert.deepEqual(upload, {
    type: "hero",
    mimeType: "image/png",
    fileName: "test.png",
    dataBase64: "data:image/png;base64," + png.toString("base64"),
  });
  await media.page
    .getByLabel("Add gallery image", { exact: true })
    .setInputFiles({ name: "gallery.png", mimeType: "image/png", buffer: png });
  await media.page
    .getByText("Gallery image uploaded.", { exact: true })
    .waitFor();
  assert.equal(
    JSON.parse(
      media.requests
        .filter((r) => r.url.includes("supplier-upload-image"))
        .at(-1).body,
    ).type,
    "gallery",
  );
  await media.page
    .getByRole("button", { name: "Delete gallery image 1", exact: true })
    .click();
  await media.page.getByText("Image removed.", { exact: true }).waitFor();
  assert.equal(
    JSON.parse(
      media.requests
        .filter((r) => r.url.includes("supplier-delete-image"))
        .at(-1).body,
    ).imageId,
    "image-2",
  );
  await media.page
    .getByRole("button", { name: "Delete hero image", exact: true })
    .click();
  await media.page
    .getByRole("heading", { name: "No hero image", exact: true })
    .waitFor();
  assert.equal(
    JSON.parse(
      media.requests
        .filter((r) => r.url.includes("supplier-delete-image"))
        .at(-1).body,
    ).imageId,
    "uploaded-image",
  );
  await media.page
    .getByLabel("Upload hero image", { exact: true })
    .setInputFiles({
      name: "test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("test"),
    });
  await media.page
    .getByText("Only JPG, PNG, or WEBP images are allowed.", { exact: true })
    .waitFor();
  await media.page
    .getByLabel("Upload hero image", { exact: true })
    .setInputFiles({
      name: "large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
  await media.page
    .getByText("Image must be 5MB or smaller.", { exact: true })
    .waitFor();
  assert.equal(
    media.requests.filter((r) => r.url.includes("supplier-upload-image"))
      .length,
    2,
  );
  await media.page
    .getByLabel("New service", { exact: true })
    .fill("Table service");
  await media.page.getByRole("button", { name: "Add", exact: true }).click();
  await media.page
    .getByRole("button", { name: "Remove Table service", exact: true })
    .click();
  await media.page.getByLabel("Event staffing", { exact: true }).check();
  assert.ok(
    await media.page
      .getByRole("button", { name: "Save changes", exact: true })
      .isEnabled(),
  );
  await media.page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await media.page.getByLabel("Event staffing", { exact: true }).isChecked(),
    false,
  );
  assert.deepEqual(media.errors, []);
  await media.context.close();
  results.push(
    "Listing media: focusable uploads, JPG/PNG/WEBP and 5MB validation, busy upload disables, hero/gallery uploads, reorder boundaries/order payload, delete payloads; services/categories and Cancel",
  );
  for (const route of ["dashboard", "enquiries", "notifications", "listing"]) {
    for (const state of ["loading", "empty", "error"]) {
      const s = await fixture();
      s.mode.view = state;
      if (state === "loading") s.mode.delay = 6000;
      await go(s, route);
      if (state === "loading")
        await s.page
          .locator('main [role="status"], main [aria-busy="true"]')
          .first()
          .waitFor();
      else if (state === "error")
        await s.page.getByRole("alert").first().waitFor();
      else if (route === "dashboard")
        await s.page
          .getByRole("heading", { name: "No recent activity", exact: true })
          .waitFor();
      else
        await s.page
          .getByRole("heading", {
            name:
              route === "listing"
                ? "Listing unavailable"
                : route === "notifications"
                  ? "No notifications"
                  : "No enquiries found",
            exact: true,
          })
          .waitFor();
      for (const width of [360, 768, 1024, 1440]) {
        await s.page.setViewportSize({ width, height: 1000 });
        if (state !== "loading")
          await audit(s.page, `${route}-${state}-${width}`);
        else
          assert.equal(
            await s.page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            ),
            false,
          );
        if (width === 360)
          await s.page.screenshot({
            path: `${output}/${route}-${state}-360.png`,
            fullPage: true,
          });
      }
      if (route === "dashboard" && state === "error")
        assert.equal(
          await s.page
            .locator(".ew-metrics .ew-metric strong")
            .allTextContents()
            .then((values) => values.slice(0, 3).every((v) => v === "—")),
          true,
          "Failed counts are unavailable, not zero",
        );
      if (route === "dashboard" && state === "empty")
        assert.equal(
          await s.page
            .locator("#performance dd")
            .allTextContents()
            .then((values) => values.filter((v) => v === "—").length),
          4,
          "Missing ranking metrics are unavailable, not zero",
        );
      if (route === "notifications" && state !== "loading")
        assert.ok(
          await s.page
            .getByRole("button", { name: "Mark all read", exact: true })
            .isDisabled(),
        );
      if (state === "error") {
        s.mode.view = "populated";
        if (route === "dashboard")
          await s.page
            .getByRole("button", { name: "Refresh", exact: true })
            .click();
        else
          await s.page
            .getByRole("button", { name: "Retry", exact: true })
            .click();
        await ready(s, route);
      }
      assert.deepEqual(s.errors, []);
      await s.context.close();
    }
  }
  results.push(
    "All four pages: loading/empty/error at 360/768/1024/1440, retry recovery; unavailable dashboard counts/scores never become false zeroes",
  );
  const d = await fixture();
  await go(d, "dashboard");
  await ready(d, "dashboard");
  d.mode.delay = 700;
  await d.page
    .getByRole("button", { name: "25 credits - GBP 12.50", exact: true })
    .click();
  assert.ok(
    await d.page
      .getByRole("button", { name: "50 credits - GBP 25.00", exact: true })
      .isDisabled(),
  );
  await d.page
    .getByText("Fixture checkout unavailable", { exact: true })
    .waitFor();
  assert.deepEqual(
    JSON.parse(
      d.requests.find((r) => r.url.includes("supplier-create-credit-checkout"))
        .body,
    ),
    { bundle: "credits_25" },
  );
  await d.page
    .getByRole("button", { name: "50 credits - GBP 25.00", exact: true })
    .click();
  await d.page
    .getByText("Fixture checkout unavailable", { exact: true })
    .waitFor();
  assert.deepEqual(
    JSON.parse(
      d.requests
        .filter((r) => r.url.includes("supplier-create-credit-checkout"))
        .at(-1).body,
    ),
    { bundle: "credits_50" },
  );
  await d.page.setViewportSize({ width: 360, height: 1000 });
  const menu = d.page.getByRole("button", {
    name: "Open workspace navigation",
    exact: true,
  });
  await menu.focus();
  await d.page.keyboard.press("Enter");
  await d.page.getByRole("dialog").waitFor();
  await audit(d.page, "Mobile navigation");
  await d.page.keyboard.press("Escape");
  assert.equal(
    await menu.evaluate((el) => el === document.activeElement),
    true,
  );
  await d.page.keyboard.press("Control+k");
  await d.page.getByRole("dialog").waitFor();
  await d.page.getByLabel("Search workspace pages").fill("Listing");
  await d.page
    .getByRole("dialog")
    .getByRole("link", { name: "Listing / profile", exact: true })
    .click();
  await d.page.waitForURL("**/supplier/listing");
  await d.page
    .getByRole("button", { name: "Open account menu", exact: true })
    .click();
  await d.page.getByRole("menu").waitFor();
  await d.page.keyboard.press("Escape");
  await d.context.close();
  results.push(
    "Credit bundles: unchanged payloads/prices, checkout failure/pending states; mobile Radix drawer/Escape/focus return, command search and account menu keyboard controls",
  );
  for (const options of [
    { signedIn: false },
    { role: "admin" },
    { role: "customer" },
    { role: "venue_owner" },
  ]) {
    for (const route of [
      "dashboard",
      "enquiries",
      "notifications",
      "listing",
    ]) {
      const g = await fixture(options);
      await g.page.goto(base + "/supplier/" + route);
      await g.page.waitForURL((url) => !url.pathname.startsWith("/supplier/"));
      const expected =
        options.signedIn === false
          ? "/login"
          : options.role === "admin"
            ? "/admin/"
            : options.role === "customer"
              ? "/customer"
              : "/venue";
      assert.ok(new URL(g.page.url()).pathname.startsWith(expected));
      assert.equal(
        g.requests.some((r) => /\/api\/supplier[-/]/.test(r.url)),
        false,
      );
      await g.context.close();
    }
  }
  const onboarding = await fixture({
    respond: ({ url }) =>
      url.pathname.endsWith("/suppliers")
        ? {
            id: "supplier-1",
            business_name: "Example incomplete profile",
            onboarding_status: "draft",
            is_published: false,
          }
        : undefined,
  });
  await onboarding.page.goto(base + "/supplier/listing");
  await onboarding.page.waitForURL("**/suppliers/onboarding");
  assert.equal(
    onboarding.requests.some((r) => r.url.includes("supplier-public-profile")),
    false,
  );
  await onboarding.context.close();
  results.push(
    "Role guards: signed out/Admin/Customer/Venue blocked from all four Supplier routes; incomplete Supplier still redirects to onboarding",
  );

  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
