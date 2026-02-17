export function normaliseFsaBadgeKey(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^[0-5]$/.test(text)) return text;
  const compact = text.replace(/\s+/g, "").toLowerCase();
  if (compact === "awaitinginspection") return "awaiting-inspection";
  if (compact === "awaitingpublication") return "awaiting-publication";
  if (compact === "exempt") return "exempt";
  return "unavailable";
}

export function getFsaBadgePath(ratingValueOrKey) {
  const key = normaliseFsaBadgeKey(ratingValueOrKey);
  if (!key) return null;
  return `/assets/fsa/fsa-${key}.svg`;
}

export function getFsaBadgeLabel(ratingValueOrKey) {
  const text = String(ratingValueOrKey || "").trim();
  if (!text) return null;
  if (/^[0-5]$/.test(text)) return `Food hygiene rating: ${text}/5`;
  return `Food hygiene rating: ${text}`;
}
