import { getAdminClient } from "./shared.js";

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

export async function listAdminReviews(req, res) {
  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error });
  }

  const { admin } = client;
  const status = String(req.query?.status || "pending").trim().toLowerCase();
  const limitRaw = Number(req.query?.limit ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 200;

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
}

export async function patchAdminReviewById(req, res) {
  const reviewId = String(req.query?.id || "").trim();
  if (!reviewId) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing review id" });

  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error });
  }

  const { admin } = client;
  const body = parseBody(req);
  const action = String(body?.action || "").trim().toLowerCase();

  if (action === "approve") {
    const { error } = await admin.from("supplier_reviews").update({ is_approved: true }).eq("id", reviewId);
    if (error) return res.status(500).json({ ok: false, error: "Failed to approve review", details: error.message });
    return res.status(200).json({ ok: true, status: "approved" });
  }

  if (action === "reject") {
    const { error } = await admin.from("supplier_reviews").delete().eq("id", reviewId);
    if (error) return res.status(500).json({ ok: false, error: "Failed to reject review", details: error.message });
    return res.status(200).json({ ok: true, status: "rejected" });
  }

  return res.status(400).json({ ok: false, error: "Bad request", details: "action must be 'approve' or 'reject'" });
}

