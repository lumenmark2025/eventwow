const UK_POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
const STRICT_UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}$/;

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeUkPostcode(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`.trim();
}

export function isValidUkPostcode(value) {
  const normalized = normalizeUkPostcode(value);
  return STRICT_UK_POSTCODE_REGEX.test(normalized);
}

export function extractUkPostcode(value) {
  const text = String(value || "").toUpperCase();
  const match = text.match(UK_POSTCODE_REGEX);
  return normalizeUkPostcode(match?.[1] || "");
}

export function stripUkPostcode(value) {
  return String(value || "").replace(UK_POSTCODE_REGEX, " ").replace(/\s+/g, " ").trim();
}

export function getPostcodeFromQuery(query = {}) {
  const keys = [
    "postcode",
    "eventPostcode",
    "event_postcode",
    "locationPostcode",
    "location_postcode",
    "location",
  ];
  for (const key of keys) {
    const direct = normalizeUkPostcode(firstQueryValue(query?.[key]));
    if (direct) return direct;
    const embedded = extractUkPostcode(firstQueryValue(query?.[key]));
    if (embedded) return embedded;
  }
  return extractUkPostcode(firstQueryValue(query?.q));
}

export async function geocodeUkPostcodeWithCache(admin, rawPostcode) {
  const postcode = normalizeUkPostcode(rawPostcode);
  if (!postcode) return null;

  const cachedResp = await admin
    .from("postcode_cache")
    .select("postcode,lat,lng")
    .eq("postcode", postcode)
    .maybeSingle();
  if (cachedResp.data && !cachedResp.error) {
    const cachedLat = toFiniteNumber(cachedResp.data.lat);
    const cachedLng = toFiniteNumber(cachedResp.data.lng);
    if (cachedLat !== null && cachedLng !== null) {
      return { postcode, lat: cachedLat, lng: cachedLng, source: "cache" };
    }
  }

  try {
    const resp = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || Number(json?.status) !== 200 || !json?.result) return null;

    const lat = toFiniteNumber(json.result.latitude);
    const lng = toFiniteNumber(json.result.longitude);
    if (lat === null || lng === null) return null;

    await admin
      .from("postcode_cache")
      .upsert(
        { postcode, lat, lng, updated_at: new Date().toISOString() },
        { onConflict: "postcode" }
      );

    return { postcode, lat, lng, source: "api" };
  } catch (err) {
    console.warn("postcode geocode fetch failed:", String(err?.message || err));
    return null;
  }
}

export function distanceMiles(aLat, aLng, bLat, bLng) {
  const lat1 = toFiniteNumber(aLat);
  const lng1 = toFiniteNumber(aLng);
  const lat2 = toFiniteNumber(bLat);
  const lng2 = toFiniteNumber(bLng);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

export async function filterSuppliersByTravelRadius(admin, suppliers, eventCoords) {
  const eventLat = toFiniteNumber(eventCoords?.lat);
  const eventLng = toFiniteNumber(eventCoords?.lng);
  if (eventLat === null || eventLng === null) return Array.isArray(suppliers) ? suppliers : [];

  const rows = Array.isArray(suppliers) ? suppliers : [];
  const postcodeSet = new Set();
  for (const supplier of rows) {
    const hasCoords = toFiniteNumber(supplier.base_lat) !== null && toFiniteNumber(supplier.base_lng) !== null;
    if (hasCoords) continue;
    const postcode = normalizeUkPostcode(supplier.base_postcode);
    if (postcode) postcodeSet.add(postcode);
  }

  const postcodeCoords = new Map();
  for (const postcode of postcodeSet) {
    const coords = await geocodeUkPostcodeWithCache(admin, postcode);
    if (coords) postcodeCoords.set(postcode, coords);
  }

  const updates = [];
  const filtered = [];
  for (const supplier of rows) {
    let lat = toFiniteNumber(supplier.base_lat);
    let lng = toFiniteNumber(supplier.base_lng);
    const postcode = normalizeUkPostcode(supplier.base_postcode);
    if ((lat === null || lng === null) && postcode) {
      const coords = postcodeCoords.get(postcode);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        updates.push({ id: supplier.id, postcode, lat, lng });
      }
    }

    if (lat === null || lng === null) continue;

    const radiusRaw = toFiniteNumber(supplier.travel_radius_miles);
    const radius = radiusRaw !== null && radiusRaw > 0 ? radiusRaw : 30;
    const miles = distanceMiles(eventLat, eventLng, lat, lng);
    if (miles === null) continue;
    if (miles <= radius) {
      filtered.push({
        ...supplier,
        base_postcode: postcode || supplier.base_postcode || null,
        base_lat: lat,
        base_lng: lng,
        _distance_miles: miles,
      });
    }
  }

  if (updates.length > 0) {
    const uniqueById = new Map();
    for (const row of updates) uniqueById.set(row.id, row);
    await Promise.all(
      [...uniqueById.values()].map(async (row) => {
        const updateResp = await admin
          .from("suppliers")
          .update({
            base_postcode: row.postcode,
            base_lat: row.lat,
            base_lng: row.lng,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updateResp.error) {
          console.warn("supplier coordinate backfill failed:", String(updateResp.error.message || "unknown"));
        }
      })
    );
  }

  return filtered;
}
