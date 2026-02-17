function normalizeOrigin(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

export function getSiteOrigin() {
  const viteSite = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SITE_URL : "";
  const nextSite = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_SITE_URL : "";
  const explicit = normalizeOrigin(viteSite || nextSite || "");
  if (explicit) return explicit;

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeOrigin(window.location.origin);
  }

  return "";
}

export function getAuthCallbackUrl() {
  const origin = getSiteOrigin();
  return origin ? `${origin}/auth/callback` : "/auth/callback";
}

export function getAuthResetUrl() {
  const origin = getSiteOrigin();
  return origin ? `${origin}/auth/reset` : "/auth/reset";
}

export function getResetPasswordUrl() {
  const origin = getSiteOrigin();
  return origin ? `${origin}/reset-password` : "/reset-password";
}

export function getUpdatePasswordUrl() {
  return getResetPasswordUrl();
}

export function warnIfAuthOriginLooksWrong() {
  const isDev = typeof import.meta !== "undefined" ? !!import.meta.env?.DEV : false;
  if (!isDev || typeof window === "undefined") return;

  const resolvedOrigin = getSiteOrigin();
  const currentHost = window.location?.hostname || "";
  if (!resolvedOrigin || !currentHost) return;

  let resolvedHost = "";
  try {
    resolvedHost = new URL(resolvedOrigin).hostname;
  } catch {
    return;
  }

  if (isLocalhostHost(resolvedHost) && !isLocalhostHost(currentHost)) {
    console.warn(
      `[auth] Resolved site origin is local (${resolvedOrigin}) while current host is ${currentHost}. Check VITE_SITE_URL.`
    );
  }
}

