import process from "node:process";
import { Buffer } from "node:buffer";
import { ensureBucketExists } from "../../../../api/_lib/storageBuckets.js";
import { getAdminClient } from "./shared.js";

const HERO_BUCKET = "venue-hero-images";
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DELAY_MS = 800;
const MAX_BATCH_SIZE = 50;
const MAX_DELAY_MS = 5000;

function toPositiveInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return Math.max(min, Math.min(max, rounded));
}

function normalizeBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function parseBody(req) {
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

function buildPrompt(venue) {
  const town = String(venue?.city || venue?.location_label || "").trim();
  if (town) {
    return `Elegant wedding venue in ${town}, North East England, romantic golden hour, cinematic, wide shot, tasteful, no text, no logos, no watermarks`;
  }
  return "Elegant wedding venue in North East England, romantic golden hour, cinematic, wide shot, tasteful, no text, no logos, no watermarks";
}

function buildObjectPath(venueId) {
  return `venues/${venueId}/hero-1200x600.jpg`;
}

function publicUrlFromPath(supabaseUrl, bucket, objectPath) {
  const base = String(supabaseUrl || "").replace(/\/+$/, "");
  const cleanBucket = encodeURIComponent(String(bucket || "").trim());
  const cleanPath = String(objectPath || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/storage/v1/object/public/${cleanBucket}/${cleanPath}`;
}

function pickTownValue(row, schemaMode) {
  if (schemaMode === "town") return row?.town || row?.location_label || "";
  if (schemaMode === "city") return row?.city || row?.location_label || "";
  if (schemaMode === "both") return row?.town || row?.city || row?.location_label || "";
  return "";
}

async function selectVenuesWithSchemaFallback(admin, { limit, requireMissingOnly }) {
  const variants = [
    { mode: "both", select: "id,name,town,city,location_label,hero_image_url,updated_at,created_at" },
    { mode: "town", select: "id,name,town,location_label,hero_image_url,updated_at,created_at" },
    { mode: "city", select: "id,name,city,location_label,hero_image_url,updated_at,created_at" },
    { mode: "minimal", select: "id,name,location_label,hero_image_url,updated_at,created_at" },
  ];

  for (const variant of variants) {
    let query = admin
      .from("venues")
      .select(variant.select)
      .order("updated_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(limit);
    if (requireMissingOnly) {
      query = query.is("hero_image_url", null);
    }
    const resp = await query;
    if (!resp.error) return { ok: true, rows: Array.isArray(resp.data) ? resp.data : [], schemaMode: variant.mode };
  }

  return { ok: false, error: "Failed to query venues with available schema columns", rows: [], schemaMode: "minimal" };
}

async function countMissingHeroUrls(admin) {
  const countNullResp = await admin
    .from("venues")
    .select("id", { head: true, count: "exact" })
    .is("hero_image_url", null);
  if (countNullResp.error) return { ok: false, error: countNullResp.error.message, count: 0 };

  const countEmptyResp = await admin
    .from("venues")
    .select("id", { head: true, count: "exact" })
    .eq("hero_image_url", "");
  if (countEmptyResp.error) return { ok: false, error: countEmptyResp.error.message, count: 0 };

  return { ok: true, count: Number(countNullResp.count || 0) + Number(countEmptyResp.count || 0) };
}

async function listVenuesForHeroGeneration(admin, { batchSize, overwrite }) {
  const nullRowsResp = await selectVenuesWithSchemaFallback(admin, {
    limit: overwrite ? batchSize : batchSize * 2,
    requireMissingOnly: !overwrite,
  });
  if (!nullRowsResp.ok) return { ok: false, error: nullRowsResp.error, rows: [], schemaMode: "minimal" };

  const baseRows = nullRowsResp.rows || [];
  let rows = baseRows;

  if (!overwrite) {
    const emptyRowsResp = await selectVenuesWithSchemaFallback(admin, {
      limit: batchSize * 2,
      requireMissingOnly: false,
    });
    if (!emptyRowsResp.ok) {
      return { ok: false, error: emptyRowsResp.error, rows: [], schemaMode: nullRowsResp.schemaMode };
    }
    const extra = (emptyRowsResp.rows || []).filter((row) => String(row.hero_image_url || "").trim() === "");
    const seen = new Set(rows.map((row) => row.id));
    for (const row of extra) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }

  if (!overwrite) {
    rows = rows.filter((row) => String(row.hero_image_url || "").trim() === "");

    const venueIds = rows.map((row) => row.id).filter(Boolean);
    if (venueIds.length > 0) {
      const heroRowsResp = await admin
        .from("venue_images")
        .select("venue_id")
        .eq("type", "hero")
        .in("venue_id", venueIds);
      if (heroRowsResp.error) {
        return {
          ok: false,
          error: `Failed to inspect existing hero images: ${heroRowsResp.error.message}`,
          rows: [],
          schemaMode: nullRowsResp.schemaMode,
        };
      }
      const heroIds = new Set((heroRowsResp.data || []).map((item) => item?.venue_id).filter(Boolean));
      rows = rows.filter((row) => !heroIds.has(row.id));
    }
  }

  return { ok: true, rows: rows.slice(0, batchSize), schemaMode: nullRowsResp.schemaMode };
}

async function generateHeroImageBytes({ apiKey, prompt }) {
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      quality: "medium",
      output_format: "jpeg",
      background: "auto",
      moderation: "low",
      n: 1,
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const details = json?.error?.message || json?.message || "Image generation failed";
    throw new Error(details);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image data");
  return Buffer.from(String(b64), "base64");
}

async function delay(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getVenueHeroImageJobPreview(req, res) {
  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error });
  }
  const { admin } = client;
  const limit = toPositiveInt(req.query?.limit, 100, 1, 500);
  const count = await countMissingHeroUrls(admin);
  if (!count.ok) {
    return res.status(500).json({ ok: false, error: "Failed to count missing hero images", details: count.error });
  }

  const listResp = await listVenuesForHeroGeneration(admin, { batchSize: limit, overwrite: false });
  if (!listResp.ok) {
    return res.status(500).json({ ok: false, error: "Failed to list venues missing hero images", details: listResp.error });
  }

  const rows = (listResp.rows || []).map((row) => ({
    venueId: row.id,
    name: row.name || "Venue",
    town: pickTownValue(row, listResp.schemaMode),
    heroImageUrl: row.hero_image_url || "",
    status: "queued",
  }));

  return res.status(200).json({
    ok: true,
    missingCount: count.count,
    preview: rows,
    notes: {
      bucket: HERO_BUCKET,
      requiredEnv: ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    },
  });
}

export async function runVenueHeroImageGenerationJob(req, res) {
  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error });
  }

  const { admin, SUPABASE_URL } = client;
  const OPENAI_API_KEY = String(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const body = parseBody(req);
  const batchSize = toPositiveInt(body?.batchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const delayMs = toPositiveInt(body?.delayMs, DEFAULT_DELAY_MS, 0, MAX_DELAY_MS);
  const dryRun = normalizeBool(body?.dryRun);
  const overwrite = normalizeBool(body?.overwrite);

  if (!dryRun && !OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Missing AI image API key",
      details: "Set AI_API_KEY or OPENAI_API_KEY on the server before running this job.",
    });
  }

  const bucketResp = await ensureBucketExists(admin, HERO_BUCKET, { public: true });
  if (!bucketResp.ok && !dryRun) {
    return res.status(500).json({
      ok: false,
      error: "Failed to ensure hero image bucket",
      details: bucketResp.error,
    });
  }

  const venueResp = await listVenuesForHeroGeneration(admin, { batchSize, overwrite });
  if (!venueResp.ok) {
    return res.status(500).json({ ok: false, error: "Failed to load venues", details: venueResp.error });
  }

  const venues = venueResp.rows;
  const errors = [];
  const results = [];
  let saved = 0;
  let skipped = 0;

  for (let i = 0; i < venues.length; i += 1) {
    const venue = venues[i];
    const venueId = venue.id;
    const venueName = venue.name || "Venue";
    const town = pickTownValue(venue, venueResp.schemaMode);
    const hasHeroUrl = String(venue.hero_image_url || "").trim().length > 0;

    if (!overwrite && hasHeroUrl) {
      skipped += 1;
      results.push({
        venueId,
        name: venueName,
        town,
        status: "skipped",
        url: venue.hero_image_url,
      });
      continue;
    }

    if (dryRun) {
      skipped += 1;
      const predictedPath = buildObjectPath(venueId);
      const predictedUrl = publicUrlFromPath(SUPABASE_URL, HERO_BUCKET, predictedPath);
      results.push({
        venueId,
        name: venueName,
        town,
        status: "skipped",
        url: predictedUrl,
      });
      continue;
    }

    try {
      console.log("[venue-hero-job] start", { venueId, venueName, town });
      const prompt = buildPrompt(venue);
      const imageBytes = await generateHeroImageBytes({ apiKey: OPENAI_API_KEY, prompt });
      console.log("[venue-hero-job] generated", { venueId, bytes: imageBytes.length });

      const objectPath = buildObjectPath(venueId);
      const uploadResp = await admin.storage.from(HERO_BUCKET).upload(objectPath, imageBytes, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
      if (uploadResp.error) throw new Error(`Upload failed: ${uploadResp.error.message}`);
      console.log("[venue-hero-job] uploaded", { venueId, objectPath });

      const publicUrl = publicUrlFromPath(SUPABASE_URL, HERO_BUCKET, objectPath);
      const updateResp = await admin
        .from("venues")
        .update({ hero_image_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", venueId)
        .select("id")
        .single();
      if (updateResp.error) throw new Error(`DB update failed: ${updateResp.error.message}`);
      console.log("[venue-hero-job] saved", { venueId, publicUrl });

      saved += 1;
      results.push({
        venueId,
        name: venueName,
        town,
        status: "saved",
        url: publicUrl,
      });
    } catch (err) {
      const message = String(err?.message || err || "Unknown error");
      console.error("[venue-hero-job] error", { venueId, venueName, message });
      errors.push({ venueId, message });
      results.push({
        venueId,
        name: venueName,
        town,
        status: "error",
        url: "",
      });
    }

    if (i < venues.length - 1) {
      await delay(delayMs);
    }
  }

  return res.status(200).json({
    ok: true,
    processed: venues.length,
    saved,
    skipped,
    errors,
    results,
  });
}
