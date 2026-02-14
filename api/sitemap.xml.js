import { createClient } from "@supabase/supabase-js";
import { toSlug } from "./_lib/ranking.js";

const BASE_URL = "https://eventwow.co.uk";

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildUrlset(urls) {
  const body = urls
    .map((url) => `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/xml; charset=utf-8");
      res.end(buildUrlset([`${BASE_URL}/`]));
      return;
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/xml; charset=utf-8");
      res.end(buildUrlset([`${BASE_URL}/`]));
      return;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("suppliers")
      .select("listing_categories,location_label,base_city,is_published")
      .eq("is_published", true)
      .limit(5000);

    if (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/xml; charset=utf-8");
      res.end(buildUrlset([`${BASE_URL}/`]));
      return;
    }

    const categoryCount = new Map();
    const locationCount = new Map();
    for (const row of data || []) {
      for (const c of Array.isArray(row.listing_categories) ? row.listing_categories : []) {
        const slug = toSlug(c);
        if (!slug) continue;
        categoryCount.set(slug, (categoryCount.get(slug) || 0) + 1);
      }
      const loc = toSlug(row.location_label || row.base_city);
      if (!loc) continue;
      locationCount.set(loc, (locationCount.get(loc) || 0) + 1);
    }

    const topCategories = [...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([slug]) => slug);
    const topLocations = [...locationCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([slug]) => slug);

    const urls = new Set([
      `${BASE_URL}/`,
      `${BASE_URL}/browse`,
      `${BASE_URL}/how-it-works`,
      `${BASE_URL}/pricing`,
      `${BASE_URL}/contact`,
      `${BASE_URL}/suppliers`,
      `${BASE_URL}/venues`,
    ]);

    for (const c of topCategories) urls.add(`${BASE_URL}/category/${c}`);
    for (const l of topLocations) urls.add(`${BASE_URL}/location/${l}`);
    for (const c of topCategories) {
      for (const l of topLocations) {
        urls.add(`${BASE_URL}/${c}-${l}`);
      }
    }

    res.statusCode = 200;
    res.setHeader("content-type", "application/xml; charset=utf-8");
    res.end(buildUrlset([...urls]));
  } catch {
    res.statusCode = 500;
    res.setHeader("content-type", "application/xml; charset=utf-8");
    res.end(buildUrlset([`${BASE_URL}/`]));
  }
}
