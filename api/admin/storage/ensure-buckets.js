import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";
import {
  SUPPLIER_IMAGES_BUCKET,
  VENUE_IMAGES_BUCKET,
  ensureBucketExists,
} from "../../_lib/storageBuckets.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const venueBucket = await ensureBucketExists(admin, VENUE_IMAGES_BUCKET, { public: true });
    if (!venueBucket.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to ensure venue images bucket",
        details: venueBucket.error,
      });
    }

    const supplierBucket = await ensureBucketExists(admin, SUPPLIER_IMAGES_BUCKET, { public: true });
    if (!supplierBucket.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to ensure supplier images bucket",
        details: supplierBucket.error,
      });
    }

    return res.status(200).json({
      ok: true,
      buckets: {
        [VENUE_IMAGES_BUCKET]: { created: venueBucket.created },
        [SUPPLIER_IMAGES_BUCKET]: { created: supplierBucket.created },
      },
    });
  } catch (err) {
    console.error("admin storage ensure buckets crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
