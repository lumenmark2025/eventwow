import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import { VENUE_IMAGES_BUCKET } from "../../../_lib/storageBuckets.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "DELETE") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const venueId = String(req.query?.id || "").trim();
    if (!venueId) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing draft id" });

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

    const venueResp = await admin
      .from("venues")
      .select("id,is_published,listed_publicly")
      .eq("id", venueId)
      .maybeSingle();
    if (venueResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load draft", details: venueResp.error.message });
    }
    if (!venueResp.data) {
      return res.status(404).json({ ok: false, error: "Draft not found" });
    }

    const isPublished = !!(venueResp.data.is_published ?? venueResp.data.listed_publicly);
    if (isPublished) {
      return res.status(409).json({ ok: false, error: "Cannot delete published venue", details: "Only unpublished drafts can be deleted" });
    }

    const imagesResp = await admin
      .from("venue_images")
      .select("path")
      .eq("venue_id", venueId);
    if (imagesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load draft images", details: imagesResp.error.message });
    }

    const objectPaths = (imagesResp.data || [])
      .map((row) => String(row.path || "").trim())
      .filter(Boolean);

    if (objectPaths.length > 0) {
      const removeResp = await admin.storage.from(VENUE_IMAGES_BUCKET).remove(objectPaths);
      if (removeResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to remove draft images from storage", details: removeResp.error.message });
      }
    }

    const deleteResp = await admin.from("venues").delete().eq("id", venueId);
    if (deleteResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to delete draft", details: deleteResp.error.message });
    }

    return res.status(200).json({ ok: true, id: venueId });
  } catch (err) {
    console.error("admin venue draft delete crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
