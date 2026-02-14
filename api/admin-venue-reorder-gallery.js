import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { parseBody } from "./_lib/venues.js";

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
    const venueId = String(body?.venueId || "").trim();
    const orderedImageIds = Array.isArray(body?.orderedImageIds) ? body.orderedImageIds.map((x) => String(x).trim()).filter(Boolean) : [];

    if (!venueId || orderedImageIds.length === 0) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "venueId and orderedImageIds are required" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const listResp = await admin
      .from("venue_images")
      .select("id")
      .eq("venue_id", venueId)
      .eq("type", "gallery")
      .in("id", orderedImageIds);

    if (listResp.error) return res.status(500).json({ ok: false, error: "Failed to validate gallery images", details: listResp.error.message });
    if ((listResp.data || []).length !== orderedImageIds.length) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "One or more images are invalid for this venue" });
    }

    for (let i = 0; i < orderedImageIds.length; i += 1) {
      const id = orderedImageIds[i];
      await admin
        .from("venue_images")
        .update({ sort_order: i + 1 })
        .eq("id", id)
        .eq("venue_id", venueId)
        .eq("type", "gallery");
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("admin-venue-reorder-gallery crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

