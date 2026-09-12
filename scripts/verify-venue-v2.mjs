/* global process, console, setTimeout, Buffer */
// Local fixtures only. No live venue, claim, storage or publication writes.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { workspaceFixtures } from "./workspace-fixtures.mjs";
const base = process.env.WORKSPACE_TEST_URL || "http://127.0.0.1:5173";
const output = process.env.VENUE_SCREENSHOTS || "/tmp/eventwow-venue-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const common = workspaceFixtures(browser, base);
const axe = await readFile(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const photo =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#eef2f6"/><text x="320" y="180" text-anchor="middle" font-family="sans-serif" fill="#475569">Local venue image fixture</text></svg>',
  );
const venue = {
  id: "venue-1",
  name: "Example Assembly Rooms",
  slug: "example-assembly-rooms",
  location_label: "Manchester, M1 1AA",
  description:
    "Flexible spaces for celebrations, conferences and community events.",
  short_description: "Light-filled event spaces in central Manchester.",
  guest_min: 20,
  guest_max: 150,
  facilities: ["Parking", "Accessible entrance"],
  is_published: true,
  requires_review: false,
  status: "published",
  hero_image: { id: "hero-1", signed_url: photo, public_url: photo },
  gallery: [
    { id: "gallery-1", signed_url: photo, caption: "Example main hall" },
    { id: "gallery-2", public_url: photo, caption: "Example reception space" },
  ],
};
async function fixture(options = {}) {
  const f = await common({ role: "venue_owner", ...options });
  f.mode.rows = [
    structuredClone(venue),
    {
      ...structuredClone(venue),
      id: "venue-2",
      name: "Example Riverside Hall",
      status: "pending_review",
      requires_review: true,
      hero_image: null,
      gallery: [],
    },
    {
      ...structuredClone(venue),
      id: "venue-3",
      name: "Example Garden Pavilion",
      status: "draft",
      is_published: false,
      hero_image: null,
      gallery: [],
    },
  ];
  const respond = async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    f.requests.push({
      url: req.url(),
      method: req.method(),
      body: req.postData(),
      authorization: req.headers().authorization,
      contentType: req.headers()["content-type"],
    });
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (f.mode.delay) await new Promise((r) => setTimeout(r, f.mode.delay));
    if (f.mode.state === "error")
      return reply({ error: "Fixture venue service unavailable" }, 503);
    if (url.pathname === "/api/venue/my-venues")
      return reply({
        ok: true,
        rows: f.mode.state === "empty" ? [] : f.mode.rows,
      });
    if (url.pathname === "/api/venue/update") {
      if (f.mode.failSave)
        return reply({ details: "Guest values cannot be negative" }, 400);
      const payload = req.postDataJSON();
      const row = f.mode.rows.find((v) => v.id === payload.venueId);
      Object.assign(row, {
        description: payload.description,
        short_description: payload.shortDescription,
        guest_min: payload.guestMin,
        guest_max: payload.guestMax,
        facilities: payload.facilities,
        requires_review: true,
        status: "pending_review",
      });
      return reply({ ok: true, venue: row });
    }
    if (url.pathname === "/api/venue/upload-image") {
      if (f.mode.failPrep)
        return reply({ error: "Upload preparation failed" }, 503);
      f.mode.uploadType = url.searchParams.get("type");
      return reply(
        f.mode.missingUrl
          ? { ok: true }
          : { uploadUrl: base + "/api/fixture-venue-upload" },
      );
    }
    if (url.pathname === "/api/fixture-venue-upload") {
      if (f.mode.failPut)
        return reply({ error: "Fixture upload unavailable" }, 503);
      return reply({ ok: true });
    }
    throw new Error("Unexpected venue fixture request: " + req.url());
  };
  await f.context.route("**/api/venue/**", respond);
  await f.context.route("**/api/fixture-venue-upload", respond);
  return f;
}
const results = [];
async function audit(page, label) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    label + " overflow",
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
  assert.deepEqual(violations, [], label + " accessibility");
}
async function capture(f, label) {
  for (const width of [360, 768, 1024, 1440]) {
    await f.page.setViewportSize({ width, height: 1000 });
    await audit(f.page, label + width);
    await f.page.screenshot({
      path: `${output}/${label}-${width}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(f.errors, []);
  results.push(`${label}: 360/768/1024/1440px, overflow and axe passed`);
}
async function editor(f, id = "venue-1") {
  await f.page.goto(base + `/venue/${id}/edit`);
  await f.page.getByLabel("Short description", { exact: true }).waitFor();
}
try {
  const f = await fixture();
  const chunks = [];
  f.page.on("request", (req) => chunks.push(req.url()));
  await f.page.goto(base + "/venue");
  await f.page
    .getByRole("heading", { name: venue.name, exact: true })
    .waitFor();
  await capture(f, "overview");
  const count = f.requests.filter((r) =>
    r.url.endsWith("/api/venue/my-venues"),
  ).length;
  await f.page
    .getByRole("textbox", { name: "Search venue or location" })
    .fill("Riverside");
  assert.equal(
    await f.page.getByRole("link", { name: /Edit venue/ }).count(),
    1,
  );
  await f.page
    .getByRole("textbox", { name: "Search venue or location" })
    .fill("no matching fixture");
  await f.page.getByRole("heading", { name: "No matching venues" }).waitFor();
  assert.equal(
    f.requests.filter((r) => r.url.endsWith("/api/venue/my-venues")).length,
    count,
  );
  await f.page
    .getByRole("textbox", { name: "Search venue or location" })
    .fill("");
  const edit = f.page.getByRole("link", {
    name: /Edit venue.*Example Assembly Rooms/,
  });
  await edit.focus();
  await f.page.keyboard.press("Enter");
  await f.page.waitForURL("**/venue/venue-1/edit");
  await f.page.getByLabel("Description", { exact: true }).waitFor();
  await capture(f, "editor");
  assert.ok(
    !chunks.some((u) =>
      /src\/(admin|supplier)|src\/pages\/(admin|supplier)|BookingsCalendar/.test(
        u,
      ),
    ),
    "Venue routes defer Admin/Supplier code",
  );
  assert.ok(
    f.requests
      .filter((r) => r.url.includes("/api/venue/"))
      .every((r) => r.authorization?.startsWith("Bearer ")),
  );
  await f.page
    .getByLabel("Short description", { exact: true })
    .fill("Updated short introduction");
  await f.page
    .getByLabel("Description", { exact: true })
    .fill("Updated detailed introduction");
  await f.page.getByLabel("Guest minimum", { exact: true }).fill("");
  await f.page.getByLabel("Guest maximum", { exact: true }).fill("220");
  await f.page
    .getByLabel("Facilities", { exact: true })
    .fill(" Parking, AV equipment, , Accessible entrance ");
  f.mode.delay = 500;
  await f.page
    .getByRole("button", { name: "Submit for review", exact: true })
    .first()
    .click();
  assert.ok(
    await f.page
      .getByRole("button", { name: "Submitting...", exact: true })
      .first()
      .isDisabled(),
  );
  assert.ok(
    await f.page.getByLabel("Upload hero image", { exact: true }).isDisabled(),
  );
  await f.page
    .getByText("Changes submitted for review.", { exact: true })
    .waitFor();
  await f.page.getByLabel("Short description", { exact: true }).waitFor();
  f.mode.delay = 0;
  assert.deepEqual(
    JSON.parse(
      f.requests.find((r) => r.url.endsWith("/api/venue/update")).body,
    ),
    {
      venueId: "venue-1",
      description: "Updated detailed introduction",
      shortDescription: "Updated short introduction",
      guestMin: null,
      guestMax: 220,
      facilities: ["Parking", "AV equipment", "Accessible entrance"],
    },
  );
  assert.equal(
    await f.page.getByLabel("Guest maximum", { exact: true }).inputValue(),
    "220",
  );
  await f.page
    .getByText("Your latest changes are pending admin review.", { exact: true })
    .waitFor();
  await capture(f, "pending-review");
  f.mode.failSave = true;
  await f.page.getByLabel("Guest minimum", { exact: true }).fill("-1");
  await f.page
    .getByRole("button", { name: "Submit for review", exact: true })
    .first()
    .click();
  await f.page
    .getByRole("alert")
    .filter({ hasText: "Guest values cannot be negative" })
    .waitFor();
  assert.equal(
    await f.page.getByLabel("Guest minimum", { exact: true }).inputValue(),
    "-1",
  );
  f.mode.failSave = false;
  await f.page.getByRole("button", { name: "Cancel", exact: true }).click();
  await f.page.waitForURL(base + "/venue");
  results.push(
    "Overview search is local; edit keyboard link, exact save payload/null/numeric/facility conversion, pending review, disabled saving/upload controls, failed-save draft retention and Cancel navigation passed",
  );
  await f.context.close();

  const media = await fixture();
  await editor(media);
  const file = {
    name: "Hall hero image.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture-image-bytes"),
  };
  await media.page.getByLabel("Upload hero image", { exact: true }).focus();
  assert.ok(
    await media.page
      .getByLabel("Upload hero image", { exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  for (const type of ["hero", "gallery"]) {
    media.mode.delay = 500;
    await media.page
      .getByLabel(`Upload ${type} image`, { exact: true })
      .setInputFiles({ ...file, name: `Hall ${type} image.png` });
    assert.ok(
      await media.page
        .getByLabel("Upload hero image", { exact: true })
        .isDisabled(),
    );
    assert.ok(
      await media.page
        .getByRole("button", { name: "Submit for review", exact: true })
        .first()
        .isDisabled(),
    );
    await media.page
      .getByText("Image uploaded and queued for review.", { exact: true })
      .waitFor();
    await media.page.getByLabel("Upload hero image", { exact: true }).waitFor();
    media.mode.delay = 0;
    const prep = media.requests
        .filter((r) => r.url.includes("/api/venue/upload-image?"))
        .at(-1),
      url = new URL(prep.url);
    assert.equal(prep.method, "GET");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      venueId: "venue-1",
      fileName: `Hall ${type} image.png`,
      type,
    });
    const put = media.requests
      .filter((r) => r.url.endsWith("/api/fixture-venue-upload"))
      .at(-1);
    assert.equal(put.method, "PUT");
    assert.equal(put.contentType, "image/png");
    assert.equal(put.body, "fixture-image-bytes");
  }
  const before = media.requests.length;
  await media.page
    .getByLabel("Upload gallery image", { exact: true })
    .setInputFiles({ ...file, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await media.page
    .getByRole("alert")
    .filter({ hasText: "Image must be 5MB or smaller." })
    .waitFor();
  assert.equal(media.requests.length, before);
  for (const failure of ["failPrep", "missingUrl", "failPut"]) {
    media.mode[failure] = true;
    await media.page
      .getByLabel("Upload gallery image", { exact: true })
      .setInputFiles({ ...file, name: `${failure}.png` });
    await media.page
      .getByRole("alert")
      .filter({
        hasText:
          failure === "failPrep"
            ? "Upload preparation failed"
            : failure === "missingUrl"
              ? "Upload URL unavailable"
              : "Image upload failed",
      })
      .waitFor();
    assert.ok(
      !(await media.page
        .getByLabel("Upload gallery image", { exact: true })
        .isDisabled()),
    );
    media.mode[failure] = false;
  }
  await audit(media.page, "Upload failure");
  assert.deepEqual(media.errors, []);
  results.push(
    "Media: keyboard file controls, exact preparation query and raw signed PUT payload/MIME, upload/save disables, 5MB validation, prep/missing-URL/PUT failures and post-upload reloads passed",
  );
  await media.context.close();

  for (const path of ["/venue", "/venue/venue-1/edit"]) {
    for (const state of ["empty", "error", "loading"]) {
      const stateFixture = await fixture();
      stateFixture.mode.state = state;
      if (state === "loading") stateFixture.mode.delay = 20000;
      await stateFixture.page.goto(base + path);
      if (state === "loading")
        await stateFixture.page
          .getByRole("status", { name: "Loading", exact: true })
          .first()
          .waitFor();
      else if (state === "error" || path.includes("edit"))
        await stateFixture.page.getByRole("alert").waitFor();
      else
        await stateFixture.page
          .getByRole("heading", { name: "No venues linked", exact: true })
          .waitFor();
      const label =
        (path.includes("edit") ? "editor" : "overview") + "-" + state;
      await capture(stateFixture, label);
      if (state === "error") {
        assert.equal(
          await stateFixture.page
            .getByRole("heading", { name: "No venues linked", exact: true })
            .count(),
          0,
        );
        stateFixture.mode.state = "populated";
        await stateFixture.page
          .getByRole("button", { name: "Retry", exact: true })
          .click();
        if (path.includes("edit"))
          await stateFixture.page
            .getByLabel("Description", { exact: true })
            .waitFor();
        else
          await stateFixture.page
            .getByRole("heading", { name: venue.name, exact: true })
            .waitFor();
      }
      if (state === "empty" && path === "/venue")
        assert.equal(
          await stateFixture.page
            .getByRole("link", { name: "Browse venues", exact: true })
            .getAttribute("href"),
          "/venues",
        );
      await stateFixture.context.close();
    }
  }
  const blank = await fixture();
  blank.mode.rows = [
    {
      ...venue,
      hero_image: null,
      gallery: [],
      description: "",
      short_description: "",
      guest_min: null,
      guest_max: null,
      facilities: [],
      is_published: false,
      status: "draft",
    },
  ];
  await editor(blank);
  await capture(blank, "empty-profile");
  await blank.page.getByText("Draft", { exact: true }).waitFor();
  blank.mode.rows[0].hero_image = {
    signed_url: "data:image/png;base64,invalid",
  };
  await blank.page.reload();
  await blank.page.getByText("Image unavailable", { exact: true }).waitFor();
  await audit(blank.page, "Broken image");
  await blank.context.close();
  results.push(
    "Both routes: loading/empty/error and retry at all widths; unowned ID exposes no form; empty profile/gallery, signed/public image URLs and broken-image fallback passed",
  );

  const keyboard = await fixture();
  await keyboard.page.setViewportSize({ width: 360, height: 1000 });
  await keyboard.page.goto(base + "/venue");
  await keyboard.page
    .getByRole("button", { name: "Open workspace navigation", exact: true })
    .click();
  const dialog = keyboard.page.getByRole("dialog");
  await dialog.waitFor();
  for (let i = 0; i < 8; i++) {
    await keyboard.page.keyboard.press("Tab");
    assert.ok(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    );
  }
  await keyboard.page.keyboard.press("Escape");
  assert.ok(
    await keyboard.page
      .getByRole("button", { name: "Open workspace navigation", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  await keyboard.page.keyboard.press("Control+k");
  await keyboard.page.getByRole("dialog").waitFor();
  await keyboard.page.keyboard.press("Escape");
  await keyboard.context.close();
  for (const options of [
    { signedIn: false },
    { role: "admin" },
    { role: "supplier" },
    { role: "customer" },
  ]) {
    for (const path of ["/venue", "/venue/venue-1/edit"]) {
      const denied = await fixture(options);
      await denied.page.goto(base + path);
      await denied.page.waitForURL((u) => !u.pathname.startsWith("/venue"));
      const expected =
        options.signedIn === false
          ? "/login"
          : options.role === "admin"
            ? "/admin/dashboard"
            : options.role === "supplier"
              ? "/supplier/dashboard"
              : "/customer";
      assert.ok(new URL(denied.page.url()).pathname.startsWith(expected));
      assert.equal(
        denied.requests.filter((r) => r.url.includes("/api/venue/")).length,
        0,
      );
      await denied.context.close();
    }
  }
  const unowned = await fixture();
  await unowned.page.goto(base + "/venue/not-owned/edit");
  await unowned.page
    .getByRole("alert")
    .filter({ hasText: "Venue not found or not owned" })
    .waitFor();
  assert.equal(
    await unowned.page.getByLabel("Short description", { exact: true }).count(),
    0,
  );
  assert.equal(
    await unowned.page
      .getByRole("button", { name: "Submit for review", exact: true })
      .count(),
    0,
  );
  await unowned.page.goto(base + "/venue/unsupported");
  await unowned.page.waitForURL(base + "/venue");
  await unowned.context.close();
  const alias = await fixture({ role: "venue" });
  await editor(alias);
  await alias.context.close();
  results.push(
    "Keyboard drawer Tab/Escape/focus return and command search; signed-out/Admin/Supplier/Customer guard redirects without owner API requests; existing venue role alias passed",
  );
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
