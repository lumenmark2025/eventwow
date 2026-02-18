import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../../_lib/email.js";
import { supplierSignupMagicLinkEmail } from "../../_lib/emailTemplates.js";

const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_MAX_PER_IP = 8;
const signupRateMap = new Map();

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  return body || {};
}

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function rateLimitKey(req) {
  return getRequestIp(req);
}

function isRateLimited(req) {
  const key = rateLimitKey(req);
  const now = Date.now();
  const existing = signupRateMap.get(key) || [];
  const fresh = existing.filter((t) => now - t < SIGNUP_WINDOW_MS);
  if (fresh.length >= SIGNUP_MAX_PER_IP) {
    signupRateMap.set(key, fresh);
    return true;
  }
  fresh.push(now);
  signupRateMap.set(key, fresh);
  return false;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function sanitizeText(value, max = 300) {
  const text = String(value || "").trim();
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

  if (existing.error) return `${base}-${Math.random().toString(36).slice(2, 7)}`;
  const used = new Set((existing.data || []).map((row) => String(row.slug || "").toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i < 5000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function publicAppOrigin(req) {
  const explicit =
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    process.env.VITE_SITE_URL ||
    "";
  if (explicit) return String(explicit).replace(/\/+$/, "");

  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  if (!host) return "";
  const proto = String(req.headers["x-forwarded-proto"] || "").trim() || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function callbackUrl(req) {
  const origin = publicAppOrigin(req);
  if (!origin) return null;
  return `${origin}/auth/callback?returnTo=${encodeURIComponent("/suppliers/onboarding")}`;
}

function genericOk(res) {
  return res.status(200).json({
    ok: true,
    message: "If an account exists, we've emailed you a login link.",
  });
}

async function ensureSupplierRole(admin, userId) {
  const existingRole = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "supplier")
    .maybeSingle();
  if (!existingRole.error && !existingRole.data) {
    await admin.from("user_roles").insert({ user_id: userId, role: "supplier" });
  }

  const profileResp = await admin.from("user_profiles").select("role").eq("user_id", userId).maybeSingle();
  const currentRole = String(profileResp.data?.role || "").toLowerCase();
  if (currentRole !== "admin") {
    await admin.from("user_profiles").upsert(
      {
        user_id: userId,
        role: "supplier",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }
}

async function ensureSignupBonus(admin, supplierId) {
  const alreadyResp = await admin
    .from("credits_ledger")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("reason", "signup_bonus")
    .limit(1)
    .maybeSingle();

  if (alreadyResp.error) {
    return { ok: false, error: alreadyResp.error.message };
  }
  if (alreadyResp.data?.id) return { ok: true, awarded: false };

  const applyResp = await admin.rpc("apply_credit_delta", {
    p_supplier_id: supplierId,
    p_delta: 25,
    p_reason: "signup_bonus",
    p_note: "Signup bonus: 25 free credits",
    p_related_type: "supplier_signup",
    p_related_id: supplierId,
    p_created_by_user: null,
  });

  if (applyResp.error) {
    const msg = String(applyResp.error.message || "");
    if (msg.includes("duplicate key")) return { ok: true, awarded: false };
    return { ok: false, error: msg };
  }

  await admin.from("suppliers").update({ launch_credits_awarded_at: new Date().toISOString() }).eq("id", supplierId);

  const creditTxn = await admin.from("credit_transactions").insert([
    {
      supplier_id: supplierId,
      change: 25,
      reason: "Signup bonus: 25 free credits",
      created_by_name: "System",
    },
  ]);
  if (creditTxn.error) {
    console.warn("public suppliers/signup credit_transactions insert failed:", creditTxn.error.message);
  }

  return { ok: true, awarded: true };
}

async function sendSupplierMagicLink(admin, req, email, businessName) {
  const redirectTo = callbackUrl(req);
  if (!redirectTo) return;

  const magicResp = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (magicResp.error) {
    console.warn("public suppliers/signup generateLink failed:", magicResp.error.message);
    return;
  }

  const actionLink =
    magicResp.data?.properties?.action_link ||
    magicResp.data?.action_link ||
    `${publicAppOrigin(req) || "https://eventwow.co.uk"}/login`;

  const template = supplierSignupMagicLinkEmail({
    businessName,
    actionUrl: actionLink,
  });
  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    eventKey: "supplier_signup_magic_link",
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    if (isRateLimited(req)) {
      return res.status(429).json({
        ok: false,
        error: "Too many requests",
        details: "Please wait before trying again.",
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    const body = parseBody(req);
    const email = normalizeEmail(body.email);
    const businessName = sanitizeText(body.business_name || body.businessName, 180);
    const locationLabel = sanitizeText(body.location_label || body.locationLabel, 120);
    const phone = sanitizeText(body.phone, 50);
    const websiteUrl = sanitizeText(body.website_url || body.websiteUrl, 300);

    if (!email || !isValidEmail(email)) return res.status(400).json({ ok: false, error: "Valid email is required" });
    if (!businessName) return res.status(400).json({ ok: false, error: "Business name is required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const existingUserResp = await admin.rpc("find_auth_user_by_email", { p_email: email });
    if (existingUserResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to check existing account", details: existingUserResp.error.message });
    }

    if (existingUserResp.data) {
      await sendSupplierMagicLink(admin, req, email, businessName);
      return genericOk(res);
    }

    const createdUser = await admin.auth.admin.createUser({
      email,
      password: crypto.randomBytes(24).toString("hex"),
      email_confirm: false,
    });
    if (createdUser.error || !createdUser.data?.user?.id) {
      return res.status(500).json({
        ok: false,
        error: "Failed to create account",
        details: createdUser.error?.message || "Unknown auth create error",
      });
    }

    const userId = createdUser.data.user.id;
    await ensureSupplierRole(admin, userId);

    const slug = await resolveUniqueSlug(admin, toSlug(businessName));
    const supplierInsert = await admin
      .from("suppliers")
      .insert({
        auth_user_id: userId,
        business_name: businessName,
        slug,
        location_label: locationLabel,
        public_email: email,
        public_phone: phone,
        website_url: websiteUrl,
        is_published: false,
        is_verified: false,
        onboarding_status: "awaiting_email_verification",
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (supplierInsert.error) {
      return res.status(500).json({ ok: false, error: "Failed to create supplier profile", details: supplierInsert.error.message });
    }

    const bonusResp = await ensureSignupBonus(admin, supplierInsert.data.id);
    if (!bonusResp.ok) {
      return res.status(500).json({ ok: false, error: "Failed to grant signup bonus", details: bonusResp.error });
    }

    await sendSupplierMagicLink(admin, req, email, businessName);
    return genericOk(res);
  } catch (err) {
    console.error("public suppliers/signup crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

