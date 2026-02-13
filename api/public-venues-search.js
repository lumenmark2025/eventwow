import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

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

    const q = String(req.query?.q || "").trim();
    if (q.length < 2) {
      return res.status(200).json({ ok: true, rows: [] });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const like = `%${q.replace(/[%_]/g, "").slice(0, 80)}%`;
    const { data, error } = await admin
      .from("venues")
      .select("id,name,city,postcode,is_published")
      .eq("is_published", true)
      .or(`name.ilike.${like},city.ilike.${like}`)
      .order("name", { ascending: true })
      .limit(8);

    if (error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to search venues",
        details: error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      rows: (data || []).map((v) => ({
        id: v.id,
        name: v.name,
        town: v.city || null,
        postcode: v.postcode || null,
      })),
    });
  } catch (err) {
    console.error("public-venues-search crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
