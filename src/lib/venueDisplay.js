function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return Math.round(parsed);
}

function toWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectVenueTokens(venue) {
  const tags = [];
  const pushTag = (value) => {
    const normalized = toWords(value);
    if (normalized) tags.push(normalized);
  };

  const listLikeTags = [venue?.aiTags, venue?.ai_tags, venue?.tags];
  for (const source of listLikeTags) {
    if (Array.isArray(source)) {
      source.forEach(pushTag);
    } else if (typeof source === "string") {
      source.split(",").forEach(pushTag);
    }
  }

  const venueType =
    venue?.venueType ||
    venue?.venue_type ||
    venue?.type ||
    venue?.aiDraftMeta?.modelInput?.venue_type ||
    venue?.ai_draft_meta?.modelInput?.venue_type ||
    venue?.aiDraftMeta?.modelOutput?.venue_type ||
    venue?.ai_draft_meta?.modelOutput?.venue_type ||
    "";
  pushTag(venueType);

  return tags.join(" ");
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function formatVenueGuestCapacity(guestMin, guestMax) {
  const min = toPositiveInt(guestMin);
  const max = toPositiveInt(guestMax);
  if (min && max && min !== max) return `${min}-${max} guests`;
  if (max) return `Up to ${max} guests`;
  if (min) return `${min}+ guests`;
  return null;
}

export function getVenueConfidenceLabels(venue, maxLabels = 2) {
  const text = collectVenueTokens(venue);
  if (!text) return [];

  const rules = [
    { label: "Popular for weddings", keywords: ["wedding", "bridal", "ceremony", "reception"] },
    { label: "Great for corporate events", keywords: ["corporate", "business", "conference", "meeting"] },
    { label: "Outdoor space", keywords: ["outdoor", "garden", "grounds", "open air"] },
    { label: "Rustic venue", keywords: ["barn", "rustic", "farmhouse", "country house"] },
    { label: "Hotel venue", keywords: ["hotel", "resort", "inn"] },
  ];

  const labels = [];
  for (const rule of rules) {
    if (hasAnyKeyword(text, rule.keywords)) labels.push(rule.label);
    if (labels.length >= maxLabels) break;
  }
  return labels;
}

export function getVenueAttentionFlags(venue) {
  const heroPresent = !!String(venue?.heroImageUrl || venue?.hero_image_url || "").trim() || !!venue?.hasHero || !!venue?.has_hero;
  const shortDescription = String(venue?.shortDescription ?? venue?.short_description ?? "").trim();
  const about = String(venue?.about ?? "").trim();

  const issues = [];
  if (!heroPresent) issues.push("No hero");
  if (!shortDescription && !about) issues.push("Missing description");
  else if (!about || about.length < 120) issues.push("Description short");

  return {
    needsAttention: issues.length > 0,
    issues,
  };
}
