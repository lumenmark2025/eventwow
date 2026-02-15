import { getPublicImageUrl } from "./publicImage.js";

export const SUPPLIER_CATEGORY_OPTIONS = [
  "Pizza Catering",
  "Photographers",
  "DJs",
  "Venues",
  "Florists",
  "Bands",
  "Decor",
  "Cakes",
];

// DB-driven category options (preferred). If the table doesn't exist yet (migration not run),
// fall back to the legacy hardcoded list above so local/dev remains usable.
export async function loadSupplierCategoryOptions(admin) {
  try {
    const resp = await admin
      .from("supplier_category_options")
      .select("slug,label")
      .order("label", { ascending: true });

    if (resp.error) {
      const code = String(resp.error.code || "");
      const msg = String(resp.error.message || "").toLowerCase();
      const missing = code === "42P01" || msg.includes("supplier_category_options");
      if (missing) return [...SUPPLIER_CATEGORY_OPTIONS];
      throw resp.error;
    }

    const labels = (resp.data || [])
      .map((r) => String(r?.label || "").trim())
      .filter(Boolean);
    if (labels.length > 0) return labels;
    return [...SUPPLIER_CATEGORY_OPTIONS];
  } catch {
    return [...SUPPLIER_CATEGORY_OPTIONS];
  }
}

function normalizeText(value, maxLen = 4000) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.slice(0, maxLen);
}

function normalizeServices(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  const out = [];
  for (const raw of values) {
    const value = normalizeText(raw, 80);
    if (!value) continue;
    const key = value.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    out.push(value);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeCategories(values, allowedSet = null) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  const out = [];
  for (const raw of values) {
    const value = normalizeText(raw, 40);
    if (!value) continue;
    if (allowedSet && !allowedSet.has(value.toLowerCase())) continue;
    const key = value.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    out.push(value);
    if (out.length >= 12) break;
  }
  return out;
}

export function validateListingPayload(body, options = {}) {
  const allowedCategories = Array.isArray(options?.allowedCategories) ? options.allowedCategories : null;
  const allowedSet = allowedCategories
    ? new Set(allowedCategories.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))
    : null;

  const shortDescription = normalizeText(body?.shortDescription, 160);
  const about = normalizeText(body?.about, 4000);
  const locationLabel = normalizeText(body?.locationLabel, 120);
  const services = normalizeServices(body?.services);
  const categories = normalizeCategories(body?.categories, allowedSet);
  const listedPublicly = !!body?.listedPublicly;

  if (String(body?.shortDescription || "").trim().length > 160) {
    return { ok: false, error: "shortDescription must be 160 characters or less" };
  }
  if (String(body?.about || "").trim().length > 4000) {
    return { ok: false, error: "about must be 4000 characters or less" };
  }
  if (Array.isArray(body?.services) && body.services.length > 12) {
    return { ok: false, error: "services must have 12 items or fewer" };
  }
  if (allowedSet && Array.isArray(body?.categories)) {
    const invalid = body.categories
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .filter((x) => !allowedSet.has(x.toLowerCase()));
    if (invalid.length > 0) {
      return { ok: false, error: `categories contain invalid values: ${invalid.slice(0, 3).join(", ")}` };
    }
  }

  return {
    ok: true,
    value: {
      shortDescription,
      about,
      locationLabel,
      services,
      categories,
      listedPublicly,
    },
  };
}

export function buildEditableListingDto(supplier, images, categoryOptions = SUPPLIER_CATEGORY_OPTIONS, supabaseUrl = "") {
  const hero = (images || []).find((img) => img.type === "hero") || null;
  const gallery = (images || [])
    .filter((img) => img.type === "gallery")
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  return {
    supplier: {
      id: supplier.id,
      name: supplier.business_name || "Supplier",
      slug: supplier.slug || null,
      shortDescription: supplier.short_description || null,
      about: supplier.about || null,
      services: Array.isArray(supplier.services) ? supplier.services : [],
      locationLabel: supplier.location_label || null,
      listedPublicly: !!supplier.listed_publicly,
      categories: Array.isArray(supplier.listing_categories) ? supplier.listing_categories : [],
      updatedAt: supplier.updated_at || supplier.created_at || null,
    },
    media: {
      hero: hero
        ? {
            id: hero.id,
            path: hero.path,
            caption: hero.caption || null,
            url: getPublicImageUrl(supabaseUrl, "supplier-gallery", hero.path),
          }
        : null,
      gallery: gallery.map((img) => ({
        id: img.id,
        path: img.path,
        caption: img.caption || null,
        sortOrder: Number(img.sort_order || 0),
        url: getPublicImageUrl(supabaseUrl, "supplier-gallery", img.path),
      })),
    },
    categoryOptions,
  };
}

export function buildPublicSupplierDto(supplier, images, supabaseUrl = "") {
  const hero = (images || []).find((img) => img.type === "hero") || null;
  const gallery = (images || [])
    .filter((img) => img.type === "gallery")
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const categoriesRaw = Array.isArray(supplier.listing_categories) ? supplier.listing_categories : [];
  const categories = categoriesRaw.length > 0 ? categoriesRaw : ["Event Supplier"];
  const description = String(supplier.short_description || supplier.description || "").trim();
  const about = String(supplier.about || supplier.description || "").trim();

  return {
    id: supplier.id,
    slug: supplier.slug,
    name: supplier.business_name || "Supplier",
    shortDescription: description || "Trusted event supplier on Eventwow.",
    about: about || null,
    locationLabel:
      String(supplier.location_label || "").trim() ||
      [supplier.base_city, supplier.base_postcode].filter(Boolean).join(" - ") ||
      null,
    categories: categories.map((name) => ({
      id: String(name).toLowerCase().replace(/\s+/g, "-"),
      name,
      slug: String(name).toLowerCase().replace(/\s+/g, "-"),
    })),
    services: Array.isArray(supplier.services) ? supplier.services : [],
    heroImageUrl: hero ? getPublicImageUrl(supabaseUrl, "supplier-gallery", hero.path) : null,
    gallery: gallery
      .map((img) => ({
        url: getPublicImageUrl(supabaseUrl, "supplier-gallery", img.path),
        alt: img.caption || supplier.business_name || "Supplier image",
        sortOrder: Number(img.sort_order || 0),
      }))
      .filter((img) => !!img.url),
    lastUpdatedAt: supplier.updated_at || supplier.created_at || null,
  };
}
