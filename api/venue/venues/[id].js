import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../../_lib/requireUser.js";
import { isVenueOwner } from "../../_lib/venueOwnership.js";
import { toVenueProfileDto } from "../../_lib/venues.js";

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

function parseIntOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export default async function handler(req, res) {
  try {
    if (!["GET", "PATCH"].includes(req.method)) {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireUser(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const venueId = String(req.query?.id || "").trim();
    if (!venueId) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing venue id" });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const ownershipResp = await isVenueOwner(admin, auth.userId, venueId);
    if (!ownershipResp.ok) return res.status(500).json({ ok: false, error: "Failed to check ownership", details: ownershipResp.error });
    if (!ownershipResp.owns) return res.status(403).json({ ok: false, error: "Forbidden" });

    if (req.method === "PATCH") {
      const body = parseBody(req);

      const shortDescriptionRaw = body?.short_description;
      const aboutRaw = body?.about;
      const guestMinRaw = body?.guest_min;
      const guestMaxRaw = body?.guest_max;
      const locationLabelRaw = body?.location_label;

      const shortDescription =
        shortDescriptionRaw === undefined ? undefined : String(shortDescriptionRaw || "").trim().slice(0, 300) || null;
      const about = aboutRaw === undefined ? undefined : String(aboutRaw || "").trim().slice(0, 5000) || null;
      const guestMin = guestMinRaw === undefined ? undefined : parseIntOrNull(guestMinRaw);
      const guestMax = guestMaxRaw === undefined ? undefined : parseIntOrNull(guestMaxRaw);
      const locationLabel =
        locationLabelRaw === undefined ? undefined : String(locationLabelRaw || "").trim().slice(0, 160) || null;

      if ((guestMin != null && guestMin < 0) || (guestMax != null && guestMax < 0)) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "Guest counts cannot be negative" });
      }
      if (guestMin != null && guestMax != null && guestMin > guestMax) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "guest_min cannot be greater than guest_max" });
      }

      const patch = {};
      if (shortDescription !== undefined) patch.short_description = shortDescription;
      if (about !== undefined) {
        patch.about = about;
        patch.description = about || shortDescription || null;
      }
      if (guestMin !== undefined) patch.guest_min = guestMin;
      if (guestMax !== undefined) patch.guest_max = guestMax;
      if (locationLabel !== undefined) patch.location_label = locationLabel;

      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        patch.updated_by_user = auth.userId;
        const updateResp = await admin.from("venues").update(patch).eq("id", venueId).select("id").maybeSingle();
        if (updateResp.error) {
          return res.status(500).json({ ok: false, error: "Failed to update venue", details: updateResp.error.message });
        }
      }
    }

    const venueResp = await admin
      .from("venues")
      .select("id,name,slug,location_label,city,guest_min,guest_max,short_description,description,about,website_url,facilities,is_published")
      .eq("id", venueId)
      .maybeSingle();
    if (venueResp.error) return res.status(500).json({ ok: false, error: "Failed to load venue", details: venueResp.error.message });
    if (!venueResp.data) return res.status(404).json({ ok: false, error: "Venue not found" });

    const imagesResp = await admin
      .from("venue_images")
      .select("id,venue_id,type,path,caption,sort_order,created_at")
      .eq("venue_id", venueId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load venue images", details: imagesResp.error.message });
    }

    const venue = toVenueProfileDto(venueResp.data, imagesResp.data || [], SUPABASE_URL);
    return res.status(200).json({
      ok: true,
      venue: {
        ...venue,
        isPublished: !!venueResp.data.is_published,
      },
    });
  } catch (err) {
    console.error("venue/venues/[id] crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

