import { useEffect } from "react";

const DEFAULT_TITLE = "Eventwow | Book trusted event suppliers fast";
const DEFAULT_DESCRIPTION = "Send one request, receive quotes, and book the right supplier with confidence.";
const DEFAULT_CANONICAL_BASE = "https://eventwow.co.uk";

function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

export function getCanonicalBaseUrl() {
  const fromPlainPublic =
    typeof process !== "undefined" ? normalizeBaseUrl(process.env?.PUBLIC_APP_URL || "") : "";
  const fromPublic = normalizeBaseUrl(import.meta.env.VITE_PUBLIC_APP_URL || "");
  const fromSite = normalizeBaseUrl(import.meta.env.VITE_SITE_URL || "");
  if (fromPlainPublic) return fromPlainPublic;
  if (fromPublic) return fromPublic;
  if (fromSite) return fromSite;
  return DEFAULT_CANONICAL_BASE;
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

export function useMarketingMeta({ title, description, path = "/" }) {
  useEffect(() => {
    const fullTitle = title ? `${title} | Eventwow` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESCRIPTION;
    const base = getCanonicalBaseUrl();
    const canonical = base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : "";

    document.title = fullTitle;
    upsertMeta("name", "description", desc);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonical || (typeof window !== "undefined" ? window.location.href : ""));
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", desc);
    upsertCanonical(canonical);

    // TODO: In Vercel, configure one preferred custom domain to avoid duplicate indexation vs *.vercel.app.
  }, [title, description, path]);
}
