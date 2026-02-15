import crypto from "node:crypto";
import { getPublicImageUrl } from "./publicImage.js";
import { buildPerformanceSignals } from "./performanceSignals.js";
import { SUPPLIER_IMAGES_BUCKET, VENUE_IMAGES_BUCKET } from "./storageBuckets.js";

export function normalizeSort(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "newest" ? "newest" : "recommended";
}

export function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  return body || {};
}

export function slugifyVenue(value) {
  const base = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `venue-${crypto.randomUUID().slice(0, 8)}`;
}

export async function makeUniqueVenueSlug(admin, nameOrSlug, excludeId = null) {
  const seed = slugifyVenue(nameOrSlug);
  let attempt = seed;
  for (let i = 0; i < 20; i += 1) {
    const query = admin.from("venues").select("id").eq("slug", attempt).maybeSingle();
    const { data, error } = excludeId ? await query.neq("id", excludeId) : await query;
    if (!error && !data) return attempt;
    attempt = `${seed}-${crypto.randomUUID().slice(0, 4)}`;
  }
  return `${seed}-${crypto.randomUUID().slice(0, 6)}`;
}

export function toVenueCardDto(venue, heroPath, supabaseUrl) {
  return {
    id: venue.id,
    slug: venue.slug,
    name: venue.name,
    locationLabel: venue.location_label || venue.city || null,
    guestMin: venue.guest_min,
    guestMax: venue.guest_max,
    shortDescription: venue.short_description || venue.description || null,
    heroImageUrl: heroPath ? getPublicImageUrl(supabaseUrl, VENUE_IMAGES_BUCKET, heroPath) : null,
    createdAt: venue.updated_at || venue.created_at || null,
  };
}

export function toVenueProfileDto(venue, images, supabaseUrl) {
  const hero = (images || []).find((img) => img.type === "hero") || null;
  const gallery = (images || [])
    .filter((img) => img.type === "gallery")
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  return {
    id: venue.id,
    slug: venue.slug,
    name: venue.name,
    locationLabel: venue.location_label || venue.city || null,
    guestMin: venue.guest_min,
    guestMax: venue.guest_max,
    shortDescription: venue.short_description || venue.description || null,
    about: venue.about || venue.description || null,
    websiteUrl: venue.website_url || null,
    heroImageUrl: hero ? getPublicImageUrl(supabaseUrl, VENUE_IMAGES_BUCKET, hero.path) : null,
    facilities: Array.isArray(venue.facilities) ? venue.facilities : [],
    gallery: gallery.map((img) => ({
      id: img.id,
      path: img.path,
      url: getPublicImageUrl(supabaseUrl, VENUE_IMAGES_BUCKET, img.path),
      caption: img.caption || null,
      sortOrder: Number(img.sort_order || 0),
    })),
  };
}

export function toLinkedSupplierDto(supplier, heroPath, perf, supabaseUrl, reviewStats = null) {
  return {
    supplierId: supplier.id,
    slug: supplier.slug || null,
    name: supplier.business_name || "Supplier",
    heroImageUrl: heroPath ? getPublicImageUrl(supabaseUrl, SUPPLIER_IMAGES_BUCKET, heroPath) : null,
    shortDescription: supplier.short_description || supplier.description || null,
    locationLabel: supplier.location_label || supplier.base_city || null,
    categories: Array.isArray(supplier.listing_categories) ? supplier.listing_categories : [],
    performance: buildPerformanceSignals(perf || null),
    reviewRating: Number.isFinite(Number(reviewStats?.average_rating)) ? Number(reviewStats.average_rating) : null,
    reviewCount: Number.isFinite(Number(reviewStats?.review_count)) ? Number(reviewStats.review_count) : 0,
  };
}
