import { createClient } from "@supabase/supabase-js";
import { ensureBucketExists } from "../../../api/_lib/storageBuckets.js";

const CATEGORY_IMAGES_BUCKET = "category-images";

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function asText(value, fallback = "") {
  const v = String(value || "").trim();
  return v || fallback;
}

function hasRealCategoryImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("/assets/placeholders/")) return false;
  return true;
}

async function fetchImageBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download generated image (${resp.status})`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function generateImageBytes({ apiKey, model, prompt }) {
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
    }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Image generation failed");
  }

  const first = json?.data?.[0] || {};
  if (typeof first?.b64_json === "string" && first.b64_json) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (typeof first?.url === "string" && first.url) {
    return fetchImageBytes(first.url);
  }
  throw new Error("Image provider returned no image payload");
}

export async function generateCategoryImage({ categoryId }) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const AI_PROVIDER = String(process.env.AI_PROVIDER || process.env.OPENAI_PROVIDER || "openai").trim().toLowerCase();
  const AI_API_KEY = String(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const AI_IMAGE_MODEL = String(process.env.AI_IMAGE_MODEL || process.env.AI_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim();

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, code: 500, error: "Missing server env vars" };
  }
  if (AI_PROVIDER !== "openai") {
    return { ok: false, code: 500, error: `Image generation requires openai provider (current=${AI_PROVIDER})` };
  }
  if (!AI_API_KEY || !AI_IMAGE_MODEL) {
    return { ok: false, code: 500, error: "Missing AI env vars for image generation" };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const categoryResp = await admin
    .from("supplier_category_options")
    .select("id,slug,label,display_name,image_url")
    .eq("id", categoryId)
    .maybeSingle();

  if (categoryResp.error) {
    return { ok: false, code: 500, error: `Failed to load category: ${categoryResp.error.message}` };
  }
  if (!categoryResp.data) {
    return { ok: false, code: 404, error: "Category not found" };
  }

  if (hasRealCategoryImageUrl(categoryResp.data.image_url)) {
    return {
      ok: true,
      skipped: true,
      image_url: categoryResp.data.image_url,
      category: categoryResp.data,
    };
  }

  const displayName = asText(categoryResp.data.display_name, asText(categoryResp.data.label, "Event category"));
  const slug = normalizeSlug(categoryResp.data.slug || displayName) || String(categoryResp.data.id);
  const prompt = [
    `Clean, high-quality photo-style hero image representing "${displayName}" event services.`,
    "No people, no logos, no text, no brand names, no watermarks.",
    "Bright natural lighting, modern composition, neutral professional style, realistic details.",
    "Single subject focus with subtle depth of field, suitable for a website category card.",
  ].join(" ");

  const imageBytes = await generateImageBytes({
    apiKey: AI_API_KEY,
    model: AI_IMAGE_MODEL,
    prompt,
  });

  const ensureResp = await ensureBucketExists(admin, CATEGORY_IMAGES_BUCKET, { public: true });
  if (!ensureResp.ok) {
    return { ok: false, code: 500, error: `Failed to ensure category images bucket: ${ensureResp.error}` };
  }

  const objectPath = `categories/${slug}.png`;
  const uploadResp = await admin.storage.from(CATEGORY_IMAGES_BUCKET).upload(objectPath, imageBytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (uploadResp.error) {
    return { ok: false, code: 500, error: `Failed to upload image: ${uploadResp.error.message}` };
  }

  const publicUrlResp = admin.storage.from(CATEGORY_IMAGES_BUCKET).getPublicUrl(objectPath);
  const publicUrl = String(publicUrlResp?.data?.publicUrl || "").trim();
  if (!publicUrl) {
    return { ok: false, code: 500, error: "Failed to resolve public URL" };
  }

  const updateResp = await admin
    .from("supplier_category_options")
    .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", categoryId)
    .select("id,slug,label,display_name,image_url")
    .maybeSingle();

  if (updateResp.error) {
    return { ok: false, code: 500, error: `Failed to save image URL: ${updateResp.error.message}` };
  }

  return {
    ok: true,
    skipped: false,
    image_url: updateResp.data?.image_url || publicUrl,
    category: updateResp.data || null,
  };
}
