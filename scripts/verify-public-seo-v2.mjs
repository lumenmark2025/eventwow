/* global process, console */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.SEO_SCREENSHOTS || "/tmp/eventwow-public-seo-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const photo = await readFile(
  new URL("./fixtures/public-v2/supplier.webp", import.meta.url),
);
const categoryCopy =
  "Seasonal menus for celebrations, corporate events and community gatherings. Explore the full category and compare suppliers for your event.";
const categories = ["Catering", "Photography", "Music", "Event styling"].map(
  (display_name) => ({
    slug: display_name.toLowerCase().replaceAll(" ", "-"),
    display_name,
    short_description:
      display_name === "Catering"
        ? categoryCopy
        : `Explore ${display_name.toLowerCase()} for your event.`,
    hero_image_url: "https://fixture.test/category.webp",
  }),
);
const rows = Array.from({ length: 3 }, (_, i) => ({
  id: `supplier-${i}`,
  slug: `fixture-supplier-${i}`,
  name: `Fixture ${["Seasonal Table", "Celebration Kitchen", "Event Catering"][i]}`,
  shortDescription:
    "Seasonal menus and thoughtful service for celebrations, parties and corporate events. All of this supplied description remains visible in the result row.",
  categoryBadges: ["Catering"],
  locationLabel: "Manchester, UK",
  heroImageUrl: "https://fixture.test/supplier.webp",
  reviewCount: i === 0 ? 12 : 0,
  reviewRating: i === 0 ? 4.8 : null,
}));
const schema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Catering in Manchester",
  itemListOrder: "http://schema.org/ItemListOrderDescending",
  numberOfItems: rows.length,
  itemListElement: rows.map((r, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `https://eventwow.co.uk/suppliers/${r.slug}`,
    name: r.name,
  })),
  url: "https://eventwow.co.uk/catering-manchester",
};
const routes = [
  {
    path: "/categories",
    title: "Browse event categories",
    h1: "Browse event categories",
    description:
      "Explore event service categories and discover trusted suppliers across the UK.",
    intro: "Search trusted suppliers or jump into a category.",
  },
  {
    path: "/categories/catering",
    title: "Catering in UK",
    h1: "Catering",
    description: categoryCopy,
    intro: categoryCopy,
  },
  {
    path: "/category/catering",
    title: "Catering",
    h1: "Catering",
    description:
      "Browse catering suppliers and request quotes from trusted vendors on Eventwow.",
    intro: "Find trusted suppliers and request quotes fast.",
  },
  {
    path: "/category/catering/manchester",
    title: "Catering in Manchester",
    h1: "Catering in Manchester",
    description:
      "Browse catering suppliers in Manchester. Request quotes from trusted local vendors on Eventwow.",
    intro: "Find local catering suppliers near you and request quotes.",
  },
  {
    path: "/location/manchester",
    title: "Suppliers in Manchester",
    h1: "Suppliers in Manchester",
    description:
      "Browse trusted suppliers in Manchester and request quotes on Eventwow.",
    intro: "Find trusted suppliers and request quotes fast.",
  },
  {
    path: "/catering-manchester",
    title: "Catering in Manchester",
    h1: "Catering in Manchester",
    description:
      "Browse catering suppliers in Manchester. Request quotes from trusted local vendors on Eventwow.",
    intro: "Find trusted suppliers and request quotes.",
  },
];
const results = [];
async function fixture(options = {}) {
  const f = await common({ signedIn: false, ...options });
  f.mode.seo = "populated";
  f.calls = [];
  f.modules = [];
  f.page.on("request", (r) => {
    if (r.url().includes("/src/")) f.modules.push(r.url());
  });
  await f.context.route("https://fixture.test/**", (route) =>
    route.fulfill(
      f.mode.seo === "missing-media"
        ? { status: 404, body: "" }
        : { contentType: "image/webp", body: photo },
    ),
  );
  await f.context.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    if (
      !u.pathname.startsWith("/api/public/seo/") &&
      !u.pathname.startsWith("/api/public/categories") &&
      !u.pathname.startsWith("/api/public/suppliers/search") &&
      u.pathname !== "/api/public-suppliers-by-category-location"
    )
      return route.fallback();
    f.calls.push({
      url: u.href,
      method: route.request().method(),
      body: route.request().postData(),
    });
    const mode = f.mode.seo;
    const missing =
      u.pathname.includes("/missing/") ||
      u.searchParams.get("slug") === "missing-page";
    await delay(mode === "loading" ? 5000 : 120);
    if (mode === "error" || mode === "not-found" || missing)
      return route.fulfill({
        status:
          mode === "error" ? 503 : u.pathname.includes("/seo/") ? 400 : 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fixture unavailable" }),
      });
    let suppliers =
      mode === "empty" || u.searchParams.get("q") === "no-match"
        ? []
        : structuredClone(rows);
    if (mode === "missing-media")
      suppliers = suppliers.map((r) => ({
        ...r,
        heroImageUrl: null,
        reviewRating: null,
        reviewCount: 0,
      }));
    let body;
    if (u.pathname === "/api/public/categories")
      body = mode === "empty" ? [] : categories;
    else if (u.pathname.startsWith("/api/public/categories/"))
      body = {
        category: categories[0],
        suppliers,
        pagination: {
          page: Number(u.searchParams.get("page") || 1),
          pageSize: 24,
          total: mode === "empty" ? 0 : 50,
        },
      };
    else if (u.pathname === "/api/public/suppliers/search")
      body = {
        suppliers,
        pagination: { page: 1, pageSize: 12, total: suppliers.length },
      };
    else if (u.pathname === "/api/public-suppliers-by-category-location")
      body = {
        rows: suppliers,
        totalCount: suppliers.length,
        categoryName: u.searchParams.has("categorySlug") ? "Catering" : null,
        locationName: u.searchParams.has("locationSlug") ? "Manchester" : null,
      };
    else
      body = {
        rows: suppliers,
        meta: {
          title: "Catering in Manchester | Eventwow",
          description: routes[5].description,
          canonical: "https://eventwow.co.uk/catering-manchester",
        },
        category_slug: "catering",
        schema: {
          ...schema,
          numberOfItems: suppliers.length,
          itemListElement: suppliers.length ? schema.itemListElement : [],
        },
      };
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return f;
}
async function ready(f, route, mode = "populated") {
  f.mode.seo = mode;
  await f.page.goto(base + route.path);
  if (mode === "loading") await f.page.getByRole("status").first().waitFor();
  else if (mode === "error" || mode === "not-found")
    await f.page.getByRole("alert").waitFor();
  else if (mode === "empty")
    await f.page.locator(".public-seo-empty").waitFor();
  else await f.page.locator(".public-seo .public-card").first().waitFor();
  await f.page.evaluate(() => document.fonts.ready);
}
async function metadata(f, route) {
  assert.equal(await f.page.title(), `${route.title} | Eventwow`);
  assert.equal(await f.page.locator("h1").innerText(), route.h1);
  assert.equal(
    await f.page.locator("meta[name=description]").getAttribute("content"),
    route.description,
  );
  assert.equal(
    await f.page.locator("link[rel=canonical]").getAttribute("href"),
    `https://eventwow.co.uk${route.path}`,
  );
  for (const attr of ["og:title", "twitter:title"])
    assert.equal(
      await f.page
        .locator(`meta[property="${attr}"],meta[name="${attr}"]`)
        .getAttribute("content"),
      `${route.title} | Eventwow`,
    );
  assert.ok(
    (await f.page.locator(".public-seo-header").innerText()).includes(
      route.intro,
    ),
  );
  if (route.path === "/catering-manchester")
    assert.deepEqual(
      JSON.parse(await f.page.locator("#seo-itemlist-jsonld").textContent()),
      schema,
    );
  else assert.equal(await f.page.locator("#seo-itemlist-jsonld").count(), 0);
}
async function check(f, name, width) {
  await f.page.setViewportSize({ width, height: 1050 });
  assert.equal(
    await f.page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `${name} ${width} overflow`,
  );
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
  assert.deepEqual(violations, [], `${name} ${width} accessibility`);
  await f.page.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
  });
  assert.deepEqual(f.errors, []);
}
try {
  for (const route of routes) {
    const f = await fixture();
    await ready(f, route);
    await metadata(f, route);
    for (const width of [360, 768, 1024, 1440])
      await check(f, route.path.slice(1).replaceAll("/", "-"), width);
    assert.equal(
      f.calls.length,
      1,
      "One initial public read, including StrictMode",
    );
    assert.equal(f.calls[0].method, "GET");
    assert.equal(f.calls[0].body, null);
    assert.ok(
      !f.modules.some((m) =>
        /\/src\/(admin|supplier|venue|customer)\/|BookingsCalendar|HomePage.jsx|ProfilePage.jsx/.test(
          m,
        ),
      ),
      "No unnecessary route modules",
    );
    if (route.path === "/categories") {
      assert.ok(
        (await f.page.locator(".public-seo-categories").innerText()).includes(
          categoryCopy,
        ),
      );
      for (const cat of categories)
        assert.equal(
          await f.page
            .locator(`.public-seo-category a[href='/categories/${cat.slug}']`)
            .count(),
          1,
        );
    } else {
      for (const r of rows) {
        assert.equal(
          await f.page
            .locator(`.public-seo-results a[href='/suppliers/${r.slug}']`)
            .count(),
          2,
        );
        assert.ok(
          (await f.page.locator(".public-seo-results").innerText()).includes(
            r.shortDescription,
          ),
        );
      }
    }
    results.push(
      `${route.path}: heading/intro/content, title/description/canonical/social metadata/schema, one GET and four-width axe/overflow passed`,
    );
    await f.context.close();
  }
  for (const route of [routes[0], routes[1], routes[3], routes[5]])
    for (const mode of [
      "loading",
      "empty",
      "error",
      "not-found",
      "missing-media",
    ]) {
      if (route.path === "/categories" && mode === "not-found") continue;
      const f = await fixture();
      await ready(f, route, mode);
      for (const width of [360, 768, 1024, 1440]) {
        if (mode === "loading" && width !== 360) await ready(f, route, mode);
        await check(
          f,
          `${route.path.slice(1).replaceAll("/", "-")}-${mode}`,
          width,
        );
      }
      if (mode === "error") {
        assert.equal(await f.page.locator(".public-seo-empty").count(), 0);
        assert.equal(await f.page.locator(".public-seo-count").count(), 0);
        f.mode.seo = "populated";
        await f.page.getByRole("button", { name: "Try again" }).click();
        await f.page.locator(".public-seo .public-card").first().waitFor();
        assert.equal(f.calls.length, 2);
      }
      if (mode === "empty" && route.path === "/categories/catering")
        assert.equal(
          await f.page
            .getByRole("link", { name: "Post an enquiry", exact: true })
            .getAttribute("href"),
          "/request",
        );
      if (mode === "empty" && route.path === "/catering-manchester")
        assert.equal(
          await f.page
            .getByRole("link", { name: "Browse all in this category" })
            .getAttribute("href"),
          "/category/catering",
        );
      console.log(`${route.path} ${mode} passed`);
      await f.context.close();
    }
  const f = await fixture();
  await ready(f, routes[1]);
  assert.ok(
    await f.page
      .getByRole("button", { name: "Previous", exact: true })
      .isDisabled(),
  );
  await f.page.getByRole("button", { name: "Next", exact: true }).focus();
  await f.page.keyboard.press("Enter");
  await f.page.waitForURL("**/categories/catering?page=2");
  await f.page.getByText("Page 2 of 3", { exact: true }).waitFor();
  await metadata(f, routes[1]);
  assert.ok(
    f.calls.some((r) =>
      r.url.endsWith(
        "/api/public/categories/catering/suppliers?page=2&pageSize=24",
      ),
    ),
  );
  await f.page.getByRole("button", { name: "Previous", exact: true }).click();
  await f.page.waitForURL("**/categories/catering");
  await f.page.getByText("Page 1 of 3", { exact: true }).waitFor();
  await f.page.goto(base + "/categories/catering?page=999");
  await f.page.waitForURL("**/categories/catering?page=3");
  await f.page.getByText("Page 3 of 3", { exact: true }).waitFor();
  assert.ok(
    await f.page
      .getByRole("button", { name: "Next", exact: true })
      .isDisabled(),
  );
  await ready(f, routes[0]);
  const search = f.page.getByRole("searchbox", {
    name: "Search suppliers, category, location",
  });
  await search.fill("  catering Manchester  ");
  await f.page.locator(".public-seo-results .public-card").first().waitFor();
  assert.ok(
    f.calls.some((r) =>
      r.url.endsWith(
        "/api/public/suppliers/search?q=catering+Manchester&page=1&pageSize=12",
      ),
    ),
  );
  await search.fill("no-match");
  await f.page
    .locator(".public-seo-search-results .public-seo-empty")
    .waitFor();
  await search.fill("");
  await f.page.waitForTimeout(350);
  assert.equal(await f.page.locator(".public-seo-search-results").count(), 0);
  f.mode.seo = "error";
  await search.fill("service failure");
  await f.page.locator(".public-seo-search-results [role=alert]").waitFor();
  assert.equal(
    await f.page
      .locator(".public-seo-search-results .public-seo-empty")
      .count(),
    0,
  );
  assert.equal(
    await f.page.locator(".public-seo-category").count(),
    categories.length,
  );
  f.mode.seo = "populated";
  await f.page
    .locator(".public-seo-search-results")
    .getByRole("button", { name: "Try again" })
    .click();
  await f.page.locator(".public-seo-results .public-card").first().waitFor();
  await search.fill("");
  assert.ok(
    await f.page
      .getByRole("button", { name: "Filters (coming soon)" })
      .isDisabled(),
  );
  assert.equal(
    await f.page
      .getByRole("link", { name: "Post a request", exact: true })
      .getAttribute("href"),
    "/request",
  );
  await f.page.locator(".public-seo-category a").first().focus();
  await f.page.keyboard.press("Enter");
  await f.page.waitForURL("**/categories/catering");
  await f.page.getByText(categoryCopy, { exact: true }).waitFor();
  await f.page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "All suppliers" })
    .click();
  await f.page.waitForURL("**/suppliers");
  await f.page.goto(base + "/browse");
  await f.page.waitForURL("**/categories");
  await ready(f, routes[5]);
  await f.page.evaluate(() => {
    history.pushState({}, "", "/missing-page");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await f.page.getByRole("heading", { name: "Page not found" }).waitFor();
  assert.equal(await f.page.locator("#seo-itemlist-jsonld").count(), 0);
  assert.equal(await f.page.locator("h1").innerText(), "Suppliers");
  assert.equal(
    await f.page.locator("link[rel=canonical]").getAttribute("href"),
    "https://eventwow.co.uk/missing-page",
  );
  results.push(
    "Pagination exact query/clamping/disabled states, category keyboard links, /browse redirect, search debounce/trim/clear and stale-flat-slug schema cleanup passed",
  );
  await f.context.close();
  for (const role of ["admin", "supplier", "venue_owner", "customer"]) {
    const f = await fixture({ signedIn: true, role });
    await ready(f, routes[1]);
    await ready(f, routes[5]);
    assert.ok(
      !f.requests.some((r) =>
        /\/api\/(admin|supplier-|customer\/|venue-owner)/.test(
          new URL(r.url).pathname,
        ),
      ),
    );
    await f.context.close();
  }
  results.push(
    "Public access for signed-out/Admin/Supplier/Venue/Customer sessions, no workspace data reads",
  );
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ passed: true, results }, null, 2) + "\n",
  );
  console.log(results.join("\n"));
} catch (error) {
  for (const c of browser.contexts())
    for (const p of c.pages())
      console.error(
        p.url(),
        (await p.locator("body").innerText()).slice(0, 2500),
      );
  throw error;
} finally {
  await browser.close();
}
