export const SIGNAL_THRESHOLDS = {
  fastResponderHours: 6,
  fastResponderMinSent: 3,
  highConversionRate: 0.35,
  highConversionMinSent: 5,
  activeDays: 7,
};

const STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "near",
  "from",
  "that",
  "this",
  "you",
  "your",
  "our",
  "event",
  "events",
]);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value) {
  const text = String(value || "").trim();
  return text || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isRecent(iso, days) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

export function buildPerformanceSignals(row) {
  const quotesSentCount = toNumber(row?.quotes_sent_count) ?? 0;
  const acceptanceRateRaw = toNumber(row?.acceptance_rate);
  const responseSeconds = toNumber(row?.response_time_seconds_median);
  const typicalResponseHours =
    responseSeconds != null ? Math.round((responseSeconds / 3600) * 10) / 10 : null;
  const lastActiveAt = toIso(row?.last_active_at);

  const badges = [];
  if (
    typicalResponseHours != null &&
    typicalResponseHours <= SIGNAL_THRESHOLDS.fastResponderHours &&
    quotesSentCount >= SIGNAL_THRESHOLDS.fastResponderMinSent
  ) {
    badges.push("Fast responder");
  }
  if (
    acceptanceRateRaw != null &&
    acceptanceRateRaw >= SIGNAL_THRESHOLDS.highConversionRate &&
    quotesSentCount >= SIGNAL_THRESHOLDS.highConversionMinSent
  ) {
    badges.push("High conversion");
  }
  if (isRecent(lastActiveAt, SIGNAL_THRESHOLDS.activeDays)) {
    badges.push("Active");
  }

  return {
    invitesCount: toNumber(row?.invites_count),
    quotesSentCount,
    quotesAcceptedCount: toNumber(row?.quotes_accepted_count),
    acceptanceRate: acceptanceRateRaw,
    typicalResponseHours,
    lastQuoteSentAt: toIso(row?.last_quote_sent_at),
    lastActiveAt,
    badges,
  };
}

export function tokenizeKeywords(value) {
  const tokens = String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(tokens)].slice(0, 12);
}

function supplierSearchText(supplier) {
  const services = Array.isArray(supplier?.services) ? supplier.services.join(" ") : String(supplier?.services || "");
  return [
    services,
    supplier?.shortDescription,
    supplier?.short_description,
    supplier?.about,
    supplier?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function computeDeterministicSupplierScore({
  supplier,
  queryTokens = [],
  distanceMiles = null,
  reviewRating = null,
  reviewCount = 0,
  performance = null,
}) {
  const breakdown = {
    services: 0,
    distance: 0,
    reviews: 0,
    performance: 0,
    matchedTokens: [],
    distanceMiles: Number.isFinite(Number(distanceMiles)) ? Number(distanceMiles) : null,
  };

  const text = supplierSearchText(supplier);
  const matched = [];
  for (const token of queryTokens) {
    if (text.includes(token)) matched.push(token);
  }
  breakdown.matchedTokens = matched;
  breakdown.services = Math.min(36, matched.length * 6);

  if (Number.isFinite(Number(distanceMiles))) {
    const miles = Number(distanceMiles);
    const radius = Number.isFinite(Number(supplier?.travel_radius_miles))
      ? Math.max(10, Number(supplier.travel_radius_miles))
      : 30;
    const proximity = clamp(1 - miles / radius, 0, 1);
    breakdown.distance = proximity * 30;
  }

  if (Number.isFinite(Number(reviewRating)) && Number(reviewRating) > 0) {
    const ratingNorm = clamp((Number(reviewRating) - 3) / 2, 0, 1);
    const countNorm = clamp(Math.log10(Number(reviewCount || 0) + 1) / 2, 0, 1);
    breakdown.reviews = ratingNorm * countNorm * 20;
  }

  const acceptance = Number(performance?.acceptanceRate);
  if (Number.isFinite(acceptance) && acceptance > 0) {
    breakdown.performance += clamp(acceptance, 0, 1) * 6;
  }
  const responseHours = Number(performance?.typicalResponseHours);
  if (Number.isFinite(responseHours) && responseHours >= 0) {
    const responseNorm = clamp(1 - responseHours / 72, 0, 1);
    breakdown.performance += responseNorm * 4;
  }

  const score =
    breakdown.services +
    breakdown.distance +
    breakdown.reviews +
    breakdown.performance;

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      ...breakdown,
      services: Math.round(breakdown.services * 100) / 100,
      distance: Math.round(breakdown.distance * 100) / 100,
      reviews: Math.round(breakdown.reviews * 100) / 100,
      performance: Math.round(breakdown.performance * 100) / 100,
      total: Math.round(score * 100) / 100,
    },
  };
}
