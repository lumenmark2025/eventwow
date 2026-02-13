function safeTrim(value) {
  return String(value || "").trim();
}

export function computeSupplierGateFromData({ supplier, images }) {
  const shortDescription = safeTrim(supplier?.short_description);
  const about = safeTrim(supplier?.about);
  const categories = Array.isArray(supplier?.listing_categories) ? supplier.listing_categories : [];
  const locationLabel = safeTrim(supplier?.location_label);
  const services = Array.isArray(supplier?.services)
    ? supplier.services.map((x) => safeTrim(x)).filter(Boolean)
    : [];
  const heroCount = (images || []).filter((img) => img.type === "hero").length;
  const galleryCount = (images || []).filter((img) => img.type === "gallery").length;

  const checks = {
    shortDescription: shortDescription.length >= 30,
    about: about.length >= 120,
    categories: categories.length >= 1,
    locationLabel: locationLabel.length >= 3,
    heroImage: heroCount >= 1,
    galleryImages: galleryCount >= 2,
    services: services.length >= 3,
  };

  const reasons = [];
  if (!checks.shortDescription) reasons.push("Short description must be at least 30 characters.");
  if (!checks.about) reasons.push("About section must be at least 120 characters.");
  if (!checks.categories) reasons.push("Select at least one category.");
  if (!checks.locationLabel) reasons.push("Location label must be at least 3 characters.");
  if (!checks.heroImage) reasons.push("Upload a hero image.");
  if (!checks.galleryImages) reasons.push("Upload at least 2 gallery images.");
  if (!checks.services) reasons.push("Add at least 3 services.");

  return {
    canPublish: reasons.length === 0,
    checks,
    reasons,
    counts: {
      heroCount,
      galleryCount,
      servicesCount: services.length,
      categoriesCount: categories.length,
    },
  };
}

export async function computeSupplierGateFromDb(admin, supplierId) {
  const { data: supplier, error: supplierErr } = await admin
    .from("suppliers")
    .select("id,short_description,about,listing_categories,location_label,services")
    .eq("id", supplierId)
    .maybeSingle();

  if (supplierErr) return { gate: null, error: supplierErr };
  if (!supplier) return { gate: null, error: null };

  const imagesResp = await admin
    .from("supplier_images")
    .select("id,type")
    .eq("supplier_id", supplierId);

  if (imagesResp.error) return { gate: null, error: imagesResp.error };

  return {
    gate: computeSupplierGateFromData({ supplier, images: imagesResp.data || [] }),
    error: null,
  };
}
