/* global process, console */
// Isolated synthetic profile DTOs. No live API, storage or auth writes.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output =
  process.env.PROFILE_SCREENSHOTS || "/tmp/eventwow-public-profiles-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const photos = Object.fromEntries(
  await Promise.all(
    ["supplier", "venue"].map(async (kind) => [
      kind,
      await readFile(
        new URL(`./fixtures/public-v2/${kind}.webp`, import.meta.url),
      ),
    ]),
  ),
);
const supplier = {
  id: "profile-supplier",
  slug: "fixture-catering",
  name: "Fixture Event Catering",
  categories: [{ name: "Catering", slug: "catering" }],
  locationLabel: "Manchester, UK",
  shortDescription:
    "Seasonal menus and thoughtful service for celebrations, parties and corporate events.",
  about:
    "Bring everyone together over good food. Our team creates seasonal menus for parties, community gatherings and corporate events.\n\nFrom relaxed sharing plates to a seated celebration, we plan the food around your event.",
  services: [
    "Seasonal menus",
    "Corporate catering",
    "Dietary requirements",
    "Buffet service",
  ],
  heroImageUrl: "https://fixture.test/supplier/cover.webp",
  gallery: Array.from({ length: 7 }, (_, i) => ({
    url: `https://fixture.test/supplier/${i}.webp`,
    alt: `Seasonal menu ${i + 1}`,
  })),
  isInsured: true,
  fsaRatingValue: "5",
  fsaRatingUrl: "https://ratings.food.gov.uk/fixture",
  performance: {
    typicalResponseHours: 3.5,
    acceptanceRate: 0.7,
    lastActiveAt: "2026-09-10T12:00:00Z",
    badges: ["Fast responder"],
  },
  reviewRating: 4.8,
  reviewCount: 24,
  reviews: [
    {
      rating: 5,
      reviewText: "Thoughtful service and a menu everyone enjoyed.",
      reviewerName: "Fixture Alex",
      createdAt: "2026-09-10T10:00:00Z",
    },
    {
      rating: 4.5,
      reviewText: "A lovely team for our community gathering.",
      reviewerName: "Fixture Sam",
      createdAt: "2026-09-09T10:00:00Z",
    },
  ],
};
const venue = {
  id: "profile-venue",
  slug: "fixture-hall",
  name: "Fixture Assembly Rooms",
  type: "Event space",
  locationLabel: "Manchester, UK",
  guestMin: 20,
  guestMax: 150,
  shortDescription:
    "A light-filled space for celebrations, gatherings and corporate events.",
  about:
    "A welcoming setting with space to make your event your own. The main hall opens onto a garden, with flexible layouts for smaller gatherings and larger celebrations.",
  facilities: [
    "Parking",
    "Outdoor space",
    "Accessible entrance",
    "On-site kitchen",
  ],
  aiTags: ["outdoor"],
  heroImageUrl: "https://fixture.test/venue/cover.webp",
  gallery: Array.from({ length: 7 }, (_, i) => ({
    url: `https://fixture.test/venue/${i}.webp`,
    caption: `Venue space ${i + 1}`,
  })),
};
const results = [];
async function fixture(options = {}) {
  const f = await common({ signedIn: false, ...options });
  f.mode.profile = "populated";
  f.profileCalls = [];
  f.images = [];
  f.modules = [];
  f.page.on("request", (req) => {
    if (req.url().includes("/src/")) f.modules.push(req.url());
  });
  await f.context.route("https://fixture.test/**", (route) => {
    f.images.push(route.request().url());
    return route.fulfill(
      f.mode.profile === "broken"
        ? { status: 404, body: "" }
        : {
            contentType: "image/webp",
            body: photos[
              route.request().url().includes("/supplier/")
                ? "supplier"
                : "venue"
            ],
          },
    );
  });
  await f.context.route("**/api/public-*", async (route) => {
    const url = new URL(route.request().url());
    if (!["/api/public-supplier", "/api/public-venue"].includes(url.pathname))
      return route.fallback();
    const kind = url.pathname.endsWith("supplier") ? "supplier" : "venue";
    f.profileCalls.push({
      url: url.href,
      method: route.request().method(),
      body: route.request().postData(),
    });
    const state =
      url.searchParams.get("slug") === "missing" ? "not-found" : f.mode.profile;
    await delay(state === "loading" ? 4000 : 150);
    if (["error", "not-found"].includes(state))
      return route.fulfill({
        status: state === "error" ? 503 : 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fixture unavailable" }),
      });
    const row = structuredClone(kind === "supplier" ? supplier : venue);
    if (state === "minimal")
      Object.assign(row, {
        heroImageUrl: null,
        gallery: [],
        about: null,
        shortDescription: null,
        locationLabel: null,
        categories: [],
        services: [],
        facilities: [],
        type: null,
        guestMin: null,
        guestMax: null,
        aiTags: [],
        reviews: [],
        reviewRating: null,
        reviewCount: 0,
        performance: { typicalResponseHours: null, acceptanceRate: null },
        isInsured: false,
        fsaRatingValue: null,
        fsaRatingUrl: null,
      });
    if (state === "single") row.gallery = [];
    if (state === "invalid-gallery") {
      row.heroImageUrl = null;
      row.gallery = [{ url: null }, { url: "" }];
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        [kind]: state === "empty" ? null : row,
        ...(kind === "venue"
          ? {
              linkedSuppliers:
                state === "minimal"
                  ? []
                  : [{ ...supplier, supplierId: supplier.id, categories: ["Catering"] }],
            }
          : {}),
      }),
    });
  });
  return f;
}
async function ready(f, kind, state = "populated") {
  f.mode.profile = state;
  await f.page.goto(
    `${base}/${kind}s/${kind === "supplier" ? supplier.slug : venue.slug}`,
  );
  if (state === "loading")
    await f.page
      .getByRole("heading", { name: `Loading ${kind} profile` })
      .waitFor();
  else if (["error", "empty"].includes(state))
    await f.page
      .getByRole("heading", { name: new RegExp("profile unavailable") })
      .waitFor();
  else if (state === "not-found")
    await f.page
      .getByRole("heading", { name: new RegExp("not found") })
      .waitFor();
  else
    await f.page
      .getByRole("heading", {
        name: kind === "supplier" ? supplier.name : venue.name,
        exact: true,
      })
      .waitFor();
  await f.page.evaluate(() => document.fonts.ready);
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
  for (const kind of ["supplier", "venue"]) {
    const f = await fixture();
    await ready(f, kind);
    assert.equal(
      f.profileCalls.length,
      1,
      "One initial profile request including StrictMode",
    );
    assert.equal(
      f.profileCalls[0].url,
      `${base}/api/public-${kind}?slug=${kind === "supplier" ? supplier.slug : venue.slug}`,
    );
    assert.equal(f.profileCalls[0].method, "GET");
    assert.equal(f.profileCalls[0].body, null);
    assert.ok(
      !f.images.some((url) => /\/[2-6]\.webp/.test(url)),
      "Unselected gallery originals must not load",
    );
    const slug = kind === "supplier" ? supplier.slug : venue.slug;
    assert.equal(
      await f.page.locator("link[rel=canonical]").getAttribute("href"),
      `https://eventwow.co.uk/${kind}s/${slug}`,
    );
    const schema = JSON.parse(
      await f.page
        .locator(`script[data-jsonld-id=${kind}-profile-jsonld]`)
        .textContent(),
    );
    assert.equal(
      schema["@type"],
      kind === "supplier" ? "LocalBusiness" : "EventVenue",
    );
    assert.equal(schema.url, `https://eventwow.co.uk/${kind}s/${slug}`);
    const ctas = f.page
      .locator("#public-main")
      .getByRole("link", {
        name: kind === "supplier" ? "Request a quote" : "Request quotes",
        exact: true,
      });
    assert.equal(await ctas.count(), 2);
    for (const cta of await ctas.all())
      assert.equal(
        await cta.getAttribute("href"),
        kind === "supplier"
          ? `/suppliers/${slug}/request-quote`
          : `/request?venue=${slug}`,
      );
    assert.ok(
      !f.modules.some((m) =>
        /\/src\/(admin|supplier|venue|customer)\/|BookingsCalendar|HomePage.jsx/.test(
          m,
        ),
      ),
      "Role modules and homepage remain lazy",
    );
    for (const width of [360, 768, 1024, 1440])
      await check(f, `${kind}-populated`, width);
    if (kind === "supplier") {
      await f.page
        .getByText("Recent activity on EventWow", { exact: true })
        .click();
      await f.page.getByText("70%", { exact: true }).waitFor();
      assert.equal(
        await f.page
          .getByRole("link", { name: "More Catering" })
          .getAttribute("href"),
        "/categories/catering",
      );
      assert.equal(
        await f.page
          .locator("a[href='https://ratings.food.gov.uk/fixture']")
          .count(),
        1,
      );
      assert.ok(
        (await f.page.locator("#reviews").innerText()).includes(
          "Showing the latest 2 published reviews",
        ),
      );
    } else {
      assert.equal(
        await f.page
          .getByRole("link", { name: "Claim this venue" })
          .getAttribute("href"),
        `/venues/${slug}/claim`,
      );
      assert.equal(
        await f.page
          .locator(".public-profile-suppliers a")
          .first()
          .getAttribute("href"),
        `/suppliers/${supplier.slug}`,
      );
      await f.page.getByText("Parking", { exact: true }).waitFor();
      assert.equal(
        await f.page
          .getByRole("heading", { name: "Reviews", exact: true })
          .count(),
        0,
      );
    }
    const trigger = f.page.getByRole("button", { name: /Open photo 1 of/ });
    await trigger.focus();
    await f.page.keyboard.press("Enter");
    await f.page.getByRole("dialog").waitFor();
    await f.page.keyboard.press("ArrowRight");
    assert.ok(
      (await f.page.locator(".public-gallery-caption").innerText()).startsWith(
        "2 / 8",
      ),
    );
    await f.page.keyboard.press("ArrowLeft");
    await f.page.keyboard.press("ArrowLeft");
    assert.ok(
      (await f.page.locator(".public-gallery-caption").innerText()).startsWith(
        "8 / 8",
      ),
    );
    for (let i = 0; i < 8; i++) {
      await f.page.keyboard.press("Tab");
      assert.ok(
        await f.page
          .getByRole("dialog")
          .evaluate((el) => el.contains(document.activeElement)),
      );
    }
    for (const width of [360, 768, 1024, 1440])
      await check(f, `${kind}-gallery`, width);
    await f.page.keyboard.press("Escape");
    assert.ok(
      await trigger.evaluate((el) => el === document.activeElement),
      "Gallery restores the actual opening control",
    );
    assert.equal(
      f.profileCalls.length,
      1,
      "Gallery controls never refetch profile",
    );
    results.push(
      `${kind}: four widths, axe, gallery keyboard/focus/wrap, metadata, unchanged CTA/related links and one profile GET passed`,
    );
    await f.context.close();
    for (const state of [
      "loading",
      "minimal",
      "error",
      "not-found",
      "empty",
      "broken",
      "single",
      "invalid-gallery",
    ]) {
      const f = await fixture();
      await ready(f, kind, state);
      for (const width of [360, 768, 1024, 1440]) {
        if (state === "loading" && width !== 360) await ready(f, kind, state);
        await check(f, `${kind}-${state}`, width);
      }
      if (state === "minimal") {
        assert.equal(
          await f.page.getByRole("button", { name: /Open photo/ }).count(),
          0,
        );
        assert.equal(
          await f.page
            .getByRole("heading", { name: /Services|Facilities/ })
            .count(),
          0,
        );
        assert.equal(await f.page.getByText(/Replies in/).count(), 0);
        if (kind === "supplier") {
          await f.page
            .getByText("Recent activity on EventWow", { exact: true })
            .click();
          await f.page
            .getByText("No recent response data", { exact: true })
            .waitFor();
          await f.page
            .getByText("No recent conversion data", { exact: true })
            .waitFor();
          assert.equal(
            await f.page.getByText("0%", { exact: true }).count(),
            0,
          );
        }
      }
      if (state === "single") {
        await f.page.getByRole("button", { name: /Open photo 1 of 1/ }).click();
        assert.ok(
          await f.page.getByRole("button", { name: "Next photo" }).isDisabled(),
        );
        assert.ok(
          await f.page
            .getByRole("button", { name: "Previous photo" })
            .isDisabled(),
        );
      }
      if (state === "error") {
        f.mode.profile = "populated";
        await f.page.getByRole("button", { name: "Try again" }).click();
        await f.page
          .getByRole("heading", {
            name: kind === "supplier" ? supplier.name : venue.name,
            exact: true,
          })
          .waitFor();
        assert.equal(f.profileCalls.length, 2, "Retry performs a fresh GET");
      }
      console.log(`${kind} ${state} passed`);
      await f.context.close();
    }
    results.push(
      `${kind}: loading, incomplete/no-photo/no-review/no-package, 503/retry, 404, empty DTO, broken/single/invalid gallery at all widths passed`,
    );
  }
  // Client-side slug change: previous Venue must disappear even when next fetch fails.
  for (const kind of ["supplier", "venue"]) {
    const f = await fixture();
    await ready(f, kind);
    await f.page.evaluate((path) => {
      history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/${kind}s/missing`);
    await f.page
      .getByRole("heading", { name: new RegExp("not found") })
      .waitFor();
    assert.equal(await f.page.locator(".public-profile-heading").count(), 0);
    assert.equal(
      await f.page
        .locator(`script[data-jsonld-id=${kind}-profile-jsonld]`)
        .count(),
      0,
    );
    await f.context.close();
  }
  for (const role of ["admin", "supplier", "venue_owner", "customer"]) {
    const f = await fixture({ signedIn: true, role });
    await ready(f, "supplier");
    await ready(f, "venue");
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
    "Stale-slug/JSON-LD regression and public access for signed-out/Admin/Supplier/Venue/Customer sessions passed",
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
        (await page.locator("body").innerText()).slice(0, 3000),
      );
  throw error;
} finally {
  await browser.close();
}
