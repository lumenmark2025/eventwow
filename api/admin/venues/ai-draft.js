import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";
import { makeUniqueVenueSlug, parseBody, slugifyVenue } from "../../_lib/venues.js";

const FEATURE_KEY = "venue_ai_draft";
const DAILY_LIMIT = 20;
const ALLOWED_VENUE_TYPES = new Set([
  "hotel",
  "barn",
  "country house",
  "village hall",
  "outdoor",
  "restaurant",
  "marquee site",
  "other",
]);

function asTrimmed(value, maxLen = 500) {
  return String(value || "").trim().slice(0, maxLen);
}

function normalizeVenueType(value) {
  const v = asTrimmed(value, 40).toLowerCase();
  return ALLOWED_VENUE_TYPES.has(v) ? v : "other";
}

function normalizeTextArray(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const v = asTrimmed(raw, maxLen);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function normalizeConfidence(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return "low";
}

function buildLocationLabel(townOrCity, countyOrRegion) {
  const town = asTrimmed(townOrCity, 120);
  const county = asTrimmed(countyOrRegion, 120);
  if (town && county) return `${town}, ${county}`;
  return town || county || "";
}

function safeDomainFromUrl(urlValue) {
  const raw = asTrimmed(urlValue, 300);
  if (!raw) return "";
  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return String(parsed.hostname || "").replace(/^www\./i, "").slice(0, 120);
  } catch {
    return "";
  }
}

function fallbackCapacity(venueType) {
  const map = {
    hotel: { min: 40, max: 200, confidence: "low" },
    barn: { min: 50, max: 180, confidence: "low" },
    "country house": { min: 30, max: 120, confidence: "low" },
    "village hall": { min: 40, max: 150, confidence: "low" },
    outdoor: { min: 60, max: 250, confidence: "low" },
    restaurant: { min: 20, max: 100, confidence: "low" },
    "marquee site": { min: 80, max: 300, confidence: "low" },
    other: { min: 30, max: 120, confidence: "low" },
  };
  return map[venueType] || map.other;
}

async function isSlugTaken(admin, slug) {
  const { data, error } = await admin.from("venues").select("id").eq("slug", slug).maybeSingle();
  return !error && !!data;
}

async function suggestUniqueSlug(admin, venueName, townOrCity, modelSlugCandidate = "") {
  const modelSlug = slugifyVenue(modelSlugCandidate || "");
  if (modelSlug && !(await isSlugTaken(admin, modelSlug))) return modelSlug;

  const base = slugifyVenue(venueName);
  if (!(await isSlugTaken(admin, base))) return base;

  const withTown = slugifyVenue(`${venueName}-${townOrCity}`);
  if (withTown && !(await isSlugTaken(admin, withTown))) return withTown;

  return makeUniqueVenueSlug(admin, withTown || base);
}

function extractJsonBlock(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = raw.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callAiProvider({ provider, apiKey, model, payload }) {
  if (provider === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        messages: [{ role: "user", content: payload }],
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error?.message || "Anthropic request failed");
    return String(json?.content?.[0]?.text || "");
  }

  if (provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: payload }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error?.message || "Gemini request failed");
    return String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "");
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You write neutral, factual venue drafts. Never claim awards, luxury, best, or unverifiable facts. Never copy text. Return strict JSON only.",
        },
        { role: "user", content: payload },
      ],
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error?.message || "OpenAI request failed");
  return String(json?.choices?.[0]?.message?.content || "");
}

function normalizeAiDraft(aiJson, input) {
  const fallbackLocation = buildLocationLabel(input.townOrCity, input.countyOrRegion);
  const fallbackShort = `A venue in ${input.townOrCity} suitable for weddings and events.`.slice(0, 180);
  const fallbackAbout = [
    `${input.venueName} is a venue in ${fallbackLocation || input.townOrCity}.`,
    "Details such as layout, guest capacity, and facilities should be confirmed directly with the venue before booking.",
  ].join("\n\n");
  const capFallback = fallbackCapacity(input.venueType);

  let guestMin = toInt(aiJson?.guest_min);
  let guestMax = toInt(aiJson?.guest_max);
  if (guestMin == null) guestMin = capFallback.min;
  if (guestMax == null) guestMax = capFallback.max;
  if (guestMax < guestMin) {
    guestMax = guestMin;
  }

  const shortDescription = asTrimmed(aiJson?.short_description, 180) || fallbackShort;
  const about = asTrimmed(aiJson?.about, 5000) || fallbackAbout;

  return {
    name_suggestion: asTrimmed(aiJson?.name_suggestion, 180) || input.venueName,
    slug_suggestion: asTrimmed(aiJson?.slug_suggestion, 180) || "",
    location_label: asTrimmed(aiJson?.location_label, 180) || fallbackLocation,
    short_description: shortDescription,
    about,
    guest_min: guestMin,
    guest_max: guestMax,
    capacity_confidence: normalizeConfidence(aiJson?.capacity_confidence || capFallback.confidence),
    tags: normalizeTextArray(aiJson?.tags, 10, 40),
    hero_image_search_terms: normalizeTextArray(aiJson?.hero_image_search_terms, 6, 80),
    suggested_supplier_categories: normalizeTextArray(aiJson?.suggested_supplier_categories, 8, 60),
    disclaimers: normalizeTextArray(aiJson?.disclaimers, 6, 180),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });
    if (!auth.userId) {
      return res.status(403).json({ ok: false, error: "Forbidden", details: "This endpoint requires an authenticated admin user" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const AI_PROVIDER = String(process.env.AI_PROVIDER || "openai").trim().toLowerCase();
    const AI_API_KEY = String(process.env.AI_API_KEY || "").trim();
    const AI_MODEL = String(process.env.AI_MODEL || "").trim();

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }
    if (!AI_API_KEY || !AI_MODEL) {
      return res.status(500).json({
        ok: false,
        error: "Missing AI env vars",
        details: {
          AI_PROVIDER,
          AI_API_KEY: !!AI_API_KEY,
          AI_MODEL: !!AI_MODEL,
        },
      });
    }

    const body = parseBody(req);
    const input = {
      venueName: asTrimmed(body?.venue_name, 180),
      townOrCity: asTrimmed(body?.town_or_city, 120),
      countyOrRegion: asTrimmed(body?.county_or_region, 120),
      venueType: normalizeVenueType(body?.venue_type),
      websiteUrl: asTrimmed(body?.website_url, 300),
      notes: asTrimmed(body?.notes, 1500),
    };

    if (!input.venueName) return res.status(400).json({ ok: false, error: "Bad request", details: "venue_name is required" });
    if (!input.townOrCity) return res.status(400).json({ ok: false, error: "Bad request", details: "town_or_city is required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const { count, error: countErr } = await admin
      .from("admin_ai_usage_logs")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", auth.userId)
      .eq("feature", FEATURE_KEY)
      .gte("created_at", dayStart.toISOString());
    if (countErr) return res.status(500).json({ ok: false, error: "Failed to validate rate limit", details: countErr.message });
    if (Number(count || 0) >= DAILY_LIMIT) {
      return res.status(429).json({
        ok: false,
        error: "Daily limit reached",
        details: `You have reached the ${DAILY_LIMIT} drafts/day limit for this tool.`,
      });
    }

    const usageInsert = await admin.from("admin_ai_usage_logs").insert([{ user_id: auth.userId, feature: FEATURE_KEY }]);
    if (usageInsert.error) {
      return res.status(500).json({ ok: false, error: "Failed to reserve draft quota", details: usageInsert.error.message });
    }

    const websiteDomain = safeDomainFromUrl(input.websiteUrl);
    const promptPayload = JSON.stringify(
      {
        task: "Generate a neutral venue draft for admin CMS.",
        guardrails: [
          "No scraping. No copying. No website fetching.",
          "Use website domain only as a weak context hint if provided.",
          "Avoid claims that are unverifiable, promotional, or comparative.",
          "If uncertain, use cautious phrasing.",
          "Return strict JSON only with requested keys.",
        ],
        input: {
          venue_name: input.venueName,
          town_or_city: input.townOrCity,
          county_or_region: input.countyOrRegion || null,
          venue_type: input.venueType,
          website_domain_hint: websiteDomain || null,
          notes: input.notes || null,
        },
        output_contract: {
          name_suggestion: "string",
          slug_suggestion: "string",
          location_label: "string",
          short_description: "string <= 180 chars",
          about: "string, 2-5 short paragraphs, neutral",
          guest_min: "integer",
          guest_max: "integer",
          capacity_confidence: "low|medium|high",
          tags: "string[] max 10",
          hero_image_search_terms: "string[] max 6",
          suggested_supplier_categories: "string[] max 8",
          disclaimers: "string[]",
        },
      },
      null,
      2
    );

    const modelRaw = await callAiProvider({
      provider: AI_PROVIDER,
      apiKey: AI_API_KEY,
      model: AI_MODEL,
      payload: promptPayload,
    });

    const modelJson = extractJsonBlock(modelRaw) || {};
    const normalized = normalizeAiDraft(modelJson, input);
    normalized.slug_suggestion = await suggestUniqueSlug(
      admin,
      input.venueName,
      input.townOrCity,
      normalized.slug_suggestion || modelJson?.slug_suggestion
    );
    if (!normalized.location_label) {
      normalized.location_label = buildLocationLabel(input.townOrCity, input.countyOrRegion);
    }
    if (!normalized.disclaimers.length) {
      normalized.disclaimers = ["Capacity is an estimate; confirm with venue."];
    }

    return res.status(200).json({ ok: true, ...normalized });
  } catch (err) {
    console.error("admin venues ai-draft crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
