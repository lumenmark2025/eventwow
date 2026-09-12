/* global process, console */
// Isolated build matrix. Never load repository .env files or contact real data.
import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  symlink,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = await mkdtemp(path.join(tmpdir(), "eventwow-build-matrix-"));
const output =
  process.env.BUILD_VERIFICATION_OUTPUT || "/tmp/eventwow-preview-build";
await mkdir(output, { recursive: true });
const key = `build-fixture-${randomUUID()}`;
let failQueries = false;
const requests = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://fixture.test");
  requests.push({
    path: url.pathname,
    authorized:
      req.headers.apikey === key &&
      req.headers.authorization === `Bearer ${key}`,
  });
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET" || !requests.at(-1).authorized) {
    res.statusCode = 401;
    res.end(JSON.stringify({ message: "Fixture authorization failed" }));
    return;
  }
  if (failQueries) {
    res.statusCode = 503;
    res.end(JSON.stringify({ message: "Fixture data unavailable" }));
    return;
  }
  const rows = url.pathname.endsWith("/information_schema.columns")
    ? [
        "display_name",
        "description",
        "is_active",
        "is_published",
        "published_at",
      ].map((column_name) => ({ column_name }))
    : url.pathname.endsWith("/supplier_category_options")
      ? [
          {
            slug: "fixture-category",
            display_name: "Fixture catering",
            description: "Fixture category copy",
            is_active: true,
          },
        ]
      : url.pathname.endsWith("/venues")
        ? [
            {
              slug: "fixture-venue",
              name: "Fixture venue",
              city: "Manchester",
              description: "Fixture venue copy",
            },
          ]
        : url.pathname.endsWith("/suppliers")
          ? [
              {
                slug: "fixture-supplier",
                business_name: "Fixture supplier",
                base_city: "Manchester",
                description: "Fixture supplier copy",
                listing_categories: ["Fixture catering"],
              },
            ]
          : null;
  if (!rows) res.statusCode = 404;
  res.end(JSON.stringify(rows || { message: "Unexpected fixture route" }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const baseEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  CI: "1",
  NO_COLOR: "1",
  SUPABASE_URL: "",
  VITE_SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  VITE_SUPABASE_ANON_KEY: "fixture-public-anon",
};
const report = [];
async function run(name, env, { build = false, success, skip = false } = {}) {
  const result = await exec(
    build ? "npm" : process.execPath,
    build ? ["run", "build"] : ["scripts/prerender-seo.mjs"],
    {
      cwd: workspace,
      env: { ...baseEnv, ...env },
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    },
  ).then(
    (r) => ({ ...r, code: 0 }),
    (e) => ({ stdout: e.stdout || "", stderr: e.stderr || "", code: e.code }),
  );
  const log = result.stdout + result.stderr;
  await writeFile(
    path.join(output, name + ".log"),
    log.replaceAll(key, "[fixture-key]"),
  );
  assert.equal(
    result.code === 0,
    success,
    `${name}: unexpected exit; see ${output}/${name}.log`,
  );
  assert.equal(
    log.includes("skipped for Preview"),
    skip,
    `${name}: skip decision`,
  );
  if (build) assert.match(log, /built in /, `${name}: Vite compiled first`);
  if (success && !skip) assert.match(log, /\[prerender-seo\] completed/);
  if (!success)
    assert.match(
      log,
      name.endsWith("data-error")
        ? /Failed to load categories: Fixture data unavailable/
        : /Missing SUPABASE_URL .*SUPABASE_SERVICE_ROLE_KEY for prerender build/,
    );

  report.push({ name, exit: result.code, build, skip, passed: true });
}
async function scan(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await scan(file);
    else {
      const bytes = await readFile(file);
      assert.equal(
        bytes.includes(key),
        false,
        `Private canary leaked into ${entry.name}`,
      );
      count++;
    }
  }
  return count;
}
try {
  for (const file of [
    "src",
    "public",
    "scripts",
    "index.html",
    "package.json",
    "vite.config.js",
    "tailwind.config.js",
    "postcss.config.js",
  ])
    await cp(path.join(root, file), path.join(workspace, file), {
      recursive: true,
    });
  await symlink(
    path.join(root, "node_modules"),
    path.join(workspace, "node_modules"),
    "dir",
  );
  await run(
    "preview-no-key",
    { VERCEL_ENV: "preview", VITE_SUPABASE_URL: url },
    { build: true, success: true, skip: true },
  );
  assert.match(
    await readFile(path.join(workspace, "dist/index.html"), "utf8"),
    /<div id="root"><\/div>/,
  );
  assert.equal(requests.length, 0, "Preview skip makes no privileged reads");
  await run(
    "production-no-key",
    { VERCEL_ENV: "production", VITE_SUPABASE_URL: url },
    { build: true, success: false },
  );
  for (const [name, env, skip] of [
    [
      "preview-no-url",
      { VERCEL_ENV: "preview", SUPABASE_SERVICE_ROLE_KEY: key },
      true,
    ],
    [
      "preview-whitespace-key",
      {
        VERCEL_ENV: "preview",
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: "  ",
      },
      true,
    ],
    [
      "production-no-url",
      { VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: key },
      false,
    ],
    ["local-no-credentials", {}, false],
    ["development-no-credentials", { VERCEL_ENV: "development" }, false],
    ["unknown-env-no-credentials", { VERCEL_ENV: "Preview" }, false],
  ])
    await run(name, env, { success: skip, skip });
  await run(
    "production-with-credentials",
    {
      VERCEL_ENV: "production",
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: key,
      VITE_SUPABASE_URL: url,
    },
    { build: true, success: true },
  );
  assert.ok(requests.length >= 6);
  assert.ok(requests.every((r) => r.authorized));
  const sitemap = await readFile(
    path.join(workspace, "dist/sitemap.xml"),
    "utf8",
  );
  for (const route of [
    "/categories/fixture-category",
    "/suppliers/fixture-supplier",
    "/venues/fixture-venue",
  ]) {
    assert.ok(sitemap.includes("https://eventwow.co.uk" + route));
    const html = await readFile(
      path.join(workspace, "dist", route.slice(1), "index.html"),
      "utf8",
    );
    assert.ok(html.includes("public-seo-prerender"));
    assert.ok(html.includes(`href="https://eventwow.co.uk${route}"`));
  }
  const scannedFiles = await scan(path.join(workspace, "dist"));
  // Reuse the clean Vite template, because prerender replaces root HTML in-place.
  await writeFile(
    path.join(workspace, "dist/index.html"),
    await readFile(path.join(root, "index.html"), "utf8"),
  );
  await run(
    "preview-with-credentials",
    {
      VERCEL_ENV: "preview",
      VITE_SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: key,
    },
    { success: true },
  );
  await writeFile(
    path.join(workspace, "dist/index.html"),
    await readFile(path.join(root, "index.html"), "utf8"),
  );
  await writeFile(
    path.join(workspace, ".env.local"),
    `SUPABASE_URL=${url}\nSUPABASE_SERVICE_ROLE_KEY=${key}\n`,
  );
  await run(
    "local-dotenv-credentials",
    { SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    { success: true },
  );
  await rm(path.join(workspace, ".env.local"));
  failQueries = true;
  for (const target of ["preview", "production"])
    await run(
      `${target}-data-error`,
      { VERCEL_ENV: target, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key },
      { success: false },
    );
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        passed: true,
        scannedFiles,
        requests: requests.length,
        cases: report,
        liveSupabase: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS ${report.length} build/prerender cases; ${scannedFiles} generated files scanned with a private canary; fixture Supabase requests only.`,
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(workspace, { recursive: true, force: true });
}
