import { getPublicImageUrl } from "../_lib/publicImage.js";
import { VENUE_IMAGES_BUCKET } from "../_lib/storageBuckets.js";
import { requireVenueOwner } from "../_lib/venueOwnerAuth.js";

function toStatus(isPublished, requiresReview) {
  if (requiresReview) return "pending_review";
  if (isPublished) return "published";
  return "draft";
}

async function createSignedReadUrl(admin, path, ttlSeconds = 3600) {
  const cleanPath = String(path || "").trim();
  if (!cleanPath) return null;
  const signed = await admin.storage.from(VENUE_IMAGES_BUCKET).createSignedUrl(cleanPath, ttlSeconds);
  if (signed.error) return null;
  return signed.data?.signedUrl || null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireVenueOwner(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const ownedResp = await auth.admin
      .from("venue_owners_link")
      .select("venue_id")
      .eq("user_id", auth.userId);
    if (ownedResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load ownership links", details: ownedResp.error.message });
    }

    const venueIds = Array.from(new Set((ownedResp.data || []).map((r) => r.venue_id).filter(Boolean)));
    if (venueIds.length === 0) return res.status(200).json({ ok: true, rows: [] });

    const [venuesResp, imagesResp] = await Promise.all([
      auth.admin
        .from("venues")
        .select("id,slug,name,description,short_description,location_label,guest_min,guest_max,facilities,is_published,requires_review,last_submitted_at,created_at,updated_at")
        .in("id", venueIds)
        .order("updated_at", { ascending: false, nullsFirst: false }),
      auth.admin
        .from("venue_images")
        .select("id,venue_id,type,path,caption,sort_order,created_at")
        .in("venue_id", venueIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (venuesResp.error) return res.status(500).json({ ok: false, error: "Failed to load venues", details: venuesResp.error.message });
    if (imagesResp.error) return res.status(500).json({ ok: false, error: "Failed to load venue images", details: imagesResp.error.message });

    const imagesByVenue = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesByVenue.has(img.venue_id)) imagesByVenue.set(img.venue_id, []);
      imagesByVenue.get(img.venue_id).push(img);
    }

    const rows = [];
    for (const venue of venuesResp.data || []) {
      const imgs = imagesByVenue.get(venue.id) || [];
      const hero = imgs.find((img) => img.type === "hero") || null;
      const gallery = imgs.filter((img) => img.type === "gallery");

      const heroImageSignedUrl = hero ? await createSignedReadUrl(auth.admin, hero.path) : null;
      const galleryWithSigned = [];
      for (const img of gallery) {
        const signedUrl = await createSignedReadUrl(auth.admin, img.path);
        galleryWithSigned.push({
          id: img.id,
          caption: img.caption || null,
          sort_order: Number(img.sort_order || 0),
          object_path: img.path,
          signed_url: signedUrl,
          // fallback for any existing public bucket behavior
          public_url: getPublicImageUrl(auth.supabaseUrl, VENUE_IMAGES_BUCKET, img.path),
        });
      }

      rows.push({
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        description: venue.description || "",
        short_description: venue.short_description || "",
        location_label: venue.location_label || null,
        guest_min: venue.guest_min,
        guest_max: venue.guest_max,
        facilities: Array.isArray(venue.facilities) ? venue.facilities : [],
        is_published: !!venue.is_published,
        requires_review: !!venue.requires_review,
        last_submitted_at: venue.last_submitted_at || null,
        status: toStatus(!!venue.is_published, !!venue.requires_review),
        hero_image: hero
          ? {
              id: hero.id,
              object_path: hero.path,
              signed_url: heroImageSignedUrl,
              public_url: getPublicImageUrl(auth.supabaseUrl, VENUE_IMAGES_BUCKET, hero.path),
            }
          : null,
        gallery: galleryWithSigned,
        created_at: venue.created_at || null,
        updated_at: venue.updated_at || null,
      });
    }

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    console.error("venue/my-venues crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
