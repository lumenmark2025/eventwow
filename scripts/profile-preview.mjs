// Opt-in real deployment measurements. No fixture responses or application changes.
// Storage state / share URL remain in memory; reports omit query values, IDs,
// credentials, response bodies, DOM text and screenshots.
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const knownSegments = new Set(
  `api public supplier suppliers venue venues customer customers admin dashboard enquiries quotes bookings messages auth v1 rest token user user_profiles user_roles credit_transactions enquiry_suppliers supplier_bookings supplier-performance supplier-credits supplier-notifications public-suppliers public-venues public-supplier public-venue categories options ranking messaging-targets admin-quote-funnel admin-supplier-metrics admin-credits-ledger credit_transactions notifications quote_items message_threads supplier_review_stats supplier_performance_30d supplier_images venue_images login`.split(
    " ",
  ),
);

export function resourceLabel(raw, origin) {
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol)) return "inline-resource";
  const host = url.origin === origin ? "preview" : url.hostname;
  const path = url.pathname.startsWith("/assets/")
    ? url.pathname
    : url.pathname
        .split("/")
        .map((part) => (knownSegments.has(part) ? part : part ? ":value" : ""))
        .join("/");
  return `${host}${path}${url.search ? `?${[...new Set(url.searchParams.keys())].sort().join("&")}` : ""}`;
}

export async function probe(url) {
  const start = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const ttfbMs = Math.round(performance.now() - start);
    const location = response.headers.get("location") || "";
    const protectedRedirect =
      response.status >= 300 &&
      response.status < 400 &&
      /vercel\.com\/(sso|login)|\/sso-api\//.test(location);
    // Drain without retaining body contents. Never record cookies or Location tokens.
    const bytes = (await response.arrayBuffer()).byteLength;
    return {
      status: response.status,
      ttfbMs,
      totalMs: Math.round(performance.now() - start),
      bytes,
      protectedRedirect,
      cache: response.headers.get("x-vercel-cache"),
    };
  } catch {
    return {
      status: null,
      error: "Request failed or timed out; URL and credentials omitted",
    };
  }
}

export async function capture(page, origin, route, timeoutMs = 15000) {
  const records = [],
    pending = [];
  const start = performance.now();
  const requestIds = new Map();
  const requests = new Map();
  let scriptErrors = 0;
  const onError = () => scriptErrors++;
  const onRequest = (request) => {
    // Stable opaque identity within this sample detects duplicates without saving
    // raw URLs (which may contain IDs, search terms, tokens or signed media keys).
    const identity = `${request.method()} ${request.url()}`;
    if (!requestIds.has(identity))
      requestIds.set(identity, requestIds.size + 1);
    const row = {
      resource: resourceLabel(request.url(), origin),
      identity: requestIds.get(identity),
      type: request.resourceType(),
      method: request.method(),
      startMs: Math.round(performance.now() - start),
    };
    requests.set(request, row);
    records.push(row);
  };
  const onFinished = (request) => {
    pending.push(
      (async () => {
        const row = requests.get(request);
        if (!row) return;
        const timing = request.timing();
        row.durationMs = Math.round(performance.now() - start - row.startMs);
        row.ttfbMs =
          timing.responseStart >= 0 && timing.requestStart >= 0
            ? Math.round(timing.responseStart - timing.requestStart)
            : null;
        row.status = (await request.response())?.status();
        try {
          const sizes = await request.sizes();
          row.responseBodyBytes = sizes.responseBodySize;
          row.responseHeaderBytes = sizes.responseHeadersSize;
        } catch {
          row.responseBodyBytes = null;
        }
      })(),
    );
  };
  const onFailed = (request) => {
    const row = requests.get(request);
    if (row) row.failed = true;
  };
  page.on("request", onRequest);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);
  page.on("pageerror", onError);
  let outcome = "unmeasured",
    firstUsefulMs = null;
  let resources = [],
    images = [],
    paint = [];
  try {
    await page.goto(new URL(route.path, origin).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    if (new URL(page.url()).origin !== origin)
      outcome = "external-auth-or-protection-redirect";
    else if (/^\/login\/?$/.test(new URL(page.url()).pathname))
      outcome = "application-login-required";
    else {
      await page
        .locator(route.usefulSelector)
        .first()
        .waitFor({ state: "visible", timeout: timeoutMs });
      firstUsefulMs = Math.round(performance.now() - start);
      outcome = "useful-selector-visible";
      // Fixed observation window, not networkidle: capture secondary panels too.
      await page.waitForTimeout(2000);
      const metrics = await page.evaluate(() => ({
        resources: performance.getEntriesByType("resource").map((r) => ({
          url: r.name,
          startMs: r.startTime,
          durationMs: r.duration,
          transferBytes: r.transferSize,
          encodedBodyBytes: r.encodedBodySize,
          decodedBodyBytes: r.decodedBodySize,
          renderBlockingStatus: r.renderBlockingStatus || "unknown",
        })),
        images: [...document.images]
          .filter((img) => img.currentSrc)
          .map((img) => ({
            url: img.currentSrc,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            renderedWidth: Math.round(img.getBoundingClientRect().width),
            renderedHeight: Math.round(img.getBoundingClientRect().height),
            loading: img.loading,
          })),
        paint: performance
          .getEntriesByType("paint")
          .map((p) => ({ name: p.name, startMs: p.startTime })),
      }));
      const redact = ({ url, ...rest }) => ({
        resource: resourceLabel(url, origin),
        ...rest,
      });
      resources = metrics.resources.map(redact);
      images = metrics.images.map(redact);
      paint = metrics.paint;
    }
  } catch {
    outcome = "navigation-or-useful-content-timeout";
  } finally {
    page.off("request", onRequest);
    page.off("requestfinished", onFinished);
    page.off("requestfailed", onFailed);
    page.off("pageerror", onError);
    await Promise.allSettled(pending);
  }
  const duplicates = [...requestIds.values()]
    .map((identity) => ({
      identity,
      count: records.filter((r) => r.identity === identity).length,
    }))
    .filter((r) => r.count > 1);
  const overlap = records
    .filter((r, index) =>
      records
        .slice(0, index)
        .some(
          (previous) =>
            previous.identity === r.identity &&
            previous.startMs + (previous.durationMs ?? Infinity) > r.startMs,
        ),
    )
    .map((r) => r.identity);
  return {
    route: route.name,
    navigationMode: "document",
    outcome,
    firstUsefulMs,
    observationMs: Math.round(performance.now() - start),
    scriptErrors,
    resources,
    images,
    paint,
    repeatedRequests: duplicates,
    overlappingRequestIdentities: overlap,
    requests: records,
  };
}

async function main() {
  const config = JSON.parse(
    await readFile(process.env.PREVIEW_PROFILE_CONFIG, "utf8"),
  );
  const origin = new URL(config.origin).origin;
  if (
    new URL(origin).protocol !== "https:" &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)
  )
    throw new Error("Expected HTTPS Preview or local test origin");
  for (const route of config.routes) {
    if (new URL(route.path, origin).origin !== origin)
      throw new Error("Routes must stay on the configured origin");
  }
  const report = {
    measuredAt: new Date().toISOString(),
    deployment: origin,
    mode: config.probeOnly ? "protection-probe" : "browser",
    note: "First/repeat are observation order, not verified serverless cold/warm state. No response bodies or credentials are recorded.",
    results: [],
  };
  if (config.probeOnly) {
    for (const route of config.routes) {
      const samples = [];
      for (let i = 0; i < 3; i++)
        samples.push(await probe(new URL(route.path, origin)));
      report.results.push({ route: route.name, samples });
    }
  } else {
    const browser = await chromium.launch({
      headless: process.env.PREVIEW_HEADED !== "1",
    });
    try {
      const context = await browser.newContext({
        storageState: process.env.PREVIEW_STORAGE_STATE || undefined,
        viewport: config.viewport || { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      if (process.env.PREVIEW_ACCESS_URL) {
        if (new URL(process.env.PREVIEW_ACCESS_URL).origin !== origin)
          throw new Error("Share link must belong to this deployment");
        await page.goto(process.env.PREVIEW_ACCESS_URL, {
          waitUntil: "domcontentloaded",
        });
      }
      for (const route of config.routes) {
        const samples = [];
        for (let i = 0; i < 3; i++)
          samples.push(await capture(page, origin, route));
        report.results.push({ route: route.name, samples });
      }
    } finally {
      await browser.close();
    }
  }
  await writeFile(
    process.env.PREVIEW_PROFILE_OUTPUT || "/tmp/eventwow-preview-profile.json",
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Recorded ${report.results.length} route groups (${report.mode}); inspect outcomes before treating samples as application timings.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      "Preview profiling failed. Check the local configuration, browser availability and access. Sensitive exception details omitted.",
    );
    process.exitCode = 1;
  });
}
