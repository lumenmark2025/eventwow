import assert from "node:assert/strict";
import { chromium } from "playwright";
import { publicImageSources } from "../src/components/marketing/publicImageSources.js";
import { workspaceFixtures } from "./workspace-fixtures.mjs";

const storage = "http://127.0.0.1:54321";
const original = `${storage}/storage/v1/object/public/venue-images/fixture.jpg`;
const sized = publicImageSources(original, storage);
assert.equal(new URL(sized.src).searchParams.get("width"), "640");
assert.equal(sized.fallbackSrc, original);
assert.equal(sized.srcSet.split(", ").length, 5);
for (const src of [
  null,
  "/images/local.webp",
  "data:image/png;base64,fixture",
  original + "?download=1",
  original + "#fragment",
  original.replace("/public/", "/sign/"),
  original.replace("venue-images", "private-bucket"),
  original.replace(storage, "https://other.supabase.co"),
  original.replace(".jpg", ".svg"),
])
  assert.deepEqual(publicImageSources(src, storage), { src });
assert.deepEqual(publicImageSources(original, undefined), { src: original });
for (const bucket of ["supplier-gallery", "venue-hero-images"])
  assert.ok(
    publicImageSources(original.replace("venue-images", bucket), storage)
      .srcSet,
  );

const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
try {
  for (const width of [360, 768, 1024, 1440]) {
    for (const state of ["sized", "resize-fails", "both-fail"]) {
      const f = await common({
        signedIn: false,
        respond: ({ url }) =>
          url.pathname === "/api/public-venues"
            ? {
                rows: [
                  {
                    id: "fixture",
                    slug: "fixture",
                    name: "Image fixture",
                    heroImageUrl: original,
                    locationLabel: "Fixture",
                    guestMin: 10,
                    guestMax: 50,
                  },
                ],
                totalCount: 1,
              }
            : undefined,
      });
      await f.page.setViewportSize({ width, height: 1000 });
      const reads = [];
      await f.context.route("**/storage/v1/**", async (route) => {
        const url = new URL(route.request().url());
        const transformed = url.pathname.includes("/render/image/");
        reads.push({
          transformed,
          width: Number(url.searchParams.get("width") || 1000),
        });
        if (state === "both-fail" || (transformed && state === "resize-fails"))
          return route.fulfill({ status: 404, body: "Missing image" });
        await route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="white"/></svg>',
        });
      });
      await f.page.goto(`${base}/venues`);
      const container = f.page.locator(".public-listing-image").first();
      await container.scrollIntoViewIfNeeded();
      if (state === "both-fail")
        await container.getByText("Image unavailable").waitFor();
      else {
        await f.page.waitForFunction(() => {
          const image = document.querySelector(".public-listing-image img");
          return image?.complete && image.naturalWidth > 0;
        });
        const image = container.locator("img");
        assert.equal(await image.getAttribute("alt"), "Image fixture");
        if (state === "resize-fails") {
          assert.equal(await image.getAttribute("src"), original);
          assert.equal(await image.getAttribute("srcset"), null);
        } else
          assert.ok((await image.getAttribute("srcset")).includes("2400w"));
      }
      assert.equal(
        reads.filter((r) => r.transformed).length,
        1,
        `${width}/${state}: one selected candidate`,
      );
      assert.ok(
        reads[0].width <= 640,
        `${width}: card avoids original/full gallery dimensions`,
      );
      assert.equal(
        reads.filter((r) => !r.transformed).length,
        state === "sized" ? 0 : 1,
        "Original downloaded only once and only on failure",
      );
      assert.deepEqual(f.errors, []);
      await f.context.close();
    }
  }
  for (const kind of ["supplier", "venue"]) {
    for (const width of [360, 768, 1024, 1440]) {
      const hero = original.replace(
        "venue-images",
        kind === "supplier" ? "supplier-gallery" : "venue-images",
      );
      const f = await common({
        signedIn: false,
        respond: ({ url }) =>
          url.pathname === `/api/public-${kind}`
            ? {
                ok: true,
                [kind]: {
                  id: "fixture",
                  slug: "fixture",
                  name: "Image fixture",
                  heroImageUrl: hero,
                  gallery: Array.from({ length: 6 }, (_, index) => ({
                    url: hero.replace("fixture.jpg", `gallery-${index}.jpg`),
                  })),
                },
                linkedSuppliers: [],
              }
            : undefined,
      });
      await f.page.setViewportSize({ width, height: 1000 });
      const reads = [];
      await f.context.route("**/storage/v1/**", (route) => {
        reads.push(new URL(route.request().url()));
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"/>',
        });
      });
      await f.page.goto(`${base}/${kind}s/fixture`);
      const cover = f.page.locator(".photo-0");
      await cover.scrollIntoViewIfNeeded();
      await f.page.waitForFunction(
        () => document.querySelector(".photo-0 img")?.naturalWidth > 0,
      );
      assert.equal(
        await cover.locator("img").getAttribute("fetchpriority"),
        "high",
      );
      assert.ok(
        reads.every((url) => url.pathname.includes("/render/image/public/")),
      );
      assert.ok(
        !reads.some((url) => /gallery-[2-5]/.test(url.pathname)),
        "Hidden gallery photos not requested",
      );
      await cover.focus();
      await f.page.keyboard.press("Enter");
      await f.page.getByRole("dialog").waitFor();
      await f.page.keyboard.press("ArrowRight");
      await f.page.waitForFunction(() =>
        document
          .querySelector(".public-gallery-full img")
          ?.currentSrc.includes("gallery-0.jpg"),
      );
      assert.ok(
        (
          await f.page.locator(".public-gallery-full img").getAttribute("sizes")
        ).includes("1200px"),
      );
      await f.page.keyboard.press("Escape");
      await f.page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.deepEqual(f.errors, []);
      await f.context.close();
    }
  }
  console.log(
    "PASS public image sources: 12 responsive card/fallback cases and 8 Supplier/Venue gallery cases; keyboard controls, deferred hidden photos, sized candidates and original fallback preserved.",
  );
} finally {
  await browser.close();
}
