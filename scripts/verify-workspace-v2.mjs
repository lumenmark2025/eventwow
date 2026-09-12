/* global process, Buffer */
// Isolated browser fixtures. No requests reach a real Supabase project or backend.
// Run against Vite configured with VITE_SUPABASE_URL=http://127.0.0.1:54321
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";

const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output =
  process.env.WORKSPACE_SCREENSHOTS || "/tmp/eventwow-workspace-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const axeSource = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const results = [];
const fixture = workspaceFixtures(browser, base);

async function ready(page, route) {
  await page.goto(`${base}${route}`);
  await page.locator(".ew-main h1").waitFor();
  if (route !== "/design-system")
    await page.waitForFunction(
      () =>
        !document.querySelector('[aria-busy="true"]') &&
        !Array.from(document.querySelectorAll('[role="status"]')).some(
          (element) => /Loading records/.test(element.textContent),
        ),
    );
  await page.evaluate(() => document.fonts.ready);
}
async function checkLayout(page, name, width) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name}: page overflows at ${width}`,
  );
  assert.equal(
    await page
      .locator(".ew-topbar")
      .evaluate((element) => element.getBoundingClientRect().height),
    64,
  );
  assert.equal(
    await page
      .locator(".ew-main")
      .evaluate((element) => parseFloat(getComputedStyle(element).marginLeft)),
    width >= 1024 ? 240 : 0,
  );
  await page.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
  });
}
try {
  const f = await fixture();
  for (const [name, route] of [
    ["dashboard", "/admin/dashboard"],
    ["enquiries", "/admin/enquiries"],
    ["suppliers", "/admin/suppliers"],
    ["venues", "/admin/venues"],
    ["design-system", "/design-system"],
  ]) {
    console.log(`Checking ${name}`);
    await ready(f.page, route);
    for (const width of [360, 768, 1024, 1440]) {
      await f.page.setViewportSize({ width, height: 1000 });
      await checkLayout(f.page, name, width);
    }
    await f.page.addScriptTag({ content: axeSource });
    const violations = await f.page.evaluate(async () =>
      (
        await window.axe.run(document.querySelector(".ew-shell"), {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map((v) => ({
        id: v.id,
        elements: v.nodes.map((n) => n.html),
      })),
    );
    assert.deepEqual(violations, [], `${name}: accessibility failures`);
    results.push(
      `${name}: populated at 360/768/1024/1440, no overflow, shared geometry`,
    );
  }
  await f.page
    .getByRole("button", { name: "Open dialog", exact: true })
    .click();
  await f.page.getByRole("dialog").waitFor();
  for (let index = 0; index < 8; index++) {
    await f.page.keyboard.press("Tab");
    assert(
      await f.page.evaluate(() =>
        document
          .querySelector('[role="dialog"]')
          .contains(document.activeElement),
      ),
      "Dialog focus escapes",
    );
  }
  await f.page.keyboard.press("Escape");
  assert.equal(
    await f.page.evaluate(() => document.activeElement.textContent),
    "Open dialog",
    "Dialog must restore opener focus",
  );
  await f.page.keyboard.press("Control+k");
  await f.page.getByLabel("Search workspace pages").fill("enquiries");
  await f.page
    .getByRole("dialog")
    .getByRole("link", { name: "Enquiries", exact: true })
    .click();
  await f.page.waitForURL("**/admin/enquiries");
  await f.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .waitFor();
  await f.page
    .getByRole("textbox", { name: "Search customer, postcode or venue…" })
    .fill("no-match");
  await f.page.getByText("No matching enquiries", { exact: true }).waitFor();
  await f.page
    .getByRole("textbox", { name: "Search customer, postcode or venue…" })
    .fill("");
  await f.page.getByLabel("Filter by status").selectOption("quoted");
  assert.equal(
    await f.page
      .getByRole("button", { name: "Example Customer", exact: true })
      .count(),
    0,
  );
  await f.page.getByLabel("Filter by status").selectOption("all");
  await f.page
    .getByRole("button", { name: "Example Customer", exact: true })
    .focus();
  await f.page.keyboard.press("Enter");
  await f.page
    .getByRole("heading", { name: "Enquiry detail", exact: true })
    .waitFor();
  await f.page
    .getByRole("button", { name: "Back to enquiries", exact: true })
    .click();
  await f.page
    .getByRole("button", { name: "Create enquiry", exact: true })
    .click();
  await f.page.getByPlaceholder("Full name *").fill("Created Example");
  await f.page.getByPlaceholder("Email *").fill("created@example.test");
  await f.page.getByPlaceholder("Phone *").fill("07000000000");
  await f.page.locator('input[type="date"]').fill("2026-12-20");
  await f.page.getByPlaceholder("Event postcode *").fill("M1 1AA");
  await f.page.getByRole("checkbox").first().check();
  await f.page
    .getByRole("button", { name: "Create enquiry + invite suppliers" })
    .click();
  await f.page
    .getByRole("heading", { name: "Enquiries", exact: true })
    .waitFor();
  assert(
    f.requests.some(
      (request) =>
        request.method === "POST" && request.url.includes("enquiry_suppliers"),
    ),
    "Enquiry invite payload not sent",
  );
  results.push(
    "Enquiries: search, status filter, keyboard detail, back and creation payload retained (fixture)",
  );

  await ready(f.page, "/admin/suppliers");
  await f.page
    .getByRole("textbox", { name: "Search name, slug, city or postcode…" })
    .fill("Lancaster");
  assert.equal(await f.page.locator(".ew-data-table tbody tr").count(), 1);
  await f.page
    .getByRole("button", { name: "Create supplier", exact: true })
    .click();
  await f.page.getByLabel("Business name *").fill("Created Example Supplier");
  await f.page.getByLabel("Login email *").fill("supplier@example.test");
  await f.page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await f.page
    .getByRole("heading", { name: "Supplier detail", exact: true })
    .waitFor();
  const created = f.requests.find((request) =>
    request.url.endsWith("admin-create-supplier"),
  );
  assert.equal(
    JSON.parse(created.body).business_name,
    "Created Example Supplier",
  );
  results.push(
    "Suppliers: local filtering, create dialog, unchanged creation payload, editor opens (fixture)",
  );

  await ready(f.page, "/admin/venues");
  await f.page.getByLabel("Filter by status").selectOption("hidden");
  assert.equal(await f.page.locator(".ew-data-table tbody tr").count(), 1);
  await f.page
    .getByRole("button", { name: "Delete Example Riverside Hall" })
    .click();
  await f.page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert(!f.requests.some((request) => request.method === "DELETE"));
  await f.page
    .getByRole("button", { name: "Delete Example Riverside Hall" })
    .click();
  await f.page
    .getByRole("button", { name: "Delete draft", exact: true })
    .click();
  await f.page
    .getByText("Deleted draft: Example Riverside Hall.", { exact: true })
    .waitFor();
  assert(
    f.requests.some(
      (request) =>
        request.method === "DELETE" && request.url.endsWith("/drafts/venue-2"),
    ),
  );
  await f.page.locator("summary").filter({ hasText: "Create venue" }).click();
  await f.page
    .getByLabel("Venue name", { exact: true })
    .fill("Created Example Venue");
  await f.page.getByRole("button", { name: "Create", exact: true }).click();
  await f.page.waitForURL("**/admin/venues/venue-1");
  await f.page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .waitFor();
  assert(
    f.requests.some(
      (request) =>
        request.url.endsWith("admin-venue-save") &&
        JSON.parse(request.body).listedPublicly === false,
    ),
  );
  results.push(
    "Venues: filters, cancel/confirm draft deletion, create draft payload and editor route retained (fixture)",
  );

  await ready(f.page, "/admin/dashboard");
  await f.page.setViewportSize({ width: 360, height: 800 });
  await f.page
    .getByRole("button", { name: "Open workspace navigation" })
    .click();
  await f.page
    .getByRole("dialog")
    .getByRole("link", { name: "Suppliers", exact: true })
    .click();
  await f.page.waitForURL("**/admin/suppliers");
  assert.equal(await f.page.getByRole("dialog").count(), 0);
  await f.page.getByRole("button", { name: "Open account menu" }).click();
  await f.page.getByRole("menuitem", { name: "Sign out" }).waitFor();
  await f.page.keyboard.press("Escape");
  results.push(
    "Mobile drawer navigation, account menu, Ctrl K search, dialog focus trap/Escape/restore pass",
  );
  assert.deepEqual(f.errors, [], `Runtime errors: ${f.errors.join(", ")}`);
  await f.context.close();

  for (const state of ["loading", "empty", "error"]) {
    const f = await fixture({ state });
    for (const name of ["dashboard", "enquiries", "suppliers", "venues"]) {
      await f.page.goto(`${base}/admin/${name}`);
      await f.page.locator(".ew-main h1").waitFor();
      if (state === "loading")
        await f.page.locator('[aria-busy="true"]').first().waitFor();
      else if (state === "error")
        await f.page.getByRole("alert").first().waitFor();
      else await f.page.locator(".ew-empty").first().waitFor();
      await f.page.setViewportSize({ width: 360, height: 900 });
      await checkLayout(f.page, `${name}-${state}`, 360);
    }
    if (state === "error") {
      f.mode.state = "populated";
      await f.page.getByRole("button", { name: "Retry", exact: true }).click();
      await f.page
        .getByRole("button", { name: "Example Assembly Rooms", exact: true })
        .waitFor();
    }
    assert.deepEqual(f.errors, []);
    await f.context.close();
    results.push(
      `All four admin screens: ${state} state; errors do not masquerade as zero metrics`,
    );
  }
  const partial = await fixture();
  partial.mode.failFunnel = true;
  await ready(partial.page, "/admin/dashboard");
  await partial.page.getByRole("alert").waitFor();
  assert.equal(
    await partial.page
      .locator(".ew-metric")
      .nth(2)
      .locator("strong")
      .textContent(),
    "—",
  );
  assert.equal(
    await partial.page
      .locator(".ew-metric")
      .first()
      .locator("strong")
      .textContent(),
    "2",
  );
  await partial.context.close();
  results.push(
    "Dashboard: partial service failure preserves successful panels and unavailable metrics use —",
  );

  for (const role of ["supplier", "venue_owner", "customer", "none"]) {
    const f = await fixture({ role, signedIn: role !== "none" });
    const loaded = [];
    f.page.on("request", (request) => loaded.push(request.url()));
    await f.page.goto(`${base}/admin/dashboard`);
    await f.page.waitForURL(
      role === "none"
        ? "**/login?returnTo=*"
        : role === "supplier"
          ? "**/supplier/dashboard"
          : role === "venue_owner"
            ? "**/venue"
            : "**/admin/dashboard",
    );
    if (role === "customer")
      await f.page.getByRole("heading", { name: "Access denied" }).waitFor();
    assert(
      !loaded.some(
        (url) =>
          url.includes("/src/pages/admin/") ||
          url.includes("/src/admin/layout/AdminLayout"),
      ),
      `${role} downloaded admin pages`,
    );
    await f.context.close();
    results.push(
      `${role}: existing Admin guard outcome preserved; no Admin page module requested`,
    );
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
  console.log(`Screenshots: ${output}`);
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages().at(-1);
    if (page) {
      await page
        .screenshot({ path: `${output}/failure-${index}.png`, fullPage: true })
        .catch(() => {});
      await writeFile(
        `${output}/failure-${index}.txt`,
        await page.locator("body").innerText(),
      ).catch(() => {});
    }
  }
  throw error;
} finally {
  await browser.close();
}
