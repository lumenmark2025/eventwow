const HALF_LIFE_DAYS = 14;
const K_PRIOR = 10;
const RT_GOOD_MINUTES = 30;
const RT_BAD_MINUTES = 1440;

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function toTitle(slug) {
  const s = toSlug(slug);
  if (!s) return "";
  return s
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function categoryMatchStrength(categorySlug, listingCategories = []) {
  const needle = toSlug(categorySlug);
  if (!needle) return 0;

  const slugs = (Array.isArray(listingCategories) ? listingCategories : []).map(toSlug).filter(Boolean);
  if (slugs.some((s) => s === needle)) return 1;
  if (slugs.some((s) => s.includes(needle) || needle.includes(s))) return 0.6;
  return 0;
}

export function locationMatchStrength(locationSlug, { locationLabel, baseCity, regionLabel } = {}) {
  const needle = toSlug(locationSlug);
  if (!needle) return 0;

  const labelSlug = toSlug(locationLabel);
  const citySlug = toSlug(baseCity);
  const regionSlug = toSlug(regionLabel);

  if (labelSlug && labelSlug === needle) return 1;
  if (citySlug && citySlug === needle) return 0.9;
  if (regionSlug && regionSlug === needle) return 0.8;
  if (labelSlug && (labelSlug.includes(needle) || needle.includes(labelSlug))) return 0.7;
  if (citySlug && (citySlug.includes(needle) || needle.includes(citySlug))) return 0.65;
  if (regionSlug && (regionSlug.includes(needle) || needle.includes(regionSlug))) return 0.6;
  return 0;
}

export function safePlanType(value) {
  const v = String(value || "free").trim().toLowerCase();
  if (v === "pro") return "pro";
  return "free";
}

export function planMultiplier(value) {
  return safePlanType(value) === "pro" ? 1.08 : 1.0;
}

export function smoothedAcceptance({ accepted30d, quotesSent30d, globalAcceptanceRate30d }) {
  const accepted = Number(accepted30d || 0);
  const sent = Number(quotesSent30d || 0);
  const p0 = clamp01(Number(globalAcceptanceRate30d || 0));
  return clamp01((accepted + K_PRIOR * p0) / (sent + K_PRIOR));
}

export function responseScoreFromMinutes(responseMinutes) {
  const rt = Number(responseMinutes);
  if (!Number.isFinite(rt) || rt <= 0) return 0.5;
  const x = (Math.log(rt) - Math.log(RT_GOOD_MINUTES)) / (Math.log(RT_BAD_MINUTES) - Math.log(RT_GOOD_MINUTES));
  return 1 - clamp01(x);
}

export function activityScoreFromLastActive(lastActiveAt) {
  if (!lastActiveAt) return 0;
  const ms = Date.now() - new Date(lastActiveAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 1;
  const days = ms / 86400000;
  return Math.exp((-Math.log(2) * days) / HALF_LIFE_DAYS);
}

export function volumeScoreFromQuotesSent(quotesSent30d) {
  const n = Math.max(0, Number(quotesSent30d || 0));
  return 1 - Math.exp(-n / 10);
}

export function baseQualityScore({
  accepted30d,
  quotesSent30d,
  globalAcceptanceRate30d,
  responseMinutes30d,
  lastActiveAt,
}) {
  const smoothed = smoothedAcceptance({
    accepted30d,
    quotesSent30d,
    globalAcceptanceRate30d,
  });
  const response = responseScoreFromMinutes(responseMinutes30d);
  const activity = activityScoreFromLastActive(lastActiveAt);
  const volume = volumeScoreFromQuotesSent(quotesSent30d);
  const baseQuality = 0.45 * smoothed + 0.25 * response + 0.2 * activity + 0.1 * volume;
  return {
    smoothedAcceptance: smoothed,
    responseScore: response,
    activityScore: activity,
    volumeScore: volume,
    baseQuality: clamp01(baseQuality),
  };
}

export function computeRank({
  features,
  categoryMatch,
  locationMatch,
  isVerified,
  planType,
}) {
  const match = clamp01(0.6 * clamp01(categoryMatch) + 0.4 * clamp01(locationMatch));
  const verifiedBonus = isVerified ? 0.05 : 0;
  const raw = 100 * (0.7 * clamp01(features.baseQuality) + 0.3 * match + verifiedBonus);
  const multiplier = planMultiplier(planType);
  return {
    match,
    verifiedBonus,
    planMultiplier: multiplier,
    rankScore: raw * multiplier,
  };
}

export function rankingExplanation({
  rank,
  features,
  categoryMatch,
  locationMatch,
  quotesSent30d,
  accepted30d,
}) {
  const items = [];
  items.push(`Base quality: ${(features.baseQuality * 100).toFixed(1)} / 100`);
  items.push(`Smoothed acceptance from ${accepted30d || 0}/${quotesSent30d || 0} quotes: ${(features.smoothedAcceptance * 100).toFixed(1)}%`);
  items.push(`Response score: ${(features.responseScore * 100).toFixed(1)} / 100`);
  items.push(`Activity score: ${(features.activityScore * 100).toFixed(1)} / 100`);
  items.push(`Volume confidence: ${(features.volumeScore * 100).toFixed(1)} / 100`);
  items.push(`Context match: ${(rank.match * 100).toFixed(1)} / 100 (category ${(clamp01(categoryMatch) * 100).toFixed(0)}%, location ${(clamp01(locationMatch) * 100).toFixed(0)}%)`);
  if (rank.verifiedBonus > 0) items.push("Verified bonus applied (+0.05)");
  if (rank.planMultiplier > 1) items.push(`Plan multiplier applied (x${rank.planMultiplier.toFixed(2)})`);
  items.push(`Final rank score: ${rank.rankScore.toFixed(2)}`);
  return items;
}
