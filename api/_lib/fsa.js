const FSA_DOMAIN_RE = /(^|\.)ratings\.food\.gov\.uk$/i;

function toTrimmed(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function parseFsaUrl(raw) {
  const value = toTrimmed(raw);
  if (!value) return { url: null, establishmentId: null };

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "Enter a valid ratings.food.gov.uk link." };
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    return { error: "FSA link must use http or https." };
  }
  if (!FSA_DOMAIN_RE.test(parsed.hostname)) {
    return { error: "Use an official ratings.food.gov.uk link." };
  }

  const pathMatch = parsed.pathname.match(/\/business\/(\d+)(?:\/|$)/i);
  const fallbackMatch = parsed.pathname.match(/\b(\d{4,})\b/);
  const idText = (pathMatch && pathMatch[1]) || (fallbackMatch && fallbackMatch[1]) || null;
  if (!idText) {
    return { error: "Could not find FHRS establishment ID in the link." };
  }

  const establishmentId = Number(idText);
  if (!Number.isInteger(establishmentId) || establishmentId <= 0) {
    return { error: "Invalid FHRS establishment ID." };
  }

  return {
    url: parsed.toString(),
    establishmentId,
  };
}

export function getFsaBadgeKey(ratingValue) {
  const value = String(ratingValue || "").trim();
  if (!value) return null;
  if (/^[0-5]$/.test(value)) return value;
  const compact = value.replace(/\s+/g, "").toLowerCase();
  if (compact === "awaitinginspection") return "awaiting-inspection";
  if (compact === "exempt") return "exempt";
  if (compact === "awaitingpublication") return "awaiting-publication";
  return "unavailable";
}

export async function fetchFhrsEstablishment(establishmentId) {
  const id = Number(establishmentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid establishment ID");
  }

  const resp = await fetch(`https://api.ratings.food.gov.uk/Establishments/${id}`, {
    method: "GET",
    headers: {
      "x-api-version": "2",
      "accept": "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(`FHRS request failed (${resp.status})`);
  }

  const json = await resp.json();
  const ratingValue = toTrimmed(json?.RatingValue);

  let ratingDate = null;
  if (json?.RatingDate) {
    const ts = Date.parse(String(json.RatingDate));
    if (Number.isFinite(ts)) {
      ratingDate = new Date(ts).toISOString();
    }
  }

  return {
    ratingValue,
    ratingDate,
    lastFetchedAt: new Date().toISOString(),
    raw: json,
  };
}

export function toPublicFsaBadgeUrl(ratingValue) {
  const key = getFsaBadgeKey(ratingValue);
  if (!key) return null;
  return `/assets/fsa/fsa-${key}.svg`;
}
