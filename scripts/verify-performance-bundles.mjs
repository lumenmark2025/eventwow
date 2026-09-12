/* global process */
import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Run after vite build --manifest. This checks emitted chunks, not source import strings.
const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
function staticGraph(key, found = new Set()) {
  if (found.has(key)) return found;
  found.add(key);
  for (const dependency of manifest[key].imports || [])
    staticGraph(dependency, found);
  return found;
}
const protectedEntry = (key) =>
  /^src\/(pages\/(admin|supplier|customer|venue)\/|(?:admin|supplier|customer|venue)\/layout\/)/.test(
    key,
  );
const calendar = "src/components/supplier/BookingsCalendar.jsx";
assert.ok(manifest[calendar].isDynamicEntry);
for (const [key, value] of Object.entries(manifest)) {
  if (protectedEntry(key))
    assert.ok(value.isDynamicEntry, `${key}: retains lazy entry`);
  if (key === "index.html" || key.startsWith("src/pages/marketing/")) {
    assert.ok(
      ![...staticGraph(key)].some(protectedEntry),
      `${key}: no workspace entry in static graph`,
    );
    assert.ok(!staticGraph(key).has(calendar), `${key}: no eager calendar`);
  }
}
assert.ok(
  !staticGraph("src/pages/supplier/BookingsPage.jsx").has(calendar),
  "List view does not load calendar code",
);
const reportKeys = new Set([
  "index.html",
  calendar,
  "src/pages/marketing/HomePage.jsx",
  "src/pages/marketing/SuppliersPage.jsx",
  "src/pages/marketing/VenuesPage.jsx",
  "src/pages/marketing/SupplierProfilePage.jsx",
  "src/pages/marketing/VenueProfilePage.jsx",
  "src/pages/admin/DashboardPage.jsx",
  "src/pages/admin/SuppliersPage.jsx",
  "src/pages/admin/EnquiriesPage.jsx",
  "src/pages/supplier/DashboardPage.jsx",
  "src/pages/supplier/EnquiriesPage.jsx",
  "src/pages/supplier/QuotesPage.jsx",
  "src/pages/supplier/BookingsPage.jsx",
  "src/pages/customer/DashboardPage.jsx",
  "src/pages/customer/EnquiryDetailPage.jsx",
]);
const chunks = [];
for (const [key, value] of Object.entries(manifest)) {
  if (!reportKeys.has(key) && !key.startsWith("_WorkspaceShell-")) continue;
  const body = await readFile(`dist/${value.file}`);
  chunks.push({
    source: key,
    file: value.file,
    bytes: body.length,
    gzipBytes: gzipSync(body).length,
    lazy: !!value.isDynamicEntry,
  });
}
const images = [];
for (const file of [
  "public/images/event-atmosphere-640.webp",
  "public/images/event-atmosphere.webp",
])
  images.push({ file, bytes: (await stat(file)).size });
if (process.env.PERFORMANCE_REPORT)
  await writeFile(
    process.env.PERFORMANCE_REPORT,
    JSON.stringify({ chunks, images }, null, 2) + "\n",
  );
process.stdout.write(
  "PASS emitted manifest: lazy workspace routes/layouts, public isolation and deferred booking calendar\n",
);
process.stdout.write(
  JSON.stringify(
    chunks.filter(
      (c) =>
        c.source === "index.html" ||
        c.source.includes("DashboardPage") ||
        c.source === calendar,
    ),
    null,
    2,
  ) + "\n",
);
