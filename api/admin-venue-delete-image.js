import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { parseBody } from "./_lib/venues.js";
import { VENUE_IMAGES_BUCKET } from "./_lib/storageBuckets.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

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

    const body = parseBody(req);
    const imageId = String(body?.imageId || "").trim();
    if (!imageId) return res.status(400).json({ ok: false, error: "Bad request", details: "imageId is required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const imageResp = await admin
      .from("venue_images")
      .select("id,path")
      .eq("id", imageId)
      .maybeSingle();
    if (imageResp.error) return res.status(500).json({ ok: false, error: "Failed to load image", details: imageResp.error.message });
    if (!imageResp.data) return res.status(404).json({ ok: false, error: "Image not found" });

    await admin.storage.from(VENUE_IMAGES_BUCKET).remove([imageResp.data.path]);
    const deleteResp = await admin.from("venue_images").delete().eq("id", imageId);
    if (deleteResp.error) return res.status(500).json({ ok: false, error: "Failed to delete image", details: deleteResp.error.message });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("admin-venue-delete-image crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
