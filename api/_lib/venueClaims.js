import crypto from "node:crypto";

export function createClaimToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashClaimToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function claimTokenExpiryIso(days = 7) {
  const now = Date.now();
  const ms = Math.max(1, Number(days || 7)) * 24 * 60 * 60 * 1000;
  return new Date(now + ms).toISOString();
}

export function publicSiteUrl() {
  const configured =
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!configured) return "https://eventwow.co.uk";
  const value = String(configured || "").trim();
  if (!value) return "https://eventwow.co.uk";
  if (value.startsWith("http://") || value.startsWith("https://")) return value.replace(/\/+$/, "");
  return `https://${value.replace(/\/+$/, "")}`;
}

