/* global process, console, setTimeout */
// All API/Supabase requests use browser-local fixtures; no production mutations.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.ADMIN_SCREENSHOTS || "/tmp/eventwow-admin-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const fixture = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const application = {
  id: "supplier-1",
  business_name: "Example Event Catering",
  slug: "example-event-catering",
  onboarding_status: "pending_review",
  public_email: "catering@example.test",
  public_phone: "07000000000",
  location_label: "Manchester and the North West",
  listing_categories: ["Catering"],
  short_description: "Seasonal menus for conferences and celebrations.",
  submitted_at: "2026-09-10T10:30:00Z",
};
const category = {
  id: "category-1",
  display_name: "Catering",
  slug: "catering",
  short_description: "Food for every occasion",
  is_featured: true,
  featured_order: 1,
  is_active: true,
};
function respond({ url, request, empty, mode }) {
  const path = url.pathname,
    catchall = url.searchParams.get("path");
  if (mode.state === "missing") {
    if (path.endsWith("/suppliers") && url.searchParams.has("id")) return null;
    if (path.endsWith("admin-venues") && url.searchParams.has("venueId"))
      return { venue: null };
    if (catchall?.startsWith("enquiries/"))
      return { enquiry: null, invites: [] };
  }

  if (
    path.endsWith("/quotes") &&
    (request.method() === "POST" || mode.quoteDraft)
  ) {
    mode.quoteDraft = true;
    return { id: "quote-1", status: "draft", total_amount: 0 };
  }
  if (path.endsWith("/ranking")) return null;

  if (path.endsWith("/applications"))
    return { rows: empty ? [] : [application] };
  if (path.endsWith("/venue-claims"))
    return {
      rows: empty
        ? []
        : [
            {
              id: "claim-1",
              venue_name: "Example Assembly Rooms",
              venue_slug: "example-assembly-rooms",
              requester_name: "Example Manager",
              requester_email: "manager@example.test",
              role_at_venue: "General manager",
              message: "Please review our venue ownership request.",
              status: "pending",
              created_at: "2026-09-10T10:30:00Z",
            },
          ],
    };
  if (catchall === "reviews")
    return {
      rows: empty
        ? []
        : [
            {
              id: "review-1",
              supplierName: application.business_name,
              rating: 5,
              reviewerName: "Example Customer",
              reviewText:
                "A thoughtful menu and a helpful team throughout our event.",
            },
          ],
    };
  if (catchall === "categories")
    return request.method() === "POST"
      ? { row: category }
      : { rows: empty ? [] : [category] };
  if (path === "/api/admin/categories/category-1")
    return { row: category, image_url: "/assets/placeholders/catering.svg" };
  if (path.endsWith("/generate-hero-images"))
    return request.method() === "GET"
      ? {
          missingCount: empty ? 0 : 1,
          preview: empty
            ? []
            : [
                {
                  venueId: "venue-1",
                  name: "Example Assembly Rooms",
                  town: "Manchester",
                  status: "queued",
                },
              ],
        }
      : {
          results: [{ venueId: "venue-1", status: "skipped" }],
          processed: 1,
          saved: 0,
          skipped: 1,
          errors: [],
        };
  if (path.endsWith("/listing"))
    return {
      supplier: {
        isPublished: false,
        shortDescription: "Seasonal menus for events",
        about: "A catering team for conferences and celebrations.",
        locationLabel: "Manchester",
        services: ["Corporate catering"],
        categories: ["Catering"],
      },
      media: { hero: null, gallery: [] },
      categoryOptions: ["Catering", "Entertainment"],
      gate: { canPublish: true, reasons: [] },
    };
  if (path.endsWith("admin-venues") && url.searchParams.has("venueId"))
    return {
      venue: {
        name: "Example Assembly Rooms",
        slug: "example-assembly-rooms",
        city: "Manchester",
        postcode: "M1 1AA",
        guestMin: 20,
        guestMax: 150,
        shortDescription: "A bright room for events",
        about: "Flexible space for conferences and celebrations.",
        type: "Event space",
        gallery: [],
      },
      venueTypes: [{ id: "type-1", name: "Event space" }],
      suppliers: [{ id: "supplier-1", name: application.business_name }],
      linkedSupplierIds: ["supplier-1"],
    };
  if (catchall?.startsWith("enquiries/"))
    return {
      enquiry: {
        id: "enquiry-1",
        status: "new",
        match_source: "concierge",
        event_date: "2026-12-12",
        event_postcode: "M1 1AA",
        event_type: "Corporate",
        customers: {
          full_name: "Example Customer",
          email: "customer@example.test",
        },
        message: "Lunch for our annual conference",
      },
      invites: [
        {
          id: "invite-1",
          supplier_id: "supplier-1",
          supplier_status: "invited",
          suppliers: { business_name: application.business_name },
        },
      ],
    };
}
const routes = [
  ["applications", "/admin/supplier-applications", "Supplier Applications"],
  ["claims", "/admin/venue-claims", "Venue claims"],
  ["reviews", "/admin/reviews", "Reviews"],
  ["categories", "/admin/categories", "Categories"],
  ["ledger", "/admin/credits-ledger", "Credits Ledger"],
  ["performance", "/admin/performance", "Supplier Performance"],
  ["hero-images", "/admin/venues/hero-images", "Venue Hero Images"],
];
const results = [];
async function settle(page) {
  await page.waitForFunction(
    () =>
      !document.querySelector(".ew-admin-skeleton") &&
      !Array.from(document.querySelectorAll('[role="status"]')).some((e) =>
        /Loading venues/.test(e.textContent),
      ),
  );
  await page.evaluate(() => document.fonts.ready);
}
async function ready(page, path, title) {
  await page.goto(base + path);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await settle(page);
}
async function check(page, name) {
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${name} overflows at ${width}`,
    );
    assert(
      await page
        .locator('[role="dialog"]')
        .evaluateAll((elements) =>
          elements.every((e) => e.scrollWidth <= e.clientWidth),
        ),
      `${name}: dialog overflows`,
    );
    await page.screenshot({
      path: `${output}/${name}-${width}.png`,
      fullPage: (await page.getByRole("dialog").count()) === 0,
    });
  }
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () =>
    (
      await window.axe.run({
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })),
  );
  assert.deepEqual(violations, [], `${name}: accessibility`);
  results.push(
    `${name}: 360/768/1024/1440px, no page overflow, axe WCAG A/AA checks passed`,
  );
}
async function mutation(f, button, predicate) {
  f.mode.mutationDelay = 450;
  const before = f.requests.length;
  const element = await button.elementHandle();
  await button.click();
  await element
    .isDisabled()
    .then((v) => assert(v, "Action must disable during request"));
  await f.page.waitForTimeout(550);
  assert(
    f.requests.slice(before).some(predicate),
    "Expected unchanged request payload",
  );
  f.mode.mutationDelay = 0;
  await settle(f.page);
}
try {
  const f = await fixture({ respond });
  for (const [name, path, title] of routes) {
    console.log(`Checking ${name}`);
    await ready(f.page, path, title);
    await check(f.page, name);
  }
  await ready(f.page, "/admin/supplier-applications", "Supplier Applications");
  await f.page.getByLabel("Optional internal note").fill("Reviewed profile");
  await mutation(
    f,
    f.page.getByRole("button", { name: "Publish", exact: true }),
    (r) =>
      r.url.endsWith("/publish") &&
      JSON.parse(r.body).adminNotes === "Reviewed profile",
  );
  await mutation(
    f,
    f.page.getByRole("button", { name: "Reject", exact: true }),
    (r) =>
      r.url.endsWith("/reject") &&
      JSON.parse(r.body).supplierId === "supplier-1",
  );
  await ready(f.page, "/admin/venue-claims", "Venue claims");
  for (const action of ["Approve", "Reject"])
    await mutation(
      f,
      f.page.getByRole("button", { name: action, exact: true }),
      (r) =>
        r.url.endsWith(`/claim-1/${action.toLowerCase()}`) &&
        r.method === "POST",
    );
  for (const action of ["Approve", "Reject"]) {
    await ready(f.page, "/admin/reviews", "Reviews");
    await mutation(
      f,
      f.page.getByRole("button", { name: action, exact: true }),
      (r) =>
        r.method === "PATCH" &&
        JSON.parse(r.body).action === action.toLowerCase(),
    );
    await f.page.getByText("No pending reviews", { exact: true }).waitFor();
  }
  results.push(
    "Supplier publish/reject with notes, venue claim approve/reject, review approve/reject: unchanged requests and disabled states",
  );
  await ready(f.page, "/admin/categories", "Categories");
  await f.page.setViewportSize({ width: 768, height: 1000 });
  const tableEdit = f.page.getByRole("button", { name: "Edit", exact: true });
  await tableEdit.focus();
  assert(
    await tableEdit.evaluate(
      (button) => button.closest(".overflow-x-auto").scrollLeft > 0,
    ),
    "Wide table actions must scroll into view for keyboard users",
  );
  await f.page.setViewportSize({ width: 1440, height: 1000 });

  await f.page
    .getByRole("button", { name: "Add category", exact: true })
    .click();
  let dialog = f.page.getByRole("dialog");
  assert(
    await dialog
      .getByRole("button", { name: "Save", exact: true })
      .isDisabled(),
  );
  await dialog
    .getByLabel("Display name", { exact: true })
    .fill("Conference catering");
  await dialog
    .getByLabel("Short description", { exact: true })
    .fill("Menus for business events");
  await check(f.page, "category-create");
  await mutation(
    f,
    dialog.getByRole("button", { name: "Save", exact: true }),
    (r) =>
      r.method === "POST" &&
      JSON.parse(r.body).display_name === "Conference catering",
  );
  await f.page.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog
    .getByLabel("Short description", { exact: true })
    .fill("Updated description");
  await check(f.page, "category-edit");
  await mutation(
    f,
    dialog.getByRole("button", { name: "Save", exact: true }),
    (r) =>
      r.method === "PATCH" &&
      JSON.parse(r.body).short_description === "Updated description",
  );
  await f.page.getByRole("button", { name: "Edit", exact: true }).click();
  await f.page.keyboard.press("Escape");
  assert.equal(
    await f.page.evaluate(() => document.activeElement.textContent),
    "Edit",
  );
  await mutation(
    f,
    f.page.getByLabel("Feature Catering", { exact: true }),
    (r) => r.method === "PATCH" && JSON.parse(r.body).is_featured === false,
  );
  await f.page.getByRole("button", { name: "Edit", exact: true }).click();
  f.mode.failMutation = true;
  await f.page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await f.page.getByRole("dialog").getByRole("alert").waitFor();
  f.mode.failMutation = false;
  await f.page.keyboard.press("Escape");
  results.push(
    "Category create/edit: validation, save payloads, busy toggle, save failure, Radix Escape and focus restoration",
  );
  await ready(f.page, "/admin/credits-ledger", "Credits Ledger");
  await f.page.locator('tr[tabindex="0"]').first().focus();
  await f.page.keyboard.press("Enter");
  await f.page.getByRole("dialog").waitFor();
  await check(f.page, "ledger-detail");
  await f.page.keyboard.press("Escape");
  const download = f.page.waitForEvent("download");
  await f.page.getByRole("button", { name: "Export CSV" }).click();
  assert.equal((await download).suggestedFilename(), "credits-ledger.csv");
  results.push("Ledger keyboard detail dialog and CSV export");
  await ready(f.page, "/admin/venues/hero-images", "Venue Hero Images");
  await f.page.getByLabel("Dry run", { exact: true }).check();
  await mutation(
    f,
    f.page.getByRole("button", { name: "Generate Missing Hero Images" }),
    (r) => r.method === "POST" && JSON.parse(r.body).dryRun === true,
  );
  await f.page.getByText("Hero image generation batch completed.").waitFor();
  results.push(
    "Hero image dry run: unchanged payload, running and completion feedback",
  );
  await ready(f.page, "/admin/suppliers", "Suppliers");
  await f.page
    .getByRole("button", { name: "Create supplier", exact: true })
    .click();
  await check(f.page, "supplier-create");
  await f.page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await f.page.getByRole("alert").waitFor();
  await f.page.keyboard.press("Escape");

  await f.page
    .getByRole("button", { name: application.business_name, exact: true })
    .click();
  await f.page.getByRole("heading", { name: "Supplier detail" }).waitFor();
  await settle(f.page);
  await check(f.page, "supplier-detail");
  await f.page
    .getByRole("button", { name: "Adjust credits", exact: true })
    .click();
  await dialog.waitFor();
  assert(
    await dialog
      .getByRole("button", { name: "Confirm", exact: true })
      .isDisabled(),
  );
  await check(f.page, "supplier-credit-adjust");
  await f.page.keyboard.press("Escape");
  await ready(f.page, "/admin/venues/venue-1", "Edit venue");
  await check(f.page, "venue-detail");
  await f.page
    .getByLabel("Venue name", { exact: true })
    .fill("Updated Assembly Rooms");
  await mutation(
    f,
    f.page.getByRole("button", { name: "Save changes", exact: true }).first(),
    (r) => r.url.endsWith("admin-venue-save") && r.method === "POST",
  );
  await f.page
    .getByRole("button", { name: "AI Draft Venue", exact: true })
    .click();
  await check(f.page, "venue-ai-builder");
  assert(
    await f.page
      .getByRole("dialog")
      .getByRole("button", { name: "Save Draft", exact: true })
      .isDisabled(),
  );
  await f.page.keyboard.press("Escape");
  await ready(f.page, "/admin/venues", "Venues");
  await f.page.locator("summary").filter({ hasText: "Create venue" }).click();
  await f.page
    .getByRole("button", { name: "Bulk Add Venues (AI)", exact: true })
    .click();
  await f.page
    .getByLabel("Venue CSV data")
    .fill(
      "name,url,town,type\nConference Hall,https://example.test,Manchester,Event space",
    );
  await f.page
    .getByRole("button", { name: "Preview CSV", exact: true })
    .click();
  await check(f.page, "venue-bulk-preview");
  await f.page.keyboard.press("Escape");
  results.push(
    "Supplier create validation, AI builder disabled actions, venue CSV preview and dialog layouts",
  );
  await ready(f.page, "/admin/enquiries", "Enquiries");
  await f.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .click();
  await f.page.getByRole("heading", { name: "Enquiry detail" }).waitFor();
  await settle(f.page);
  await check(f.page, "enquiry-detail");
  await mutation(
    f,
    f.page.getByRole("button", { name: "Mark viewed", exact: true }),
    (r) =>
      r.url.includes("enquiry_suppliers") &&
      r.method === "PATCH" &&
      JSON.parse(r.body).supplier_status === "viewed",
  );
  await f.page
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await f.page.getByRole("button", { name: "Send", exact: true }).waitFor();
  assert(
    await f.page
      .getByRole("button", { name: "Accept", exact: true })
      .isDisabled(),
  );
  await check(f.page, "enquiry-quote-draft");

  await f.page
    .getByRole("button", { name: "Back to enquiries", exact: true })
    .click();
  await f.page
    .getByRole("button", { name: "Create enquiry", exact: true })
    .click();
  await check(f.page, "enquiry-create");
  results.push(
    "Supplier/venue/enquiry detail and enquiry create forms; disabled credit confirmation; venue save request",
  );
  for (const [path, title, action] of [
    ["/admin/supplier-applications", "Supplier Applications", "Publish"],
    ["/admin/venue-claims", "Venue claims", "Approve"],
    ["/admin/reviews", "Reviews", "Approve"],
  ]) {
    await ready(f.page, path, title);
    f.mode.failMutation = true;
    await f.page.getByRole("button", { name: action, exact: true }).click();
    await f.page.getByRole("alert").waitFor();
    assert(
      (await f.page.getByRole("alert").textContent()).includes(
        "Fixture save unavailable",
      ),
    );
    f.mode.failMutation = false;
    await f.page.getByRole("button", { name: "Retry", exact: true }).click();
    await settle(f.page);
    await f.page.getByRole("button", { name: action, exact: true }).waitFor();
  }
  results.push(
    "Moderation request failures surface an error and recover through Retry",
  );
  assert.deepEqual(f.errors, [], "Browser runtime errors");
  await f.context.close();
  for (const [name, listPath, listTitle, buttonName, detailPath] of [
    [
      "supplier-detail",
      "/admin/suppliers",
      "Suppliers",
      application.business_name,
    ],
    ["enquiry-detail", "/admin/enquiries", "Enquiries", "Example Customer"],
    ["venue-detail", "/admin/venues", "Venues", null, "/admin/venues/venue-1"],
  ]) {
    for (const state of ["loading", "error", "missing"]) {
      const detail = await fixture({ respond });
      await ready(detail.page, listPath, listTitle);
      detail.mode.state = state;
      await detail.page.setViewportSize({ width: 360, height: 900 });
      if (detailPath) await detail.page.goto(base + detailPath);
      else
        await detail.page
          .getByRole("button", { name: buttonName, exact: true })
          .click();
      if (state === "loading")
        await detail.page.locator(".ew-admin-skeleton").first().waitFor();
      else {
        if (state === "missing")
          await detail.page.locator(".ew-empty").waitFor();
        else await detail.page.getByRole("alert").first().waitFor();
        assert.equal(
          await detail.page.getByRole("button", { name: /^Save/ }).count(),
          0,
          "Failed initial loads must not expose Save",
        );
        assert.equal(
          await detail.page.locator(".ew-metric").count(),
          0,
          "Failed detail loads must not show default metrics",
        );
      }
      await detail.page.screenshot({
        path: `${output}/${name}-${state}.png`,
        fullPage: true,
      });
      assert.deepEqual(detail.errors, []);
      await detail.context.close();
    }
  }
  results.push(
    "Supplier, enquiry and venue detail: loading/error/not-found feedback verified at mobile width; unavailable records do not expose Save or default metrics",
  );
  for (const state of ["loading", "empty", "error"]) {
    const s = await fixture({ respond, state });
    for (const [name, path, title] of routes) {
      console.log(`Checking ${name}: ${state}`);
      await s.page.goto(base + path);
      await s.page.getByRole("heading", { name: title, exact: true }).waitFor();
      if (state === "loading")
        await s.page
          .locator('.ew-admin-skeleton,[role="status"]')
          .first()
          .waitFor();
      else {
        await settle(s.page);
        if (state === "error") await s.page.getByRole("alert").waitFor();
        else await s.page.locator(".ew-empty").waitFor();
      }
      await s.page.setViewportSize({ width: 360, height: 900 });
      await s.page.screenshot({
        path: `${output}/${name}-${state}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(s.errors, []);
    await s.context.close();
    results.push(`All seven supporting routes: ${state} state verified`);
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
