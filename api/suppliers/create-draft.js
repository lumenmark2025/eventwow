import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../_lib/requireUser.js";

function trimText(value, max = 4000) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function slugify(value) {
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
  const { data } = await admin.from("suppliers").select("slug").ilike("slug", `${base}%`).limit(300);
  const used = new Set((data || []).map((row) => String(row.slug || "").toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i <= 9999; i += 1) {
    const next = `${base}-${i}`;
    if (!used.has(next.toLowerCase())) return next;
  }
  return `${base}-${Date.now()}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const auth = await requireUser(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ ok: false, error: "Missing server env vars" });

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    }
    body = body || {};

    const businessName = trimText(body.business_name ?? body.businessName, 180);
    const phone = trimText(body.phone, 50);
    const contactEmail = normalizeEmail(body.contact_email ?? body.contactEmail ?? auth.userEmail);

    if (!businessName) return res.status(400).json({ ok: false, error: "Business name is required" });
    if (!contactEmail || !isValidEmail(contactEmail)) return res.status(400).json({ ok: false, error: "Valid contact email is required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const existing = await admin
      .from("suppliers")
      .select("id,auth_user_id,onboarding_status,status,is_published")
      .eq("auth_user_id", auth.userId)
      .maybeSingle();

    if (existing.error) return res.status(500).json({ ok: false, error: "Failed to check supplier", details: existing.error.message });

    if (existing.data?.id) {
      const patch = {
        business_name: businessName,
        public_phone: phone,
        public_email: contactEmail,
        onboarding_status: auth.emailConfirmedAt ? "profile_incomplete" : "awaiting_email_verification",
        status: auth.emailConfirmedAt ? "draft" : "draft",
        is_published: false,
        updated_at: new Date().toISOString(),
      };
      const update = await admin
        .from("suppliers")
        .update(patch)
        .eq("id", existing.data.id)
        .eq("auth_user_id", auth.userId)
        .select("id,slug,business_name,public_email,public_phone,onboarding_status,status,is_published")
        .single();
      if (update.error) return res.status(500).json({ ok: false, error: "Failed to update supplier draft", details: update.error.message });
      return res.status(200).json({ ok: true, supplier: update.data });
    }

    const slug = await resolveUniqueSlug(admin, slugify(body.slug || businessName));
    const insert = await admin
      .from("suppliers")
      .insert({
        auth_user_id: auth.userId,
        business_name: businessName,
        slug,
        public_email: contactEmail,
        public_phone: phone,
        onboarding_status: auth.emailConfirmedAt ? "profile_incomplete" : "awaiting_email_verification",
        status: "draft",
        is_published: false,
        updated_at: new Date().toISOString(),
      })
      .select("id,slug,business_name,public_email,public_phone,onboarding_status,status,is_published")
      .single();

    if (insert.error) return res.status(500).json({ ok: false, error: "Failed to create supplier draft", details: insert.error.message });

    const profileResp = await admin.from("user_profiles").select("role").eq("user_id", auth.userId).maybeSingle();
    const role = String(profileResp.data?.role || "").toLowerCase();
    if (role !== "admin") {
      await admin.from("user_profiles").upsert({ user_id: auth.userId, role: "supplier", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    }

    return res.status(200).json({ ok: true, supplier: insert.data });
  } catch (err) {
    console.error("suppliers/create-draft crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
