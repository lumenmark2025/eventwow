function daySeed() {
  return new Date().toISOString().slice(0, 10);
}

function stableHash(text) {
  let hash = 2166136261;
  const value = String(text || "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickDeterministic(rows, key) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const aScore = stableHash(`${key}:${a.supplier_id || ""}:${a.path || ""}`);
    const bScore = stableHash(`${key}:${b.supplier_id || ""}:${b.path || ""}`);
    if (aScore !== bScore) return aScore - bScore;
    return String(a.path || "").localeCompare(String(b.path || ""));
  });
  return sorted[0] || null;
}

export async function loadFeaturedCategoriesWithHero(admin, supabaseUrl) {
  const categoryResp = await admin
    .from("supplier_category_options")
    .select("id,slug,display_name,label,icon_key,short_description,featured_order")
    .eq("is_featured", true)
    .eq("is_active", true)
    .order("featured_order", { ascending: true })
    .order("display_name", { ascending: true });

  if (categoryResp.error) throw categoryResp.error;

  const categories = (categoryResp.data || [])
    .map((row) => ({
      id: row.id || row.slug,
      slug: String(row.slug || "").trim(),
      display_name: String(row.display_name || row.label || "").trim(),
      icon_key: row.icon_key || null,
      short_description: row.short_description || null,
      featured_order: Number(row.featured_order || 0),
    }))
    .filter((row) => row.slug && row.display_name);

  if (categories.length === 0) return [];

  const supplierResp = await admin
    .from("suppliers")
    .select("id,listing_categories")
    .eq("is_published", true)
    .not("listing_categories", "is", null)
    .limit(3000);

  if (supplierResp.error) throw supplierResp.error;

  const suppliers = supplierResp.data || [];
  const supplierIds = suppliers.map((s) => s.id);

  const imagesResp = supplierIds.length > 0
    ? await admin
      .from("supplier_images")
      .select("supplier_id,path,type,sort_order")
      .in("supplier_id", supplierIds)
      .eq("type", "hero")
    : { data: [], error: null };

  if (imagesResp.error) throw imagesResp.error;

  const imagesBySupplier = new Map();
  for (const image of imagesResp.data || []) {
    if (!imagesBySupplier.has(image.supplier_id)) imagesBySupplier.set(image.supplier_id, []);
    imagesBySupplier.get(image.supplier_id).push(image);
  }

  const categoryImagePool = new Map();
  for (const supplier of suppliers) {
    const hero = (imagesBySupplier.get(supplier.id) || [])
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))[0];
    if (!hero?.path) continue;

    const names = Array.isArray(supplier.listing_categories) ? supplier.listing_categories : [];
    for (const rawName of names) {
      const normalized = String(rawName || "").trim().toLowerCase();
      if (!normalized) continue;
      if (!categoryImagePool.has(normalized)) categoryImagePool.set(normalized, []);
      categoryImagePool.get(normalized).push({ supplier_id: supplier.id, path: hero.path });
    }
  }

  const seed = daySeed();
  return categories.map((category) => {
    const key = `${category.slug}:${seed}`;
    const byDisplay = categoryImagePool.get(category.display_name.toLowerCase()) || [];
    const bySlugWords = categoryImagePool.get(category.slug.replace(/-/g, " ").toLowerCase()) || [];
    const candidates = byDisplay.length > 0 ? byDisplay : bySlugWords;
    const picked = pickDeterministic(candidates, key);

    return {
      id: category.id,
      slug: category.slug,
      display_name: category.display_name,
      icon_key: category.icon_key,
      short_description: category.short_description,
      hero_image_url: picked?.path ? getPublicImageUrl(supabaseUrl, "supplier-gallery", picked.path) : "/assets/placeholders/category-default.svg",
    };
  });
}
import { getPublicImageUrl } from "./publicImage.js";
