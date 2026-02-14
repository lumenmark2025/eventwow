import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { makeUniqueVenueSlug, parseBody, slugifyVenue } from "./_lib/venues.js";

function parseIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

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

    const body = parseBody(req);
    const venueId = String(body?.venueId || "").trim() || null;
    const name = String(body?.name || "").trim();
    const locationLabel = String(body?.locationLabel || "").trim() || null;
    const address = String(body?.address || "").trim() || null;
    const city = String(body?.city || "").trim() || null;
    const postcode = String(body?.postcode || "").trim() || null;
    const shortDescription = String(body?.shortDescription || "").trim() || null;
    const about = String(body?.about || "").trim() || null;
    const websiteUrl = String(body?.websiteUrl || "").trim() || null;
    const listedPublicly = !!body?.listedPublicly;
    const guestMin = parseIntOrNull(body?.guestMin);
    const guestMax = parseIntOrNull(body?.guestMax);

    if (!name) return res.status(400).json({ ok: false, error: "Bad request", details: "name is required" });
    if (shortDescription && shortDescription.length > 300) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "shortDescription must be 300 chars or less" });
    }
    if (about && about.length > 5000) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "about must be 5000 chars or less" });
    }
    if ((guestMin != null && guestMin < 0) || (guestMax != null && guestMax < 0)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "guest range cannot be negative" });
    }
    if (guestMin != null && guestMax != null && guestMin > guestMax) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "guestMin cannot be greater than guestMax" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const inputSlug = String(body?.slug || "").trim();
    const slugSeed = inputSlug || slugifyVenue(name);
    const slug = await makeUniqueVenueSlug(admin, slugSeed, venueId);
    const nowIso = new Date().toISOString();

    const payload = {
      name,
      slug,
      location_label: locationLabel,
      address,
      city,
      postcode,
      guest_min: guestMin,
      guest_max: guestMax,
      short_description: shortDescription,
      about,
      description: about || shortDescription || null,
      website_url: websiteUrl,
      listed_publicly: listedPublicly,
      is_published: listedPublicly,
      updated_at: nowIso,
      updated_by_user: auth.userId,
    };

    const resp = venueId
      ? await admin.from("venues").update(payload).eq("id", venueId).select("id").single()
      : await admin
          .from("venues")
          .insert([{ ...payload, created_at: nowIso }])
          .select("id")
          .single();

    if (resp.error) {
      return res.status(500).json({ ok: false, error: "Failed to save venue", details: resp.error.message });
    }

    return res.status(200).json({ ok: true, venueId: resp.data.id });
  } catch (err) {
    console.error("admin-venue-save crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
