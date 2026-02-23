import { SUPPLIER_IMAGES_BUCKET, VENUE_IMAGES_BUCKET, ensureBucketExists } from "../../../../api/_lib/storageBuckets.js";
import { toSlug } from "../../../../api/_lib/ranking.js";
import { getAdminClient } from "./shared.js";

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function listAdminRankingContexts(req, res) {
  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error });
  }

  const { admin } = client;
  const { data, error } = await admin
    .from("suppliers")
    .select("listing_categories,location_label,base_city,is_published")
    .eq("is_published", true)
    .limit(3000);
  if (error) return res.status(500).json({ ok: false, error: "Failed to load contexts", details: error.message });

  const categorySet = new Set();
  const locationSet = new Set();
  for (const row of data || []) {
    for (const cat of Array.isArray(row.listing_categories) ? row.listing_categories : []) {
      const slug = toSlug(cat);
      if (slug) categorySet.add(slug);
    }
    const locA = toSlug(row.location_label);
    const locB = toSlug(row.base_city);
    if (locA) locationSet.add(locA);
    if (locB) locationSet.add(locB);
  }

  const categories = [...categorySet].sort((a, b) => a.localeCompare(b)).map((slug) => ({ slug, label: titleFromSlug(slug) }));
  const locations = [...locationSet].sort((a, b) => a.localeCompare(b)).map((slug) => ({ slug, label: titleFromSlug(slug) }));

  return res.status(200).json({ ok: true, categories, locations });
}

export async function ensureAdminStorageBuckets(req, res) {
  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error });
  }

  const { admin } = client;
  const venueBucket = await ensureBucketExists(admin, VENUE_IMAGES_BUCKET, { public: true });
  if (!venueBucket.ok) {
    return res.status(500).json({
      ok: false,
      error: "Failed to ensure venue images bucket",
      details: venueBucket.error,
    });
  }

  const supplierBucket = await ensureBucketExists(admin, SUPPLIER_IMAGES_BUCKET, { public: true });
  if (!supplierBucket.ok) {
    return res.status(500).json({
      ok: false,
      error: "Failed to ensure supplier images bucket",
      details: supplierBucket.error,
    });
  }

  return res.status(200).json({
    ok: true,
    buckets: {
      [VENUE_IMAGES_BUCKET]: { created: venueBucket.created },
      [SUPPLIER_IMAGES_BUCKET]: { created: supplierBucket.created },
    },
  });
}
