import { createClient } from "@supabase/supabase-js";
import { loadFeaturedCategoriesWithHero } from "../../_lib/publicCategories.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: "Missing server env vars" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const rows = await loadFeaturedCategoriesWithHero(admin, SUPABASE_URL);
    return res.status(200).json(rows);
  } catch (err) {
    console.error("public/categories crashed:", err);
    return res.status(500).json({ error: "Internal Server Error", details: String(err?.message || err) });
  }
}
