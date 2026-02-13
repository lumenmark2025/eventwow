function normalizeUrl(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim();
}

export function getPublicImageUrl(supabaseUrl, bucket, pathOrUrl) {
  const value = normalizeUrl(pathOrUrl);
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const safeBucket = String(bucket || "").trim();
  const safeSupabase = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  if (!safeBucket || !safeSupabase) return null;

  const cleanPath = value.replace(/^\/+/, "");
  return `${safeSupabase}/storage/v1/object/public/${encodeURIComponent(safeBucket)}/${cleanPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;
}

