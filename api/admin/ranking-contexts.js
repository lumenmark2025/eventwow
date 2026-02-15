import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../_lib/adminAuth.js";
import { toSlug } from "../_lib/ranking.js";

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("suppliers")
      .select("listing_categories,location_label,base_city,is_published")
      .eq("is_published", true)
      .limit(3000);
    if (error) return res.status(500).json({ ok: false, error: "Failed to load contexts", details: error.message });

    const categorySet = new Set();
    const locationSet = new Set();
    for (const row of data || []) {
      for (const cat of Array.isArray(row.listing_categories) ? row.listing_categories : []) {
        const slug = toSlug(cat);
        if (slug) categorySet.add(slug);
      }
      const locA = toSlug(row.location_label);
      const locB = toSlug(row.base_city);
      if (locA) locationSet.add(locA);
      if (locB) locationSet.add(locB);
    }

    const categories = [...categorySet].sort((a, b) => a.localeCompare(b)).map((slug) => ({ slug, label: titleFromSlug(slug) }));
    const locations = [...locationSet].sort((a, b) => a.localeCompare(b)).map((slug) => ({ slug, label: titleFromSlug(slug) }));

    return res.status(200).json({ ok: true, categories, locations });
  } catch (err) {
    console.error("admin ranking contexts crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
