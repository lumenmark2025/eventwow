import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../../_lib/requireUser.js";
import { getPublicImageUrl } from "../../_lib/publicImage.js";
import { VENUE_IMAGES_BUCKET } from "../../_lib/storageBuckets.js";
import { listOwnedVenueIds } from "../../_lib/venueOwnership.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireUser(req);
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const ownedResp = await listOwnedVenueIds(admin, auth.userId);
    if (!ownedResp.ok) return res.status(500).json({ ok: false, error: "Failed to load venue ownership", details: ownedResp.error });
    if (ownedResp.venueIds.length === 0) return res.status(200).json({ ok: true, rows: [] });

    const [venuesResp, imagesResp] = await Promise.all([
      admin
        .from("venues")
        .select("id,name,slug,location_label,city,guest_min,guest_max,short_description,about,is_published,updated_at,created_at")
        .in("id", ownedResp.venueIds)
        .order("updated_at", { ascending: false, nullsFirst: false }),
      admin
        .from("venue_images")
        .select("venue_id,type,path,sort_order,created_at")
        .in("venue_id", ownedResp.venueIds)
        .eq("type", "hero")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (venuesResp.error) return res.status(500).json({ ok: false, error: "Failed to load venues", details: venuesResp.error.message });
    if (imagesResp.error) return res.status(500).json({ ok: false, error: "Failed to load venue images", details: imagesResp.error.message });

    const heroByVenue = new Map();
    for (const img of imagesResp.data || []) {
      if (!heroByVenue.has(img.venue_id)) {
        heroByVenue.set(img.venue_id, img.path || null);
      }
    }

    const rows = (venuesResp.data || []).map((venue) => ({
      id: venue.id,
      name: venue.name || "Venue",
      slug: venue.slug || null,
      locationLabel: venue.location_label || venue.city || null,
      guestMin: venue.guest_min,
      guestMax: venue.guest_max,
      shortDescription: venue.short_description || null,
      about: venue.about || null,
      heroImageUrl: heroByVenue.get(venue.id)
        ? getPublicImageUrl(SUPABASE_URL, VENUE_IMAGES_BUCKET, heroByVenue.get(venue.id))
        : null,
      isPublished: !!venue.is_published,
      updatedAt: venue.updated_at || venue.created_at || null,
    }));

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    console.error("venue/me/venues crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

