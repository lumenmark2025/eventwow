function trimSlashes(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function toPublicImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  const supabaseBase = String(import.meta.env.VITE_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!supabaseBase) return null;

  const objectPath = trimSlashes(raw);
  return `${supabaseBase}/storage/v1/object/public/${objectPath}`;
}
