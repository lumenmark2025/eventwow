/* global process, setTimeout, performance */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";

const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const results = [];
try {
  for (const role of ["supplier", "admin"]) {
    const f = await common({ role });
    const trace = [];
    const start = performance.now();
    await f.context.route(/\/api\/|\/rest\/v1\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const slow =
        role === "supplier"
          ? ["/api/supplier-performance", "/api/supplier/ranking"].includes(
              url.pathname,
            )
          : url.pathname === "/api/admin-credits-ledger";
      trace.push({
        path: url.pathname + url.search,
        method: request.method(),
        startMs: Math.round(performance.now() - start),
      });
      await new Promise((resolve) => setTimeout(resolve, slow ? 1200 : 200));
      return route.fallback();
    });
    const slowPath =
      role === "supplier"
        ? "/api/supplier/ranking"
        : "/api/admin-credits-ledger";
    const slowResponse = f.page.waitForResponse(
      (r) => new URL(r.url()).pathname === slowPath,
    );
    let slowFinished = false;
    const settled = slowResponse.then(async (response) => {
      await response.finished();
      slowFinished = true;
    });
    await f.page.goto(`${base}/${role}/dashboard`);
    const metric = f.page.locator(".ew-metric").filter({
      hasText: role === "supplier" ? "Open requests" : "Quotes sent",
    });
    // Wait for a useful value, not just the route shell or skeleton.
    await metric.locator("strong").waitFor();
    await f.page.waitForFunction(
      (label) =>
        [...document.querySelectorAll(".ew-metric")].some(
          (e) =>
            e.textContent.includes(label) &&
            e.getAttribute("aria-busy") === "false",
        ),
      role === "supplier" ? "Open requests" : "Quotes sent",
    );
    const firstMetricMs = Math.round(performance.now() - start);
    if (!process.env.PERFORMANCE_BASELINE)
      assert.equal(
        slowFinished,
        false,
        `${role}: useful metrics appear before slow panel`,
      );
    await settled;
    const completeMs = Math.round(performance.now() - start);
    await f.page.waitForFunction(
      () => !document.querySelector('.ew-metric[aria-busy="true"]'),
    );
    assert.deepEqual(f.errors, [], `${role}: no browser exceptions`);
    const dataRequests = trace.filter(
      (r) =>
        !r.path.includes("user_profiles") && !r.path.includes("auth_user_id"),
    );
    const keys = dataRequests.map((r) => `${r.method} ${r.path}`);
    assert.equal(
      new Set(keys).size,
      keys.length,
      `${role}: no duplicate page reads`,
    );
    if (role === "supplier" && !process.env.PERFORMANCE_BASELINE) {
      const serviceStart = trace.find(
        (r) => r.path === "/api/supplier-performance",
      ).startMs;
      const countsStart = trace.find((r) =>
        r.path.includes("/rest/v1/credit_transactions"),
      ).startMs;
      assert.ok(
        serviceStart < countsStart + 200,
        "Supplier services start before database counts finish",
      );
    }
    results.push({ role, firstMetricMs, completeMs, trace });
    await f.context.close();
  }
  if (process.env.PERFORMANCE_REPORT)
    await writeFile(
      process.env.PERFORMANCE_REPORT,
      JSON.stringify(
        { fixtureLatencyMs: { normal: 200, slowPanel: 1200 }, results },
        null,
        2,
      ) + "\n",
    );
  process.stdout.write(
    JSON.stringify(
      results.map(({ role, firstMetricMs, completeMs }) => ({
        role,
        firstMetricMs,
        completeMs,
      })),
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
