import {
  performanceApiExclusions,
  verifyPerformanceApiContracts,
} from "./fixtures/performance-contracts.mjs";
/* global process, console */
// Actual routes and static renderer output; isolated transport, no live writes.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parse } from "@babel/parser";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
import {
  cleanAst,
  assertAppContract,
} from "./fixtures/assert-app-contract.mjs";
const baseline = "fea139f4c131f21b8322ac90cc6867f949deeee2";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.SWEEP_SCREENSHOTS || "/tmp/eventwow-final-v2-sweep";
await mkdir(output, { recursive: true });
const widths = [360, 768, 1024, 1440];
const axe = await readFile("node_modules/axe-core/axe.min.js", "utf8");
const report = [];
function ast(src) {
  return parse(src, { sourceType: "module", plugins: ["jsx"] });
}
function walk(n, cb) {
  if (!n || typeof n !== "object") return;
  cb(n);
  for (const v of Object.values(n))
    if (Array.isArray(v)) v.forEach((x) => walk(x, cb));
    else if (v && typeof v === "object") walk(v, cb);
}
function contracts(src) {
  const result = [];
  walk(ast(src), (n) => {
    if (n.type === "CallExpression" && n.callee.name === "useMarketingMeta")
      result.push(cleanAst(n));
    if (n.type === "VariableDeclaration") result.push(cleanAst(n));
  });
  return result;
}
for (const name of ["HowItWorksPage", "PricingPage", "ContactPage"]) {
  const file = `src/pages/marketing/${name}.jsx`;
  assert.deepEqual(
    contracts(await readFile(file, "utf8")),
    contracts(
      execFileSync("git", ["show", `${baseline}:${file}`], {
        encoding: "utf8",
      }),
    ),
    `${name} metadata and content constants`,
  );
}
assertAppContract(baseline);
assert.equal(
  execFileSync(
    "git",
    [
      "diff",
      baseline,
      "--",
      "api/",
      "supabase/",
      "src/lib/",
      "vercel.json",
      ...performanceApiExclusions,
    ],
    { encoding: "utf8" },
  ),
  "",
  "Backend, SEO helpers, rewrite and dependency contracts",
);
// The install repair removes three unused roots and npm's bundled tree.
// Preserve the identity of every retained package while allowing npm to restore
// platform-specific optional entries during clean lockfile regeneration.
const oldLock = JSON.parse(
  execFileSync("git", ["show", `${baseline}:package-lock.json`], {
    encoding: "utf8",
  }),
);
const currentLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const manifest = JSON.parse(await readFile("package.json", "utf8"));
for (const name of ["-", "g", "npm"]) {
  delete oldLock.packages[""].dependencies[name];
  assert.equal(name in manifest.dependencies, false);
  assert.equal(`node_modules/${name}` in currentLock.packages, false);
}
assert.deepEqual(currentLock.packages[""], oldLock.packages[""]);
assert.deepEqual(manifest.dependencies, currentLock.packages[""].dependencies);
for (const [name, previous] of Object.entries(oldLock.packages)) {
  if (
    !name ||
    ["node_modules/-", "node_modules/g", "node_modules/npm"].includes(name) ||
    name.startsWith("node_modules/npm/")
  )
    continue;
  const current = currentLock.packages[name];
  assert.ok(current, `${name}: retained dependency`);
  for (const key of ["version", "resolved", "integrity"])
    assert.equal(current[key], previous[key], `${name}: ${key}`);
}
for (const [name, entry] of Object.entries(currentLock.packages)) {
  if (name in oldLock.packages) continue;
  assert.ok(
    entry.optional && entry.os?.length,
    `${name}: restored optional platform package`,
  );
}
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
async function capture(page, name) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator("h1").count(), 1, `${name} single H1`);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `${name} overflow ${width}`,
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
    assert.deepEqual(violations, [], `${name} accessibility ${width}`);
    await page.screenshot({
      path: `${output}/${name}-${width}.png`,
      fullPage: true,
    });
    report.push({ name, width, passed: true });
  }
}
try {
  for (const [route, title, h1, desc] of [
    [
      "/how-it-works",
      "How it works",
      "How Eventwow works",
      "See the customer and supplier journey from request to booking confirmation.",
    ],
    [
      "/pricing",
      "Pricing",
      "Simple pricing",
      "Simple, transparent pricing for customers and event suppliers.",
    ],
    [
      "/contact",
      "Contact",
      "Contact Eventwow",
      "Get in touch with Eventwow support and partnership team.",
    ],
  ]) {
    const { context, page, errors } = await common({
      signedIn: false,
    });
    const modules = [];
    page.on("request", (request) => modules.push(request.url()));
    await page.goto(base + route);
    await page.getByRole("heading", { name: h1, exact: true }).waitFor();
    assert.ok((await page.title()).startsWith(title));
    assert.equal(
      await page.locator("meta[name=description]").getAttribute("content"),
      desc,
    );
    assert.equal(
      await page.locator("link[rel=canonical]").getAttribute("href"),
      "https://eventwow.co.uk" + route,
    );
    assert.equal(
      await page.locator('script[type="application/ld+json"]').count(),
      0,
      "No new marketing schema",
    );
    await capture(page, route.slice(1));
    if (route === "/how-it-works") {
      const question = page.locator("summary").first();
      await question.focus();
      await page.keyboard.press("Enter");
      assert.equal(await question.locator("..").getAttribute("open"), "");
      await page
        .getByText(
          "We match your request to relevant suppliers so you get quality options instead of noise.",
        )
        .waitFor();
      await page.keyboard.press("Enter");
      assert.equal(await question.locator("..").getAttribute("open"), null);
      assert.equal(
        await page
          .getByRole("link", { name: "Get quotes", exact: true })
          .getAttribute("href"),
        "/categories",
      );
    }
    if (route === "/pricing") {
      for (const text of [
        "Coming soon",
        "Growth features in roadmap",
        "Advanced analytics",
        "Priority placements",
        "Team workflows",
      ])
        await page.getByText(text, { exact: true }).waitFor();
    }
    if (route === "/contact") {
      const mail = page.getByRole("link", { name: "Email support" });
      assert.equal(
        await mail.getAttribute("href"),
        "mailto:hello@eventwow.co.uk?subject=Eventwow%20Enquiry",
      );
      await mail.focus();
      assert.equal(
        await mail.evaluate((el) => el === document.activeElement),
        true,
      );
    }
    assert.deepEqual(errors, []);
    assert.equal(
      modules.some((r) =>
        /src\/pages\/(admin|supplier|venue|customer)\/|BookingsCalendar/.test(
          r,
        ),
      ),
      false,
      "Role code stays lazy",
    );
    await context.close();
  }
  // Exercise the actual global Suspense and boundary by blocking one lazy module.
  {
    const { context, page } = await common({ signedIn: false });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await context.route(
      "**/src/pages/marketing/PricingPage.jsx*",
      async (route) => {
        await gate;
        await route.abort();
      },
    );
    await page.goto(base + "/pricing", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Loading page…", exact: true })
      .waitFor();
    await capture(page, "route-loading");
    release();
    await page
      .getByRole("heading", { name: "This page could not load" })
      .waitFor();
    await capture(page, "route-error");
    await context.unroute("**/src/pages/marketing/PricingPage.jsx*");
    await page.getByRole("button", { name: "Reload page" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Simple pricing" }).waitFor();
    await context.close();
  }
  // Existing unknown flat slug state and unmatched multi-segment redirect remain.
  {
    const { context, page } = await common({ signedIn: false });
    await context.route("**/api/public/seo/suppliers?*", (route) =>
      route.fulfill({ status: 404, json: { error: "Not found" } }),
    );
    await page.goto(base + "/unknown-fixture-slug");
    await page.getByText("Page not found", { exact: true }).waitFor();
    await capture(page, "not-found");
    await page.goto(base + "/unknown-fixture/path/deep");
    await page.waitForURL(base + "/");
    await context.close();
  }
  // Actual emitted static bodies: no client app or JS required to read/link them.
  for (const name of ["home", "home-empty", "detail", "detail-empty"]) {
    const html = await readFile(
      `${process.env.SEO_SCREENSHOTS || "/tmp/eventwow-public-seo-v2"}/static-${name}.html`,
      "utf8",
    );
    const serve = async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/assets/"))
        return route.fulfill({
          body: await readFile("dist" + url.pathname),
          contentType: "font/woff2",
        });
      return route.fulfill({ body: html, contentType: "text/html" });
    };
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", serve);
    const page = await context.newPage();
    await page.goto("http://static.fixture.test/");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      await page.screenshot({
        path: `${output}/static-${name}-${width}.png`,
        fullPage: true,
      });
      assert.equal(await page.locator("h1").count(), 1);
    }
    const first = page.locator("a").first();
    if (await first.count()) {
      await first.focus();
      assert.equal(
        await first.evaluate((el) => el === document.activeElement),
        true,
      );
    }
    await context.close();
    const audit = await browser.newContext();
    await audit.route("**/*", serve);
    const ap = await audit.newPage();
    await ap.goto("http://static.fixture.test/");
    await capture(ap, "static-" + name);
    await audit.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  `${output}/results.json`,
  JSON.stringify({ baseline, passed: true, screens: report }, null, 2) + "\n",
);
console.log(
  `Final sweep: ${report.length} responsive/axe checks; content/meta/routes, FAQ keyboard, email handoff, global loading/error/reload, not-found/redirect, JS-disabled static home/profile checks passed.`,
);

verifyPerformanceApiContracts();
