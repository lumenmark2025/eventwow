import { createClient } from "@supabase/supabase-js";

function parseBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function cleanText(value, maxLen) {
  const trimmed = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  return trimmed.slice(0, maxLen);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
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

    const body = parseBody(req);
    const supplierId = cleanText(body?.supplier_id, 64);
    const enquiryId = cleanText(body?.enquiry_id, 64) || null;
    const reviewerName = cleanText(body?.reviewer_name, 80);
    const reviewText = cleanText(body?.review_text, 2000);
    const ratingNum = Number(body?.rating);
    const rating = Number.isFinite(ratingNum) ? Math.round(ratingNum) : NaN;

    if (!supplierId) return res.status(400).json({ ok: false, error: "Bad request", details: "supplier_id is required" });
    if (!reviewerName) return res.status(400).json({ ok: false, error: "Bad request", details: "reviewer_name is required" });
    if (!reviewText) return res.status(400).json({ ok: false, error: "Bad request", details: "review_text is required" });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "rating must be an integer between 1 and 5" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const supplierResp = await admin.from("suppliers").select("id").eq("id", supplierId).maybeSingle();
    if (supplierResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to validate supplier", details: supplierResp.error.message });
    }
    if (!supplierResp.data) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const insertResp = await admin.from("supplier_reviews").insert([
      {
        supplier_id: supplierId,
        enquiry_id: enquiryId,
        rating,
        review_text: reviewText,
        reviewer_name: reviewerName,
        is_approved: false,
      },
    ]);

    if (insertResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to submit review", details: insertResp.error.message });
    }

    return res.status(200).json({
      ok: true,
      message: "Review submitted and pending moderation.",
    });
  } catch (err) {
    console.error("reviews/submit crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
