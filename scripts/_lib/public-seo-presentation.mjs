// Presentation only: the prerender's existing data, text, URLs and head remain
// unchanged. Read the shared source tokens instead of maintaining a second palette.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const tokens = readFileSync(
  new URL("../../src/components/marketing/public-tokens.css", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../../src/components/marketing/seo-prerender.css", import.meta.url),
  "utf8",
);

export function styleSeoLanding(html, assetsDirectory) {
  // Reuse Vite's already emitted Inter assets, without copying fonts or adding
  // remote requests. Text retains the existing system fallback if unavailable.
  const assets = assetsDirectory ? readdirSync(assetsDirectory) : [];
  const fonts = [400, 700]
    .map((weight) => {
      const file = assets.find(
        (name) =>
          name.startsWith(`inter-latin-${weight}-normal-`) &&
          name.endsWith(".woff2"),
      );
      return file
        ? `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};font-display:swap;src:url('/assets/${path.basename(file)}') format('woff2')}`
        : "";
    })
    .join("");
  return (
    html.replace(
      '<main class="pr-wrap">',
      '<main class="pr-wrap public-v2 public-seo-prerender">',
    ) + `<style>${fonts}${tokens}${styles}</style>`
  );
}
