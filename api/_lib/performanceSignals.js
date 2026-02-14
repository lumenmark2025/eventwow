export const SIGNAL_THRESHOLDS = {
  fastResponderHours: 6,
  fastResponderMinSent: 3,
  highConversionRate: 0.35,
  highConversionMinSent: 5,
  activeDays: 7,
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value) {
  const text = String(value || "").trim();
  return text || null;
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
