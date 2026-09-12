/* global process, setTimeout, performance */
// Real handlers and Supabase client, isolated PostgREST transport. No live data/RLS claims.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { workflowBackend, invoke } from "./fixtures/workflow-backend.mjs";

const baseline = "c0d08ae27022ee906d484421f0a6a4752b9f7d46";
const files = ["public-suppliers", "public-supplier", "public-venue"];
const fixture = workflowBackend();
const supplier = fixture.tables.suppliers[0];
supplier.slug = "fixture-supplier";
fixture.tables.suppliers[1].slug = "other-supplier";
fixture.tables.venues = [
  {
    id: "venue-1",
    slug: "fixture-venue",
    name: "Fixture venue",
    is_published: true,
  },
];
fixture.tables.venue_images = [
  { id: "image-1", venue_id: "venue-1", type: "hero", path: "fixture.jpg" },
];
fixture.tables.venue_suppliers_link = [
  { venue_id: "venue-1", supplier_id: supplier.id },
];
fixture.tables.supplier_performance_30d = [
  {
    supplier_id: supplier.id,
    invites_count: 5,
    quotes_sent_count: 3,
    quotes_accepted_count: 1,
  },
];
fixture.tables.supplier_review_stats = [
  { supplier_id: supplier.id, average_rating: 4, review_count: 1 },
];
fixture.tables.supplier_reviews = [
  {
    supplier_id: supplier.id,
    rating: 4,
    review_text: "Fixture review",
    is_approved: true,
    created_at: "2026-09-01",
  },
  {
    supplier_id: supplier.id,
    rating: 1,
    review_text: "Unapproved",
    is_approved: false,
  },
];
const seed = structuredClone(fixture.tables);
const restore = fixture.install();
const results = [];

async function run(handler, name, scenario = {}, delay = 0) {
  Object.assign(fixture.tables, structuredClone(seed));
  fixture.requests.length = 0;
  fixture.faults.length = 0;
  scenario.prepare?.(fixture.tables);
  fixture.faults.push(
    ...(scenario.faults || []).map((table) => ({
      table,
      method: "GET",
      message: "Fixture failure",
    })),
  );
  if (scenario.missingView)
    fixture.faults.push({
      table: "supplier_performance_30d",
      method: "GET",
      code: "42P01",
    });
  const trace = [];
  let active = 0,
    peak = 0;
  const start = performance.now();
  globalThis.fetch = async (...args) => {
    const record = {
      table: new URL(args[0]).pathname.split("/").at(-1),
      startMs: performance.now() - start,
    };
    trace.push(record);
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await fixture.fetch(...args);
    } finally {
      active--;
      record.endMs = performance.now() - start;
    }
  };
  const result = await invoke(handler, {
    role: null,
    query: {
      slug: name === "public-venue" ? "fixture-venue" : "fixture-supplier",
      ...scenario.query,
    },
    method: scenario.method || "GET",
  });
  assert.deepEqual(fixture.blocked, [], "No external requests");
  assert.ok(
    fixture.requests.every((r) => r.method === "GET"),
    "Read-only handlers",
  );
  return {
    result,
    queries: fixture.requests.map((r) => JSON.stringify(r)).sort(),
    peak,
    elapsedMs: Math.round(performance.now() - start),
    trace,
  };
}

try {
  for (const name of files) {
    // Keep relative helper imports identical while loading the pre-optimization handler.
    const temp = new URL(
      `../api/.performance-baseline-${process.pid}-${name}.js`,
      import.meta.url,
    );
    await writeFile(
      temp,
      execFileSync("git", ["show", `${baseline}:api/${name}.js`]),
    );
    try {
      const before = (await import(temp.href)).default;
      const after = (await import(`../api/${name}.js`)).default;
      const oldRun = await run(before, name, {}, 50);
      const newRun = await run(after, name, {}, 50);
      assert.equal(newRun.result.status, 200);
      assert.deepEqual(
        newRun.result,
        oldRun.result,
        `${name}: identical public response`,
      );
      assert.deepEqual(
        newRun.queries,
        oldRun.queries,
        `${name}: identical query shapes and counts`,
      );
      if (!process.env.PERFORMANCE_BASELINE)
        assert.equal(newRun.peak, 3, `${name}: independent reads overlap`);
      results.push({
        route: `/api/${name}`,
        queries: newRun.queries.length,
        beforeMs: oldRun.elapsedMs,
        afterMs: newRun.elapsedMs,
        beforePeak: oldRun.peak,
        afterPeak: newRun.peak,
        beforeTrace: oldRun.trace,
        afterTrace: newRun.trace,
      });
      const scenarios = [
        { method: "POST" },
        { query: { slug: "missing", q: "no-match", limit: "1", offset: "1" } },
        {
          prepare: (t) => {
            t.suppliers = [];
            t.venues = [];
          },
        },
        {
          prepare: (t) => {
            t.suppliers.forEach((s) => (s.is_published = false));
            t.venues.forEach((v) => (v.is_published = false));
          },
        },
        {
          prepare: (t) => {
            t.supplier_images = [];
            t.venue_suppliers_link = [];
          },
        },
        { missingView: true },
        {
          query: {
            q: "catering",
            category: "catering",
            sort: "newest",
            limit: "1",
            offset: "1",
          },
        },
        ...[
          "suppliers",
          "supplier_images",
          "supplier_performance_30d",
          "supplier_review_stats",
          "supplier_reviews",
          "venues",
          "venue_images",
          "venue_suppliers_link",
        ].map((table) => ({ faults: [table] })),
        {
          faults: [
            "supplier_images",
            "supplier_performance_30d",
            "supplier_review_stats",
          ],
        },
        { faults: ["venue_images", "venue_suppliers_link"] },
      ];
      for (const scenario of scenarios) {
        const old = await run(before, name, scenario);
        const current = await run(after, name, scenario);
        assert.deepEqual(
          current.result,
          old.result,
          `${name}: preserved error/visibility/filter contract ${JSON.stringify(scenario)}`,
        );
        // No downstream reads after the initial publication gate fails.
        if (current.result.status === 404)
          assert.deepEqual(current.queries, old.queries);
      }
      process.stdout.write(
        `PASS ${name}: response, query, publication gate, approved reviews, filter/pagination and error precedence contracts\n`,
      );
    } finally {
      await unlink(temp);
    }
  }
  if (process.env.PERFORMANCE_REPORT)
    await writeFile(
      process.env.PERFORMANCE_REPORT,
      JSON.stringify({ simulatedQueryDelayMs: 50, results }, null, 2) + "\n",
    );
  process.stdout.write(
    JSON.stringify(
      results.map(
        ({ route, queries, beforeMs, afterMs, beforePeak, afterPeak }) => ({
          route,
          queries,
          beforeMs,
          afterMs,
          beforePeak,
          afterPeak,
        }),
      ),
      null,
      2,
    ) + "\n",
  );
} finally {
  restore();
}
