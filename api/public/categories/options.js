import { createClient } from "@supabase/supabase-js";

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
    const resp = await admin
      .from("supplier_category_options")
      .select("slug,display_name,label,is_active")
      .eq("is_active", true)
      .order("display_name", { ascending: true });

    if (resp.error) {
      return res.status(500).json({ error: "Failed to load categories", details: resp.error.message });
    }

    const rows = (resp.data || [])
      .map((row) => ({
        slug: String(row.slug || "").trim(),
        display_name: String(row.display_name || row.label || "").trim(),
      }))
      .filter((row) => row.slug && row.display_name);

    return res.status(200).json(rows);
  } catch (err) {
    console.error("public/categories/options crashed:", err);
    return res.status(500).json({ error: "Internal Server Error", details: String(err?.message || err) });
  }
}
