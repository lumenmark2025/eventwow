export const SUPPLIER_IMAGES_BUCKET = "supplier-gallery";
export const VENUE_IMAGES_BUCKET = "venue-images";

const IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export async function ensureBucketExists(admin, bucketName, options = {}) {
  const target = String(bucketName || "").trim();
  if (!target) {
    return { ok: false, error: "Bucket name is required" };
  }

  const listResp = await admin.storage.listBuckets();
  if (listResp.error) {
    return { ok: false, error: listResp.error.message, action: "list" };
  }

  const existing = (listResp.data || []).find((bucket) => bucket?.name === target);
  if (existing) {
    if (options.public && existing.public !== true) {
      const updateResp = await admin.storage.updateBucket(target, {
        public: true,
        allowedMimeTypes: IMAGE_MIME_TYPES,
      });
      if (updateResp.error) {
        return { ok: false, error: updateResp.error.message, action: "update" };
      }
    }
    return { ok: true, created: false };
  }

  const createResp = await admin.storage.createBucket(target, {
    public: !!options.public,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    fileSizeLimit: "5MB",
  });
  if (createResp.error) {
    return { ok: false, error: createResp.error.message, action: "create" };
  }
  return { ok: true, created: true };
}
