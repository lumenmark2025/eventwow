import { assertVenueOwnership, requireVenueOwner } from "../_lib/venueOwnerAuth.js";

function parseBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function parseIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function normalizeFacilities(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, 80));
    if (out.length >= 40) break;
  }
  return out;
}

function toDto(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || "",
    short_description: row.short_description || "",
    guest_min: row.guest_min,
    guest_max: row.guest_max,
    facilities: Array.isArray(row.facilities) ? row.facilities : [],
    is_published: !!row.is_published,
    requires_review: !!row.requires_review,
    last_submitted_at: row.last_submitted_at || null,
    updated_at: row.updated_at || null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireVenueOwner(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const body = parseBody(req);
    const venueId = String(body?.venueId || "").trim();
    if (!venueId) return res.status(400).json({ ok: false, error: "Bad request", details: "venueId is required" });

    const ownership = await assertVenueOwnership(auth.admin, auth.userId, venueId);
    if (!ownership.ok) return res.status(ownership.code).json({ ok: false, error: ownership.error, details: ownership.details });

    const description = String(body?.description || "").trim().slice(0, 5000);
    const shortDescription = String(body?.shortDescription || "").trim().slice(0, 180);
    const guestMin = parseIntOrNull(body?.guestMin);
    const guestMax = parseIntOrNull(body?.guestMax);
    const facilities = normalizeFacilities(body?.facilities);

    if ((guestMin != null && guestMin < 0) || (guestMax != null && guestMax < 0)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Guest values cannot be negative" });
    }
    if (guestMin != null && guestMax != null && guestMin > guestMax) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "guestMin cannot be greater than guestMax" });
    }

    const patch = {
      description: description || null,
      short_description: shortDescription || null,
      guest_min: guestMin,
      guest_max: guestMax,
      facilities,
      requires_review: true,
      last_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_user: auth.userId,
    };

    const updateResp = await auth.admin
      .from("venues")
      .update(patch)
      .eq("id", venueId)
      .select("id,slug,name,description,short_description,guest_min,guest_max,facilities,is_published,requires_review,last_submitted_at,updated_at")
      .maybeSingle();
    if (updateResp.error) return res.status(500).json({ ok: false, error: "Failed to update venue", details: updateResp.error.message });
    if (!updateResp.data) return res.status(404).json({ ok: false, error: "Venue not found" });

    return res.status(200).json({ ok: true, venue: toDto(updateResp.data) });
  } catch (err) {
    console.error("venue/update crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

