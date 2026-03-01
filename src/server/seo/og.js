import { createClient } from "@supabase/supabase-js";
import { getPublicImageUrl } from "../../../api/_lib/publicImage.js";
import { computeSupplierGateFromData } from "../../../api/_lib/supplierGate.js";
import { VENUE_IMAGES_BUCKET } from "../../../api/_lib/storageBuckets.js";

const SITE_URL = "https://www.eventwow.co.uk";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;
const DEFAULT_HOME_TITLE = "Eventwow | Venues & event suppliers across the UK";
const DEFAULT_HOME_DESCRIPTION =
  "Eventwow connects you with venues and event professionals across the UK - free to post, easy to compare, built for confidence.";

const CRAWLER_PATTERNS = [
  /facebookexternalhit/i,
  /facebot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /slackbot/i,
  /discordbot/i,
  /whatsapp/i,
  /telegrambot/i,
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trimText(value, max = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function absoluteUrl(path = "/") {
  const safePath = String(path || "/").startsWith("/") ? String(path || "/") : `/${String(path || "")}`;
  return `${SITE_URL}${safePath}`;
}

function absoluteImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return absoluteUrl(raw);
  return absoluteUrl(`/${raw.replace(/^\/+/, "")}`);
}

function formatGuestRange(min, max) {
  const minValue = Number(min);
  const maxValue = Number(max);
  const hasMin = Number.isFinite(minValue) && minValue > 0;
  const hasMax = Number.isFinite(maxValue) && maxValue > 0;
  if (hasMin && hasMax && minValue !== maxValue) return `${minValue}-${maxValue} guests`;
  if (hasMax) return `Up to ${maxValue} guests`;
  if (hasMin) return `${minValue}+ guests`;
  return "";
}

function venueDescription(venue) {
  const base = trimText(venue?.short_description || venue?.description, 170);
  if (base) return base;
  const parts = [];
  const location = trimText(venue?.location_label || venue?.city, 80);
  const guests = formatGuestRange(venue?.guest_min, venue?.guest_max);
  if (location) parts.push(location);
  if (guests) parts.push(guests);
  parts.push("Explore this venue and request quotes from trusted suppliers.");
  return trimText(parts.join(" • "), 200);
}

function supplierDescription(supplier) {
  const base = trimText(supplier?.short_description || supplier?.description, 170);
  if (base) return base;
  const location = trimText(supplier?.location_label || supplier?.base_city, 80);
  const parts = [];
  if (location) parts.push(location);
  parts.push("View supplier profile and request a quote on Eventwow.");
  return trimText(parts.join(" • "), 200);
}

function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    admin: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }),
    supabaseUrl,
  };
}

async function fetchVenuePayload(slug) {
  const { admin, supabaseUrl } = createAdminClient();
  const venueResp = await admin
    .from("venues")
    .select("id,name,slug,short_description,description,location_label,city,guest_min,guest_max,hero_image_url,is_published")
    .eq("slug", String(slug || "").trim().toLowerCase())
    .maybeSingle();

  if (venueResp.error || !venueResp.data || !venueResp.data.is_published) return null;

  const imagesResp = await admin
    .from("venue_images")
    .select("type,path,sort_order,created_at")
    .eq("venue_id", venueResp.data.id)
    .eq("type", "hero")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);

  const heroPath = imagesResp.error ? null : imagesResp.data?.[0]?.path || null;
  const heroUrl = heroPath
    ? getPublicImageUrl(supabaseUrl, VENUE_IMAGES_BUCKET, heroPath)
    : String(venueResp.data.hero_image_url || "").trim() || null;

  const description = venueDescription(venueResp.data);
  return {
    title: `${venueResp.data.name} | Eventwow`,
    description,
    imageUrl: absoluteImageUrl(heroUrl),
    url: absoluteUrl(`/venues/${venueResp.data.slug}`),
    path: `/venues/${venueResp.data.slug}`,
    type: "website",
  };
}

async function fetchSupplierPayload(slug) {
  const { admin, supabaseUrl } = createAdminClient();
  const supplierResp = await admin
    .from("suppliers")
    .select("id,slug,business_name,short_description,description,location_label,base_city,is_published,listing_categories,services,about")
    .eq("slug", String(slug || "").trim().toLowerCase())
    .maybeSingle();

  if (supplierResp.error || !supplierResp.data || !supplierResp.data.is_published) return null;

  const imagesResp = await admin
    .from("supplier_images")
    .select("type,path,sort_order,created_at")
    .eq("supplier_id", supplierResp.data.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const images = imagesResp.error ? [] : imagesResp.data || [];
  const gate = computeSupplierGateFromData({ supplier: supplierResp.data, images });
  if (!gate.canPublish) return null;

  const hero = images.find((image) => image.type === "hero");
  const heroUrl = hero ? getPublicImageUrl(supabaseUrl, "supplier-gallery", hero.path) : null;
  const description = supplierDescription(supplierResp.data);

  return {
    title: `${supplierResp.data.business_name} | Eventwow`,
    description,
    imageUrl: absoluteImageUrl(heroUrl),
    url: absoluteUrl(`/suppliers/${supplierResp.data.slug}`),
    path: `/suppliers/${supplierResp.data.slug}`,
    type: "website",
  };
}

export function isSocialCrawler(userAgent = "") {
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(String(userAgent || "")));
}

export function resolveOgTarget(pathname = "/") {
  const path = String(pathname || "/").split("?")[0] || "/";
  if (path === "/" || path === "") return { type: "home" };
  const venueMatch = path.match(/^\/venues\/([^/?#]+)/i);
  if (venueMatch) return { type: "venue", slug: decodeURIComponent(venueMatch[1]) };
  const supplierMatch = path.match(/^\/suppliers\/([^/?#]+)/i);
  if (supplierMatch) return { type: "supplier", slug: decodeURIComponent(supplierMatch[1]) };
  return null;
}

export async function getOgPayload(type, slug) {
  if (type === "venue" && slug) {
    const venue = await fetchVenuePayload(slug);
    if (venue) return venue;
    return {
      title: "Venue | Eventwow",
      description: "Explore this venue and request quotes from trusted suppliers.",
      imageUrl: DEFAULT_OG_IMAGE,
      url: absoluteUrl(`/venues/${encodeURIComponent(String(slug || ""))}`),
      path: `/venues/${encodeURIComponent(String(slug || ""))}`,
      type: "website",
    };
  }

  if (type === "supplier" && slug) {
    const supplier = await fetchSupplierPayload(slug);
    if (supplier) return supplier;
    return {
      title: "Supplier | Eventwow",
      description: "View supplier profile and request a quote on Eventwow.",
      imageUrl: DEFAULT_OG_IMAGE,
      url: absoluteUrl(`/suppliers/${encodeURIComponent(String(slug || ""))}`),
      path: `/suppliers/${encodeURIComponent(String(slug || ""))}`,
      type: "website",
    };
  }

  return {
    title: DEFAULT_HOME_TITLE,
    description: DEFAULT_HOME_DESCRIPTION,
    imageUrl: DEFAULT_OG_IMAGE,
    url: absoluteUrl("/"),
    path: "/",
    type: "website",
  };
}

export function renderOgHtml({ title, description, imageUrl, url, type = "website", path = "/" }) {
  const safeTitle = escapeHtml(title || DEFAULT_HOME_TITLE);
  const safeDescription = escapeHtml(description || DEFAULT_HOME_DESCRIPTION);
  const safeImage = escapeHtml(absoluteImageUrl(imageUrl));
  const safeUrl = escapeHtml(url || absoluteUrl(path));
  const safePath = escapeHtml(path || "/");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <link rel="canonical" href="${safeUrl}" />
    <meta name="description" content="${safeDescription}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:type" content="${escapeHtml(type)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta http-equiv="refresh" content="0; url=${safeUrl}" />
  </head>
  <body style="font-family:Arial,sans-serif;padding:24px;background:#f6f7fb;color:#0f172a;">
    <p>Redirecting to <a href="${safeUrl}">${safePath}</a>…</p>
  </body>
</html>`;
}
