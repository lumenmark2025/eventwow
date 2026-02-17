import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../../_lib/requireUser.js";

function trimText(value, max = 4000) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function normalizeCategories(values, allowed) {
  const map = new Map((allowed || []).map((v) => [v.toLowerCase(), v]));
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const canonical = map.get(name.toLowerCase());
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
    if (out.length >= 12) break;
  }
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireUser(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });
    if (!auth.emailConfirmedAt) {
      return res.status(403).json({ ok: false, error: "Verify your email before completing onboarding" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }
    body = body || {};

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const supplierResp = await admin
      .from("suppliers")
      .select("id,onboarding_status,status")
      .eq("auth_user_id", auth.userId)
      .maybeSingle();

    if (supplierResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier", details: supplierResp.error.message });
    }
    if (!supplierResp.data?.id) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const categoryResp = await admin
      .from("supplier_category_options")
      .select("display_name,label,is_active")
      .eq("is_active", true)
      .order("display_name", { ascending: true });
    if (categoryResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load categories", details: categoryResp.error.message });
    }

    const allowedCategories = (categoryResp.data || [])
      .map((row) => String(row.display_name || row.label || "").trim())
      .filter(Boolean);

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, "business_name") || Object.prototype.hasOwnProperty.call(body, "businessName")) {
      patch.business_name = trimText(body.business_name ?? body.businessName, 180);
    }
    if (Object.prototype.hasOwnProperty.call(body, "contact_email") || Object.prototype.hasOwnProperty.call(body, "contactEmail")) {
      patch.public_email = normalizeEmail(body.contact_email ?? body.contactEmail);
    }
    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      patch.public_phone = trimText(body.phone, 50);
    }
    if (Object.prototype.hasOwnProperty.call(body, "location") || Object.prototype.hasOwnProperty.call(body, "service_area") || Object.prototype.hasOwnProperty.call(body, "serviceArea")) {
      patch.location_label = trimText(body.location ?? body.service_area ?? body.serviceArea, 120);
    }
    if (Object.prototype.hasOwnProperty.call(body, "short_description") || Object.prototype.hasOwnProperty.call(body, "shortDescription")) {
      patch.short_description = trimText(body.short_description ?? body.shortDescription, 160);
    }
    if (Object.prototype.hasOwnProperty.call(body, "about") || Object.prototype.hasOwnProperty.call(body, "description")) {
      const about = trimText(body.about ?? body.description, 4000);
      patch.about = about;
      patch.description = about;
    }
    if (Object.prototype.hasOwnProperty.call(body, "website_url") || Object.prototype.hasOwnProperty.call(body, "websiteUrl")) {
      patch.website_url = trimText(body.website_url ?? body.websiteUrl, 300);
    }
    if (Object.prototype.hasOwnProperty.call(body, "instagram_url") || Object.prototype.hasOwnProperty.call(body, "instagramUrl")) {
      patch.instagram_url = trimText(body.instagram_url ?? body.instagramUrl, 300);
    }
    if (Object.prototype.hasOwnProperty.call(body, "categories")) {
      patch.listing_categories = normalizeCategories(body.categories, allowedCategories);
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: "No editable fields provided" });
    }

    patch.onboarding_status = ["awaiting_email_verification", "draft"].includes(String(supplierResp.data.onboarding_status || "").toLowerCase())
      ? "profile_incomplete"
      : (supplierResp.data.onboarding_status || "profile_incomplete");
    patch.status = String(supplierResp.data.status || "").toLowerCase() === "rejected" ? "draft" : (supplierResp.data.status || "draft");

    const updateResp = await admin
      .from("suppliers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", supplierResp.data.id)
      .eq("auth_user_id", auth.userId)
      .select("id,slug,business_name,public_email,public_phone,location_label,listing_categories,short_description,about,description,website_url,instagram_url,onboarding_status,status,submitted_at,approved_at,rejected_at,admin_notes,is_published,credits_balance,created_at,updated_at")
      .single();

    if (updateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to update supplier", details: updateResp.error.message });
    }

    return res.status(200).json({ ok: true, supplier: updateResp.data });
  } catch (err) {
    console.error("suppliers/me/update crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
