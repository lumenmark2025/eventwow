import { useEffect } from "react";

const DEFAULT_TITLE = "Eventwow | Venues & event suppliers across the UK";
const DEFAULT_DESCRIPTION = "Send one request, receive quotes, and book the right supplier with confidence.";
const DEFAULT_CANONICAL_BASE = "https://eventwow.co.uk";

export function getCanonicalBaseUrl() {
  return DEFAULT_CANONICAL_BASE;
}

export function buildCanonicalUrl(path = "/") {
  const base = getCanonicalBaseUrl();
  const safePath = String(path || "/").startsWith("/") ? String(path || "/") : `/${String(path || "")}`;
  return `${base}${safePath}`;
}

function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href) {
  if (!href) return;
  let el = document.head.querySelector("link[rel='canonical']");
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function useMarketingMeta({ title, description, path = "/", canonicalPath, image }) {
  useEffect(() => {
    const fullTitle = !title ? DEFAULT_TITLE : String(title).includes("|") ? String(title) : `${title} | Eventwow`;
    const desc = description || DEFAULT_DESCRIPTION;
    const canonical = buildCanonicalUrl(canonicalPath || path || "/");
    const ogImage = image || buildCanonicalUrl("/eventwow-social-card.jpg");

    document.title = fullTitle;
    upsertMeta("name", "description", desc);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonical || (typeof window !== "undefined" ? window.location.href : ""));
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", desc);
    upsertMeta("name", "twitter:image", ogImage);
    upsertCanonical(canonical);
  }, [title, description, path, canonicalPath, image]);
}

export function useStructuredData(data, id = "eventwow-jsonld") {
  useEffect(() => {
    if (!data || typeof data !== "object") return undefined;

    let script = document.head.querySelector(`script[data-jsonld-id="${id}"]`);
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-jsonld-id", id);
      document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(data);

    return () => {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [data, id]);
}
