/* global process, console, Buffer, fetch */
// Actual PostgreSQL 17 RLS + PostgREST JWT authorization + Supabase JS queries.
// Creates disposable Docker containers. Never connects to the configured/live project.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
const suffix = `${process.pid}-${Date.now()}`,
  network = `ew-rls-${suffix}`,
  pg = `ew-pg-${suffix}`,
  rest = `ew-rest-${suffix}`;
const secret = "isolated-eventwow-rls-test-secret-at-least-32-characters";
const output =
  process.env.RLS_RESULTS || "/tmp/eventwow-quote-rls-results.json";
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const sql = (input) =>
  execFileSync(
    "docker",
    ["exec", "-i", pg, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const token = (sub, role = "authenticated") => {
  const a = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    b = Buffer.from(
      JSON.stringify({ role, sub, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
  return `${a}.${b}.${createHmac("sha256", secret).update(`${a}.${b}`).digest("base64url")}`;
};
const checks = [];
try {
  docker("network", "create", network);
  docker(
    "run",
    "-d",
    "--rm",
    "--name",
    pg,
    "--network",
    network,
    "-e",
    "POSTGRES_PASSWORD=fixture-password",
    "postgres:17-alpine",
  );
  for (let i = 0; ; i++) {
    try {
      docker("exec", pg, "pg_isready", "-h", "127.0.0.1", "-U", "postgres");
      break;
    } catch (e) {
      if (i === 50) throw e;
      await delay(200);
    }
  }
  sql(
    await readFile(
      new URL(
        "../supabase/tests/fixtures/quote_visibility_baseline.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const legacy = await readFile(
    new URL(
      "../supabase/migrations/20260215_customer_accounts_and_role_profiles.sql",
      import.meta.url,
    ),
    "utf8",
  );
  sql(legacy.slice(legacy.indexOf("do $$")));
  let seed = `insert into public.user_roles values ('${id(5)}','admin'); insert into public.suppliers values ('${id(30)}','${id(3)}'),('${id(40)}','${id(4)}'); insert into public.customers values ('${id(10)}','${id(1)}','Customer one'),('${id(20)}','${id(2)}','Customer two'); insert into public.enquiries values ('${id(100)}','${id(10)}',null),('${id(200)}',null,'${id(1)}'),('${id(300)}','${id(20)}',null);`;
  const statuses = ["draft", "sent", "accepted", "declined", "closed"];
  for (const group of [100, 200, 300])
    for (let j = 0; j < 5; j++) {
      const n = group + j + 1,
        q = id(n),
        supplier = id(group === 300 ? 40 : 30);
      seed += `insert into public.quotes values ('${q}','${id(group)}','${supplier}','${statuses[j]}','${statuses[j]} text'); insert into public.quote_items values ('${q}','${q}','${statuses[j]} item'); insert into public.quote_public_links values ('${q}','${q}','${id(n + 1000)}',null); insert into public.message_threads values ('${q}','${id(group)}','${q}','${supplier}'); insert into public.messages values ('${q}','${q}','${statuses[j]} message',now());`;
    }
  seed += `insert into public.message_threads values ('${id(999)}','${id(100)}','${id(302)}','${id(40)}'); insert into public.messages values ('${id(999)}','${id(999)}','Mismatched private thread',now());`;
  seed += `insert into public.message_threads values ('${id(998)}','${id(100)}',null,'${id(30)}'); insert into public.messages values ('${id(998)}','${id(998)}','Legacy enquiry-only conversation',now());`;
  sql(seed);
  docker(
    "run",
    "-d",
    "--rm",
    "--name",
    rest,
    "--network",
    network,
    "-p",
    "127.0.0.1::3000",
    "-e",
    `PGRST_DB_URI=postgres://authenticator:fixture-password@${pg}:5432/postgres`,
    "-e",
    "PGRST_DB_SCHEMAS=public",
    "-e",
    "PGRST_DB_ANON_ROLE=anon",
    "-e",
    `PGRST_JWT_SECRET=${secret}`,
    "postgrest/postgrest:v12.2.12",
  );
  const address = docker("port", rest, "3000/tcp"),
    url = `http://${address}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i === 50) throw new Error("PostgREST not ready");
    await delay(200);
  }
  // Supabase JS normally adds /rest/v1; PostgREST here is mounted at /.
  const client = (n, role = "authenticated") =>
    createClient(url, "fixture-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${token(id(n), role)}` },
        fetch: (input, init) =>
          fetch(String(input).replace("/rest/v1", ""), init),
      },
    });
  const customer = client(1),
    other = client(2),
    supplier = client(3),
    admin = client(5),
    anonymous = client(0, "anon"),
    service = client(0, "service_role");
  const rows = async (c, t) => {
    const { data, error } = await c.from(t).select("*").order("id");
    assert.equal(error, null, JSON.stringify(error));
    return data;
  };
  assert.equal(
    (await rows(customer, "quotes")).length,
    10,
    "Baseline must reproduce owned draft visibility",
  );
  assert.equal(
    (await rows(anonymous, "quote_public_links")).length,
    15,
    "Baseline token enumeration must reproduce",
  );
  checks.push(
    "baseline: Customer can read owned drafts; anon can enumerate decision tokens",
  );
  sql(
    await readFile(
      new URL(
        "../supabase/migrations/20260912143031_customer_quote_visibility.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const c of [customer, other]) {
    const visible = await rows(c, "quotes");
    assert.ok(visible.length > 0);
    assert.ok(visible.every((q) => q.status !== "draft"));
    assert.equal(visible.length, c === customer ? 8 : 4);
    assert.deepEqual([...new Set(visible.map((q) => q.status))].sort(), [
      "accepted",
      "closed",
      "declined",
      "sent",
    ]);
    assert.ok(
      (await rows(c, "message_threads")).every(
        (t) => !t.quote_id || visible.some((q) => q.id === t.quote_id),
      ),
    );
    assert.equal(
      (await rows(c, "messages")).length,
      visible.length + (c === customer ? 1 : 0),
    );
    assert.equal(
      (await rows(c, "quote_items")).length,
      0,
      "Existing Customer item access is API-only",
    );
    assert.equal((await rows(c, "quote_public_links")).length, 0);
  }
  checks.push(
    "Customer/other Customer: correct rows by both ownership paths; no drafts/items/tokens/draft-linked or mismatched messages",
  );
  assert.equal((await rows(supplier, "quotes")).length, 10);
  assert.equal(
    (await rows(supplier, "quotes")).filter((q) => q.status === "draft").length,
    2,
  );
  assert.equal((await rows(supplier, "quote_items")).length, 10);
  assert.equal((await rows(admin, "quotes")).length, 15);
  assert.equal((await rows(admin, "quote_items")).length, 15);
  assert.equal((await rows(admin, "quote_public_links")).length, 15);
  assert.equal((await rows(service, "quotes")).length, 15);
  assert.equal((await rows(service, "messages")).length, 17);
  assert.equal((await rows(supplier, "quote_public_links")).length, 0);
  const adminWrite = await admin
    .from("quote_public_links")
    .update({ revoked_at: "2026-09-12T00:00:00Z" })
    .eq("id", id(101))
    .select();
  assert.equal(adminWrite.error, null);
  assert.equal(adminWrite.data.length, 1);
  const serviceWrite = await service
    .from("quote_public_links")
    .update({ revoked_at: null })
    .eq("id", id(101))
    .select();
  assert.equal(serviceWrite.error, null);
  assert.equal(serviceWrite.data.length, 1);
  for (const c of [customer, supplier, anonymous]) {
    const result = await c
      .from("quote_public_links")
      .update({ revoked_at: "2026-09-12T00:00:00Z" })
      .eq("id", id(101))
      .select();
    assert.equal(result.error, null);
    assert.deepEqual(result.data, []);
  }
  checks.push(
    "Supplier own drafts/items intact, unrelated Supplier rows denied; Admin and service-role access intact",
  );
  for (const table of [
    "quotes",
    "quote_items",
    "message_threads",
    "messages",
    "quote_public_links",
  ])
    assert.equal((await rows(anonymous, table)).length, 0);
  const denied = await customer
    .from("quotes")
    .update({ status: "sent" })
    .eq("id", id(101))
    .select();
  assert.equal(denied.error, null);
  assert.deepEqual(denied.data, []);
  const linkWrite = await customer
    .from("quote_public_links")
    .insert({ id: id(800), quote_id: id(102), token: id(801) });
  assert.equal(linkWrite.error?.code, "42501");
  checks.push("Anonymous reads and Customer quote/token writes denied");
  const ownedUpdate = await supplier
    .from("quotes")
    .update({ quote_text: "Still private draft" })
    .eq("id", id(101))
    .select();
  assert.equal(ownedUpdate.error, null);
  assert.equal(ownedUpdate.data.length, 1);
  for (const status of [
    "sent",
    "accepted",
    "sent",
    "accepted",
    "declined",
    "closed",
    "draft",
  ]) {
    const update = await service
      .from("quotes")
      .update({ status })
      .eq("id", id(101));
    assert.equal(update.error, null);
    const result = await customer.from("quotes").select("*").eq("id", id(101));
    assert.equal(result.error, null);
    assert.equal(result.data.length, status === "draft" ? 0 : 1);
  }
  checks.push(
    "Draft update, send/accept/re-accept/decline/close transitions retain correct direct-query visibility",
  );
  await mkdir(
    new URL(
      "../docs/verification/customer-supplier-security/",
      import.meta.url,
    ),
    { recursive: true },
  );
  await writeFile(
    output,
    JSON.stringify(
      {
        passed: true,
        engine: "PostgreSQL 17 + PostgREST 12.2.12 + installed Supabase JS",
        migration: "20260912143031_customer_quote_visibility.sql",
        liveProjectModified: false,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.join("\n"));
} finally {
  for (const container of [rest, pg])
    try {
      docker("rm", "-f", container);
    } catch {}
  try {
    docker("network", "rm", network);
  } catch {}
}
