import assert from "node:assert/strict";
import { test } from "node:test";
import { publicGet } from "../src/lib/publicRequest.js";

test("overlapping public reads share one request, but later visits fetch fresh data", async () => {
  const original = globalThis.fetch;
  let finish,
    calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => {
      finish = resolve;
    });
    return new Response(JSON.stringify({ rows: [{ id: `record-${calls}` }] }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const first = publicGet("/api/public-venues?limit=4"),
      second = publicGet("/api/public-venues?limit=4");
    assert.equal(calls, 1);
    finish();
    assert.deepEqual(await first, await second);
    const fresh = publicGet("/api/public-venues?limit=4");
    assert.equal(calls, 2);
    finish();
    assert.equal((await fresh).rows[0].id, "record-2");
  } finally {
    globalThis.fetch = original;
  }
});

test("failed or malformed public responses are errors and do not poison retries", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 });
    await assert.rejects(publicGet("/api/public-suppliers"), /Unavailable/);
    globalThis.fetch = async () => new Response("<html>Wrong route</html>");
    await assert.rejects(publicGet("/api/public-suppliers"), SyntaxError);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ rows: [], totalCount: 0 }));
    assert.deepEqual(await publicGet("/api/public-suppliers"), {
      rows: [],
      totalCount: 0,
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("profile callers can distinguish unpublished/missing profiles from service failures", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [404, 503]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: "Profile unavailable" }), { status });
      await assert.rejects(publicGet("/api/public-venue?slug=missing"), error => error.status === status && error.message === "Profile unavailable");
    }
  } finally {
    globalThis.fetch = original;
  }
});
