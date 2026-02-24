import { requireAdmin } from "../_lib/adminAuth.js";
import { handleAdminCategoriesIndex } from "../../src/server/admin/handlers/categories.js";
import { getAdminEnquiryById, listAdminEnquiries } from "../../src/server/admin/handlers/enquiries.js";
import { ensureAdminStorageBuckets, listAdminRankingContexts } from "../../src/server/admin/handlers/misc.js";
import { patchAdminReviewById, listAdminReviews } from "../../src/server/admin/handlers/reviews.js";
import { getVenueHeroImageJobPreview, runVenueHeroImageGenerationJob } from "../../src/server/admin/handlers/venueHeroImages.js";

function getPathString(req) {
  const parts = Array.isArray(req.query?.path) ? req.query.path : req.query?.path ? [req.query.path] : [];
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join("/");
}

export default async function handler(req, res) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });
    }

    const path = getPathString(req);
    const method = String(req.method || "GET").toUpperCase();

    if (method === "GET" && path === "enquiries") {
      return listAdminEnquiries(req, res, auth);
    }
    if (method === "GET" && path.startsWith("enquiries/")) {
      req.query.id = path.slice("enquiries/".length);
      return getAdminEnquiryById(req, res);
    }

    if (method === "GET" && path === "reviews") {
      return listAdminReviews(req, res);
    }
    if (method === "PATCH" && path.startsWith("reviews/")) {
      req.query.id = path.slice("reviews/".length);
      return patchAdminReviewById(req, res);
    }

    if ((method === "GET" || method === "POST") && path === "categories") {
      return handleAdminCategoriesIndex(req, res);
    }

    if (method === "GET" && path === "ranking-contexts") {
      return listAdminRankingContexts(req, res);
    }

    if (method === "POST" && path === "storage/ensure-buckets") {
      return ensureAdminStorageBuckets(req, res);
    }
    if (method === "GET" && path === "venues/generate-hero-images") {
      return getVenueHeroImageJobPreview(req, res);
    }
    if (method === "POST" && path === "venues/generate-hero-images") {
      return runVenueHeroImageGenerationJob(req, res);
    }

    return res.status(404).json({ ok: false, error: "Not Found" });
  } catch (err) {
    console.error("admin catch-all crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
