import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const status = String(req.query?.status || "pending").trim().toLowerCase();
    const limitRaw = Number(req.query?.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 200;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let query = admin
      .from("supplier_reviews")
      .select("id,supplier_id,enquiry_id,rating,review_text,reviewer_name,is_approved,created_at,suppliers!supplier_reviews_supplier_id_fkey(business_name,slug)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status === "pending") query = query.eq("is_approved", false);
    if (status === "approved") query = query.eq("is_approved", true);

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ ok: false, error: "Failed to load reviews", details: error.message });
    }

    const rows = (data || []).map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.business_name || "Supplier",
      supplierSlug: row.suppliers?.slug || null,
      enquiryId: row.enquiry_id || null,
      rating: Number(row.rating || 0),
      reviewText: row.review_text || "",
      reviewerName: row.reviewer_name || "",
      isApproved: !!row.is_approved,
      createdAt: row.created_at || null,
    }));

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    console.error("admin/reviews GET crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
