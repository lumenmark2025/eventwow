/* global process, console */
// Compare presentation-only changes with the last reviewed profile migration.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import path from "node:path";
import { parse } from "@babel/parser";
import { chromium } from "playwright";
import { styleSeoLanding } from "./_lib/public-seo-presentation.mjs";
const baseline = "176b9814e8fdbeda903f294d650c83a18066deb5";
const output = process.env.SEO_SCREENSHOTS || "/tmp/eventwow-public-seo-v2";
mkdirSync(output, { recursive: true });
const oldSource = (file) =>
  execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8" });
const clean = (node) =>
  JSON.parse(
    JSON.stringify(node, (key, value) =>
      [
        "loc",
        "start",
        "end",
        "extra",
        "leadingComments",
        "trailingComments",
        "innerComments",
      ].includes(key)
        ? undefined
        : value,
    ),
  );
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node))
    if (Array.isArray(value)) value.forEach((n) => walk(n, visit));
    else if (value && typeof value === "object") walk(value, visit);
}
function ast(src) {
  return parse(src, { sourceType: "module", plugins: ["jsx"] });
}
function contracts(src) {
  const result = {
    meta: [],
    helpers: {},
    readUrls: [],
    seoResponseMappings: [],
  };
  walk(ast(src), (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee?.name === "useMarketingMeta"
    )
      result.meta.push(clean(node.arguments));
    if (
      node.type === "CallExpression" &&
      ["setMeta", "setSchema", "setCategorySlug"].includes(node.callee?.name)
    )
      result.seoResponseMappings.push(clean(node.arguments));
    if (
      node.type === "FunctionDeclaration" &&
      ["titleFromSlug", "clampPage", "injectJsonLd"].includes(node.id?.name)
    )
      result.helpers[node.id.name] = clean(node);
    if (
      node.type === "VariableDeclarator" &&
      ["pageTitle", "pageDescription", "setPage"].includes(node.id?.name)
    )
      result.helpers[node.id.name] = clean(node.init);
    if (
      node.type === "CallExpression" &&
      ["fetch", "publicGet"].includes(node.callee?.name)
    )
      result.readUrls.push(clean(node.arguments));
  });
  return result;
}
const pages = [
  "BrowsePage",
  "CategoryLandingPage",
  "CategoryLocationLandingPage",
  "SupplierSeoLandingPage",
];
for (const name of pages) {
  const file = `src/pages/marketing/${name}.jsx`;
  assert.deepEqual(
    contracts(readFileSync(file, "utf8")),
    contracts(oldSource(file)),
    `${name}: metadata/normalization/pagination/read URLs changed`,
  );
}
assert.equal(
  execFileSync(
    "git",
    [
      "diff",
      baseline,
      "--",
      "api/",
      "supabase/",
      "src/App.jsx",
      "src/lib/marketingMeta.js",
      "src/utils/slugify.js",
      "vercel.json",
    ],
    { encoding: "utf8" },
  ),
  "",
  "Backend, routes, rewrites, sitemap and metadata helper must remain unchanged",
);
const prerenderFile = "scripts/prerender-seo.mjs";
function functions(src) {
  const result = {};
  walk(ast(src), (node) => {
    if (node.type === "FunctionDeclaration") result[node.id.name] = node;
  });
  return result;
}
const oldFns = functions(oldSource(prerenderFile)),
  newSrc = readFileSync(prerenderFile, "utf8"),
  newFns = functions(newSrc);
for (const name of Object.keys(oldFns))
  if (name !== "listPageHtml")
    assert.deepEqual(
      clean(newFns[name]),
      clean(oldFns[name]),
      `Prerender ${name} must remain unchanged`,
    );
function staticContext(src) {
  const fns = functions(src);
  const context = vm.createContext({
    writeFile: async (file, contents) => {
      context.written = { file, contents };
    },
    styleSeoLanding: (html, dir) =>
      styleSeoLanding(html, existsSync(dir) ? dir : undefined),
    path,
    DIST_DIR: path.resolve("dist"),
    SITE_ORIGIN: "https://eventwow.co.uk",
  });
  vm.runInContext(
    Object.values(fns)
      .filter((fn) =>
        [
          "escapeHtml",
          "ensureTag",
          "canonicalFor",
          "setSeoHead",
          "appShell",
          "linkedList",
          "listPageHtml",
          "writeSitemap",
        ].includes(fn.id.name),
      )
      .map((fn) => src.slice(fn.start, fn.end))
      .join("\n"),
    context,
  );
  return context;
}
const oldContext = staticContext(oldSource(prerenderFile)),
  newContext = staticContext(newSrc);
const content = {
  h1: "Catering & events",
  intro:
    "Existing category copy with <reserved> characters and all supporting text.",
  links: [
    { href: "/suppliers/fixture-supplier", label: "Fixture supplier & team" },
  ],
  secondaryLinks: [
    { href: "/categories/music", label: "Music" },
    { href: "/categories/photography", label: "Photography" },
  ],
  secondaryTitle: "Other categories",
};
await oldContext.writeSitemap([
  "/categories",
  "/categories/catering",
  "/categories",
  "/suppliers/fixture-supplier",
]);
await newContext.writeSitemap([
  "/categories",
  "/categories/catering",
  "/categories",
  "/suppliers/fixture-supplier",
]);
assert.deepEqual(
  newContext.written,
  oldContext.written,
  "Generated sitemap bytes/path remain identical",
);
const before = oldContext.listPageHtml(content),
  after = newContext.listPageHtml(content);
const withoutStyle = (html) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace("pr-wrap public-v2 public-seo-prerender", "pr-wrap");
assert.equal(
  withoutStyle(after),
  withoutStyle(before),
  "All static headings, body copy and hrefs must be identical",
);
for (const variant of [
  { ...content, links: [] },
  { ...content, secondaryLinks: [] },
  { ...content, links: [], secondaryLinks: [] },
])
  assert.equal(
    withoutStyle(newContext.listPageHtml(variant)),
    withoutStyle(oldContext.listPageHtml(variant)),
  );
const template =
  '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Initial title</title></head><body></body></html>';
const seo = {
  title: "Catering in UK | Eventwow",
  description: content.intro,
  canonicalPath: "/categories/catering",
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: 1,
  },
};
assert.equal(
  newContext.setSeoHead(template, seo),
  oldContext.setSeoHead(template, seo),
);
const html = newContext
  .setSeoHead(template, seo)
  .replace("<body></body>", `<body>${after}</body>`);
writeFileSync(`${output}/static-category.html`, html);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const serveStatic = async (route) => {
    const url = new URL(route.request().url());
    const file = path.join("dist/assets", path.basename(url.pathname));
    if (url.pathname.startsWith("/assets/") && existsSync(file))
      return route.fulfill({
        body: readFileSync(file),
        contentType: "font/woff2",
      });
    if (url.pathname === "/categories/catering")
      return route.fulfill({ contentType: "text/html", body: html });
    throw new Error(`Unexpected static request ${url}`);
  };
  await context.route("**/*", serveStatic);
  const page = await context.newPage();
  await page.goto("http://seo.fixture.test/categories/catering");
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    assert.equal(await page.locator("h1").innerText(), content.h1);
    assert.equal(
      await page.locator("link[rel=canonical]").getAttribute("href"),
      "https://eventwow.co.uk/categories/catering",
    );
    assert.equal(await page.locator("a").count(), 3);
    await page.screenshot({
      path: `${output}/static-category-${width}.png`,
      fullPage: true,
    });
  }
  await page.locator("a").first().focus();
  assert.equal(
    await page
      .locator("a")
      .first()
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await context.close();
  // Axe needs JavaScript timers. Audit the same static HTML in a second context;
  // the preceding browser checks establish that it works with JS disabled.
  const auditContext = await browser.newContext();
  await auditContext.route("**/*", serveStatic);
  const auditPage = await auditContext.newPage();
  await auditPage.goto("http://seo.fixture.test/categories/catering");
  for (const width of [360, 768, 1024, 1440]) {
    await auditPage.setViewportSize({ width, height: 1000 });
    await auditPage.evaluate(
      readFileSync(
        new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
        "utf8",
      ),
    );
    const violations = await auditPage.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    );
    assert.deepEqual(violations, [], "Static landing accessibility");
  }
  await auditContext.close();
} finally {
  await browser.close();
}
const report = {
  passed: true,
  baseline,
  checks: [
    "All four React metadata calls, slug helpers, pagination callback and read URL expressions identical as AST",
    "API/Supabase/routes/rewrites/dynamic sitemap/metadata helper unchanged",
    "All prerender functions except style-wrapped listPageHtml identical as AST",
    "Static list text, H1/H2, intro, links and empty copy identical after removing CSS/class marker",
    "Static title/description/canonical/schema output identical; existing main() route/content generation and writeSitemap unchanged",
    "Static category without JavaScript: four widths, no overflow, crawlable links and keyboard focus; same static HTML passes axe in an enabled audit context",
    "Generated sitemap bytes/path identical for representative routes including deduplication",
  ],
};
writeFileSync(
  `${output}/contracts.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(report.checks.join("\n"));
