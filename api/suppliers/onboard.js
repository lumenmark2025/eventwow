import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../_lib/requireUser.js";

function trimText(value, max = 4000) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function resolveUniqueSlug(admin, baseSlug) {
  const base = baseSlug || `supplier-${Date.now()}`;
  const existing = await admin
    .from("suppliers")
    .select("slug")
    .ilike("slug", `${base}%`)
    .limit(200);

  if (existing.error) return `${base}-${Math.random().toString(36).slice(2, 6)}`;
  const used = new Set((existing.data || []).map((row) => String(row.slug || "").toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i < 5000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function normalizeCategories(values, allowed) {
  const allowedByLower = new Map(allowed.map((v) => [v.toLowerCase(), v]));
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const canonical = allowedByLower.get(name.toLowerCase());
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireUser(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });
    if (!auth.emailConfirmedAt) {
      return res.status(403).json({ ok: false, error: "Verify your email before onboarding submission" });
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

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }
    body = body || {};

    const businessName = trimText(body.business_name ?? body.businessName, 180);
    const contactName = trimText(body.contact_name ?? body.contactName, 120);
    const contactEmail = normalizeEmail(body.contact_email ?? body.contactEmail ?? auth.userEmail);
    const phone = trimText(body.phone, 50);
    const serviceArea = trimText(body.location ?? body.service_area ?? body.serviceArea, 120);
    const shortDescription = trimText(body.short_description ?? body.shortDescription, 160);
    const about = trimText(body.about ?? body.description, 4000);
    const websiteUrl = trimText(body.website_url ?? body.websiteUrl, 300);
    const instagramUrl = trimText(body.instagram_url ?? body.instagramUrl, 300);
    const termsConfirmed = Boolean(body.confirm_terms ?? body.confirmTerms);

    if (!businessName) return res.status(400).json({ ok: false, error: "Business name is required" });
    if (!contactName) return res.status(400).json({ ok: false, error: "Contact name is required" });
    if (!contactEmail || !isValidEmail(contactEmail)) return res.status(400).json({ ok: false, error: "Valid contact email is required" });
    if (!termsConfirmed) return res.status(400).json({ ok: false, error: "Please confirm terms and accuracy" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const existing = await admin
      .from("suppliers")
      .select("id,status,is_published")
      .eq("auth_user_id", auth.userId)
      .maybeSingle();
    if (existing.error) {
      return res.status(500).json({ ok: false, error: "Failed to check supplier linkage", details: existing.error.message });
    }
    if (existing.data?.id) {
      return res.status(409).json({ ok: false, error: "Supplier already exists for this account", supplier: existing.data });
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
    const listingCategories = normalizeCategories(body.categories, allowedCategories);
    if (listingCategories.length === 0) {
      return res.status(400).json({ ok: false, error: "Select at least one category" });
    }

    const slug = await resolveUniqueSlug(admin, toSlug(body.slug || businessName));

    const insertPayload = {
      auth_user_id: auth.userId,
      business_name: businessName,
      slug,
      description: about,
      short_description: shortDescription,
      about,
      public_email: contactEmail,
      public_phone: phone,
      location_label: serviceArea,
      listing_categories: listingCategories,
      website_url: websiteUrl,
      instagram_url: instagramUrl,
      is_published: false,
      onboarding_status: "pending_review",
      status: "pending_review",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const supplierInsert = await admin
      .from("suppliers")
      .insert(insertPayload)
      .select("id,slug,business_name,is_published,status,submitted_at,location_label,listing_categories,short_description,about,public_email,public_phone,website_url,instagram_url")
      .single();

    if (supplierInsert.error) {
      return res.status(500).json({ ok: false, error: "Failed to create supplier application", details: supplierInsert.error.message });
    }

    const profileResp = await admin.from("user_profiles").select("role").eq("user_id", auth.userId).maybeSingle();
    const currentRole = String(profileResp.data?.role || "").toLowerCase();
    if (currentRole !== "admin") {
      await admin.from("user_profiles").upsert({ user_id: auth.userId, role: "supplier", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    }

    return res.status(200).json({
      ok: true,
      supplier: supplierInsert.data,
    });
  } catch (err) {
    console.error("suppliers/onboard crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
