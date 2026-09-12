/* global process, console */
// Browser-only synthetic records; all API/Supabase requests are intercepted.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.PUBLIC_SCREENSHOTS || "/tmp/eventwow-public-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const photos = {
  supplier: await readFile(
    new URL("./fixtures/public-v2/supplier.webp", import.meta.url),
  ),
  venue: await readFile(
    new URL("./fixtures/public-v2/venue.webp", import.meta.url),
  ),
};
const categories = [
  "Catering",
  "Photography",
  "Music",
  "Flowers",
  "Entertainment",
  "Event styling",
].map((name, i) => ({
  id: `category-${i}`,
  display_name: name,
  slug: name.toLowerCase().replace(" ", "-"),
  hero_image_url: `https://fixture.test/${i % 2 ? "venue" : "supplier"}.webp`,
}));
const suppliers = Array.from({ length: 4 }, (_, i) => ({
  id: `supplier-${i}`,
  slug: `fixture-supplier-${i}`,
  name: `Fixture ${["Event Catering", "Celebration Kitchen", "Seasonal Table", "Community Food"][i]}`,
  shortDescription:
    "Seasonal menus and thoughtful service for celebrations, parties and corporate events.",
  locationLabel: "Manchester, UK",
  categoryBadges: ["Catering"],
  heroImageUrl: "https://fixture.test/supplier.webp",
  isInsured: i === 0,
  reviewRating: i === 0 ? 4.8 : null,
  reviewCount: i === 0 ? 12 : 0,
  performance: { typicalResponseHours: i === 0 ? 3.5 : null },
}));
const venues = Array.from({ length: 6 }, (_, i) => ({
  id: `venue-${i}`,
  slug: `fixture-venue-${i}`,
  name: `Fixture ${["Assembly Rooms", "Garden Hall", "Riverside House", "Community Barn", "City Rooms", "Park Pavilion"][i]}`,
  locationLabel: "Manchester",
  shortDescription:
    "A flexible space for your next celebration, gathering or corporate event.",
  guestMin: 20,
  guestMax: 150,
  aiTags: ["outdoor"],
  heroImageUrl: "https://fixture.test/venue.webp",
}));
const results = [];
async function fixture({ role = "customer", signedIn = false } = {}) {
  const f = await common({ role, signedIn });
  f.mode.publicState = "populated";
  f.mode.categoryFailure = false;
  await f.context.route("https://fixture.test/**", async (route) => {
    if (f.mode.brokenImage) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({
      contentType: "image/webp",
      body: photos[
        route.request().url().includes("supplier") ? "supplier" : "venue"
      ],
    });
  });
  await f.context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    f.requests.push({
      url: url.href,
      method: route.request().method(),
      body: route.request().postData(),
    });
    if (
      ![
        "/api/public/categories",
        "/api/public/categories/options",
        "/api/public-suppliers",
        "/api/public-venues",
      ].includes(url.pathname)
    )
      return route.fallback();
    // Shared overlapping StrictMode reads stay in flight long enough to count.
    const state = f.mode.publicState;
    await delay(state === "loading" ? 1500 : 100);
    if (
      state === "error" ||
      (f.mode.categoryFailure && url.pathname.endsWith("/options"))
    )
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fixture service unavailable" }),
      });
    let data;
    if (url.pathname.includes("categories"))
      data = state === "empty" ? [] : categories;
    else {
      let rows = structuredClone(
        url.pathname.includes("suppliers") ? suppliers : venues,
      );
      if (state === "empty") rows = [];
      if (state === "missing")
        rows = rows.map((r) => ({
          ...r,
          heroImageUrl: null,
          locationLabel: null,
          shortDescription: null,
          guestMin: null,
          guestMax: null,
          aiTags: [],
          reviewRating: null,
          reviewCount: 0,
          performance: { typicalResponseHours: null },
        }));
      if (url.searchParams.get("q") === "no-match") rows = [];
      const totalCount = rows.length;
      rows = rows.slice(0, Number(url.searchParams.get("limit") || 24));
      data = { ok: true, rows, totalCount };
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  const modules = [];
  f.page.on("request", (req) => {
    if (req.url().includes("/src/")) modules.push(req.url());
  });
  return { ...f, modules };
}
async function ready(f, path, state = "populated") {
  f.mode.publicState = state;
  await f.page.goto(`${base}${path}`);
  await f.page.getByRole("heading", { level: 1 }).waitFor();
  if (state === "loading") await f.page.getByRole("status").first().waitFor();
  else if (state === "error") await f.page.getByRole("alert").first().waitFor();
  else if (state === "empty")
    await f.page
      .getByRole("heading", { name: /No (categories|suppliers|venues) found/ })
      .first()
      .waitFor();
  else
    await f.page
      .locator(path === "/" ? ".public-category" : ".public-card")
      .first()
      .waitFor();
  await f.page.evaluate(() => document.fonts.ready);
  if (state !== "loading") await f.page.waitForTimeout(150);
}
async function check(f, name, width) {
  await f.page.setViewportSize({ width, height: 1050 });
  const overflow = await f.page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(overflow, false, `${name} ${width}px overflows`);
  await f.page.addScriptTag({ content: axe });
  const violations = await f.page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  );
  assert.deepEqual(violations, [], `${name} ${width}px accessibility`);
  await f.page.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
  });
  assert.deepEqual(f.errors, []);
}
try {
  if (!process.env.PUBLIC_INTERACTIONS_ONLY)
    for (const [name, path] of [
      ["home", "/"],
      ["suppliers", "/suppliers"],
      ["venues", "/venues"],
    ]) {
      const f = await fixture();
      await ready(f, path);
      assert.equal(
        await f.page.locator("link[rel=canonical]").getAttribute("href"),
        `https://eventwow.co.uk${path}`,
      );
      assert.ok((await f.page.title()).includes("Eventwow"));
      if (path === "/")
        assert.equal(
          JSON.parse(
            await f.page
              .locator("script[data-jsonld-id=home-org-jsonld]")
              .textContent(),
          )["@type"],
          "Organization",
        );
      for (const width of [360, 768, 1024, 1440]) await check(f, name, width);
      const dataCalls = f.requests.filter((r) =>
        new URL(r.url).pathname.startsWith("/api/public"),
      );
      const unique = [...new Set(dataCalls.map((r) => r.url))];
      assert.equal(
        dataCalls.length,
        unique.length,
        `${name}: duplicate initial public reads`,
      );
      assert.ok(
        !f.modules.some((m) =>
          /\/src\/(admin|supplier|venue|customer)\/|BookingsCalendar/.test(m),
        ),
        `${name}: other-role page code loaded`,
      );
      if (path !== "/")
        assert.ok(
          !f.modules.some((m) => m.includes("/HomePage.jsx")),
          "Homepage must stay lazy on search routes",
        );
      assert.equal(
        await f.page.getByText("Replies in ~0.0h", { exact: true }).count(),
        0,
      );
      assert.equal(
        await f.page
          .getByText(
            /9,800|254 suppliers|189 venues|50\+ reviews|From £25|100%.*Verified/,
          )
          .count(),
        0,
      );
      for (const state of ["loading", "empty", "error", "missing"]) {
        for (const width of [360, 768, 1024, 1440]) {
          await f.page.setViewportSize({ width, height: 1050 });
          await ready(f, path, state);
          await check(f, `${name}-${state}`, width);
        }
      }
      f.mode.publicState = "populated";
      await ready(f, path, "error");
      f.mode.publicState = "populated";
      await f.page
        .getByRole("button", { name: "Try again", exact: true })
        .first()
        .click();
      await f.page
        .locator(path === "/" ? ".public-category" : ".public-card")
        .first()
        .waitFor();
      results.push(
        `${name}: populated/loading/empty/error/missing media at 360/768/1024/1440; axe/overflow, retry, canonical, route isolation, duplicate-read checks passed`,
      );
      console.log(results.at(-1));
      await f.context.close();
    }
  const f = await fixture();
  await ready(f, "/");
  await f.page
    .getByLabel("What are you planning?", { exact: true })
    .fill("corporate catering");
  await f.page.getByLabel("Where?", { exact: true }).fill("Manchester");
  await f.page.getByRole("button", { name: "Search", exact: true }).click();
  await f.page.waitForURL(
    "**/suppliers?q=corporate+catering&location=Manchester",
  );
  await f.page.locator(".public-card").first().waitFor();
  await f.page
    .getByLabel("Category", { exact: true })
    .selectOption("Photography");
  await f.page.waitForURL(
    (url) => url.searchParams.get("category") === "Photography",
  );
  await Promise.all([
    f.page.waitForResponse(
      (r) =>
        r.url().includes("/api/public-suppliers?") &&
        r.url().includes("category=Photography") &&
        r.url().includes("sort=newest"),
    ),
    f.page.getByLabel("Sort suppliers", { exact: true }).selectOption("newest"),
  ]);
  const params = new URL(
    f.requests.filter((r) => r.url.includes("/api/public-suppliers?")).at(-1)
      .url,
  ).searchParams;
  assert.deepEqual(Object.fromEntries(params), {
    q: "corporate catering",
    location: "Manchester",
    category: "Photography",
    sort: "newest",
    limit: "24",
    offset: "0",
  });
  assert.equal(
    await f.page.locator("link[rel=canonical]").getAttribute("href"),
    "https://eventwow.co.uk/suppliers",
  );
  await Promise.all([
    f.page.waitForResponse((r) =>
      r.url().includes("/api/public-suppliers?sort=recommended"),
    ),
    f.page.getByRole("button", { name: "Clear filters", exact: true }).click(),
  ]);
  await f.page.waitForURL(`${base}/suppliers`);
  assert.ok(
    await f.page
      .getByRole("button", { name: "Clear filters", exact: true })
      .isDisabled(),
  );
  await f.page
    .getByRole("link", { name: "View profile", exact: true })
    .first()
    .focus();
  assert.equal(
    await f.page
      .getByRole("link", { name: "View profile", exact: true })
      .first()
      .getAttribute("href"),
    "/suppliers/fixture-supplier-0",
  );
  await ready(f, "/venues?q=Manchester&sort=newest");
  const venueParams = new URL(
    f.requests.filter((r) => r.url.includes("/api/public-venues?")).at(-1).url,
  ).searchParams;
  assert.deepEqual(Object.fromEntries(venueParams), {
    q: "Manchester",
    sort: "newest",
    limit: "24",
    offset: "0",
  });
  assert.equal(
    await f.page
      .getByRole("link", { name: "View venue", exact: true })
      .first()
      .getAttribute("href"),
    "/venues/fixture-venue-0",
  );
  await f.page.getByLabel("Search venues", { exact: true }).fill("no-match");
  await f.page.getByRole("heading", { name: "No venues found" }).waitFor();
  await f.page
    .getByRole("button", { name: "Clear filters", exact: true })
    .first()
    .click();
  await f.page.locator(".public-card").first().waitFor();
  // Missing-image and category failures are not presented as successful empty results.
  f.mode.brokenImage = true;
  await ready(f, "/suppliers");
  await f.page
    .getByText("Image unavailable", { exact: true })
    .first()
    .waitFor();
  f.mode.brokenImage = false;
  f.mode.categoryFailure = true;
  await ready(f, "/suppliers");
  await f.page
    .getByText("Category options are unavailable.", { exact: false })
    .waitFor();
  f.mode.categoryFailure = false;
  await f.page.getByRole("button", { name: "Retry categories" }).click();
  await f.page.getByLabel("Category", { exact: true }).selectOption("Catering");
  await f.page.setViewportSize({ width: 360, height: 900 });
  const trigger = f.page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await f.page.keyboard.press("Enter");
  await f.page.getByRole("dialog").waitFor();
  for (let i = 0; i < 12; i++) {
    await f.page.keyboard.press("Tab");
    assert.ok(
      await f.page
        .getByRole("dialog")
        .evaluate((el) => el.contains(document.activeElement)),
    );
  }
  await f.page.keyboard.press("Escape");
  assert.ok(await trigger.evaluate((el) => el === document.activeElement));
  await trigger.click();
  await f.page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Venues", exact: true })
    .click();
  await f.page.waitForURL(`${base}/venues`);
  assert.equal(await f.page.getByRole("dialog").count(), 0);
  await f.page.keyboard.press("Control+Home");
  assert.deepEqual(f.errors, []);
  results.push(
    "Search/category/location/sort/clear query contracts, profile URLs, absent ratings/response metrics, failed images/options recovery and Radix keyboard/focus/navigation passed",
  );
  await f.context.close();
  for (const role of ["admin", "supplier", "venue_owner", "customer"]) {
    const f = await fixture({ signedIn: true, role });
    for (const path of ["/", "/suppliers", "/venues"]) await ready(f, path);
    assert.ok(
      !f.requests.some((r) =>
        /\/api\/(admin|supplier-|customer\/|venue-owner)/.test(
          new URL(r.url).pathname,
        ),
      ),
      "Public routes must not load role workspace data",
    );
    await f.context.close();
  }
  results.push(
    "Public access remains available signed out and under Admin/Supplier/Venue/Customer sessions; no workspace data fetched",
  );
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ passed: true, results }, null, 2) + "\n",
  );
  console.log(results.join("\n"));
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      console.error(
        page.url(),
        (await page.locator("body").innerText()).slice(0, 4000),
      );
  throw error;
} finally {
  await browser.close();
}
