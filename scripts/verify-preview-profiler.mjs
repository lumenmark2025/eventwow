import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { capture, probe, resourceLabel } from "./profile-preview.mjs";

test("resource labels omit credentials, record IDs, slugs and all query values", () => {
  const origin = "https://preview.example";
  for (const url of [
    `${origin}/api/customer/enquiries/12345?token=private-token&email=private-email`,
    `${origin}/suppliers/private-business`,
    "https://storage.example/storage/v1/object/sign/private-bucket/private-image.png?token=private-signed-key",
  ]) {
    const value = resourceLabel(url, origin);
    assert.ok(!value.includes("private") && !value.includes("12345"), value);
  }
  assert.equal(
    resourceLabel(`${origin}/assets/HomePage-hash.js?token=secret`, origin),
    "preview/assets/HomePage-hash.js?token",
  );
  assert.equal(
    resourceLabel("data:image/png;base64,private", origin),
    "inline-resource",
  );
});

test("protection never becomes useful-content timing; real transport captures delayed content and image sizes", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/protected") {
      res.writeHead(302, {
        location: "https://vercel.com/sso-api?nonce=private",
      });
      return res.end("Redirecting");
    }
    if (req.url.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      return setTimeout(() => res.end('{"ok":true}'), 80);
    }
    if (req.url.startsWith("/photo")) {
      res.setHeader("Content-Type", "image/svg+xml");
      return res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="white"/></svg>',
      );
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><body><h1>Loading</h1><img src="/photo?token=private" width="100" height="50"><script>Promise.all([fetch('/api/quotes?token=private'), fetch('/api/quotes?token=private')]).then(() => { document.querySelector('h1').className = 'useful'; });</script></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const result = await probe(`${origin}/protected`);
    assert.equal(result.protectedRedirect, true);
    assert.equal(result.status, 302);
    assert.ok(!JSON.stringify(result).includes("private"));
    const page = await browser.newPage();
    const measured = await capture(page, origin, {
      name: "fixture",
      path: "/",
      usefulSelector: ".useful",
    });
    assert.equal(measured.outcome, "useful-selector-visible");
    assert.ok(measured.firstUsefulMs >= 80);
    assert.ok(measured.repeatedRequests.some((r) => r.count === 2));
    assert.ok(measured.overlappingRequestIdentities.length);
    assert.ok(
      measured.requests.some(
        (r) => r.type === "image" && r.responseBodyBytes > 0,
      ),
    );
    assert.equal(measured.images[0].naturalWidth, 1000);
    assert.equal(measured.images[0].renderedWidth, 100);
    assert.ok(!JSON.stringify(measured).includes("private"));
    const unavailable = await capture(
      page,
      origin,
      { name: "missing content", path: "/", usefulSelector: ".absent" },
      250,
    );
    assert.equal(unavailable.firstUsefulMs, null);
    assert.equal(unavailable.outcome, "navigation-or-useful-content-timeout");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
