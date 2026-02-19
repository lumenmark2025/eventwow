import { createClient } from "@supabase/supabase-js";

const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_MAX_PER_IP = 8;
const signupRateMap = new Map();

function requestId() {
  return Math.random().toString(36).slice(2, 10);
}

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

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function isRateLimited(req) {
  const key = getRequestIp(req);
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

function randomHex(bytes = 24) {
  const n = Math.max(8, Number(bytes || 24));
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    const arr = new Uint8Array(n);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr).map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  while (out.length < n * 2) out += Math.random().toString(16).slice(2);
  return out.slice(0, n * 2);
}

function appOrigin(req) {
  const explicit = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || process.env.VITE_SITE_URL || "";
  if (explicit) return String(explicit).replace(/\/+$/, "");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  if (!host) return "";
  const proto = String(req.headers["x-forwarded-proto"] || "").trim() || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function callbackUrl(req) {
  const origin = appOrigin(req);
  if (!origin) return null;
  return `${origin}/auth/callback?returnTo=${encodeURIComponent("/suppliers/onboarding")}`;
}

function genericOk(res, extras = {}) {
  return res.status(200).json({
    ok: true,
    message: "If an account exists, we've emailed you a login link.",
    ...extras,
  });
}

async function ensureSupplierRole(admin, userId) {
  const roleResp = await admin.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "supplier").maybeSingle();
  if (!roleResp.error && !roleResp.data) {
    await admin.from("user_roles").insert({ user_id: userId, role: "supplier" });
  }

  const profileResp = await admin.from("user_profiles").select("role").eq("user_id", userId).maybeSingle();
  const current = String(profileResp.data?.role || "").toLowerCase();
  if (current !== "admin") {
    await admin.from("user_profiles").upsert(
      { user_id: userId, role: "supplier", updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }
}

async function resolveUniqueSlug(admin, baseSlug) {
  const base = baseSlug || `supplier-${Date.now()}`;
  const existing = await admin.from("suppliers").select("slug").ilike("slug", `${base}%`).limit(200);
  if (existing.error) return `${base}-${Math.random().toString(36).slice(2, 7)}`;
  const used = new Set((existing.data || []).map((row) => String(row.slug || "").toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i < 5000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function ensureSignupBonus(admin, supplierId) {
  const existing = await admin
    .from("credits_ledger")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("reason", "signup_bonus")
    .limit(1)
    .maybeSingle();

  if (existing.error) return { ok: false, error: existing.error.message };
  if (existing.data?.id) return { ok: true, awarded: false };

  const rpc = await admin.rpc("apply_credit_delta", {
    p_supplier_id: supplierId,
    p_delta: 25,
    p_reason: "signup_bonus",
    p_note: "Signup bonus: 25 free credits",
    p_related_type: "supplier_signup",
    p_related_id: supplierId,
    p_created_by_user: null,
  });
  if (rpc.error) {
    const msg = String(rpc.error.message || "");
    if (msg.includes("duplicate key")) return { ok: true, awarded: false };
    return { ok: false, error: msg };
  }

  await admin.from("suppliers").update({ launch_credits_awarded_at: new Date().toISOString() }).eq("id", supplierId);
  await admin.from("credit_transactions").insert([
    { supplier_id: supplierId, change: 25, reason: "Signup bonus: 25 free credits", created_by_name: "System" },
  ]);

  return { ok: true, awarded: true };
}

async function sendMagicLink(admin, req, email, businessName, rid) {
  const redirectTo = callbackUrl(req);
  if (!redirectTo) return;

  const linkResp = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (linkResp.error) {
    console.warn("[supplier-signup]", {
      request_id: rid,
      stage: "generate_link",
      error: linkResp.error.message,
    });
    return;
  }

  try {
    const [{ supplierSignupMagicLinkEmail }, { sendEmail }] = await Promise.all([
      import("../../_lib/emailTemplates.js"),
      import("../../_lib/email.js"),
    ]);

    const actionLink =
      linkResp.data?.properties?.action_link ||
      linkResp.data?.action_link ||
      `${appOrigin(req) || "https://eventwow.co.uk"}/login`;

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
  } catch (err) {
    console.warn("[supplier-signup]", {
      request_id: rid,
      stage: "send_email",
      error: String(err?.message || err),
    });
  }
}

export default async function handler(req, res) {
  const rid = requestId();
  const endpoint = "public/suppliers/signup";

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed", request_id: rid });
    }

    if (isRateLimited(req)) {
      return res.status(429).json({ ok: false, error: "Too many requests", details: "Please wait before trying again.", request_id: rid });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error("[supplier-signup]", {
        request_id: rid,
        endpoint,
        stage: "env",
        has_supabase_url: !!SUPABASE_URL,
        has_service_role_key: !!SERVICE_KEY,
      });
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
        request_id: rid,
      });
    }

    const body = parseBody(req);
    const email = normalizeEmail(body.email);
    const businessName = sanitizeText(body.business_name || body.businessName, 180);
    const locationLabel = sanitizeText(body.location_label || body.locationLabel, 120);
    const phone = sanitizeText(body.phone, 50);
    const websiteUrl = sanitizeText(body.website_url || body.websiteUrl, 300);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "Valid email is required", request_id: rid });
    }
    if (!businessName) {
      return res.status(400).json({ ok: false, error: "Business name is required", request_id: rid });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const existingUser = await admin.rpc("find_auth_user_by_email", { p_email: email });
    if (existingUser.error) {
      console.error("[supplier-signup]", {
        request_id: rid,
        endpoint,
        stage: "find_auth_user_by_email",
        error_code: existingUser.error.code || null,
        error: existingUser.error.message,
      });
      return res.status(500).json({
        ok: false,
        error: "Failed to check existing account",
        details: existingUser.error.message,
        request_id: rid,
      });
    }

    let userId = existingUser.data || null;
    if (userId) {
      await sendMagicLink(admin, req, email, businessName, rid);
      return genericOk(res, {
        existing_account: true,
        message: "This email already has an account - please log in or reset your password. We have sent a sign-in link.",
      });
    }

    if (!userId) {
      const created = await admin.auth.admin.createUser({
        email,
        password: randomHex(24),
        email_confirm: false,
      });
      if (created.error || !created.data?.user?.id) {
        const details = created.error?.message || "Unknown auth create error";
        const lowered = details.toLowerCase();
        if (lowered.includes("already") || lowered.includes("registered") || lowered.includes("duplicate")) {
          await sendMagicLink(admin, req, email, businessName, rid);
          return genericOk(res, {
            existing_account: true,
            message: "This email already has an account - please log in or reset your password. We have sent a sign-in link.",
          });
        }
        console.error("[supplier-signup]", {
          request_id: rid,
          endpoint,
          stage: "create_auth_user",
          error_code: created.error?.code || null,
          error: details,
        });
        return res.status(500).json({ ok: false, error: "Failed to create account", details, request_id: rid });
      }
      userId = created.data.user.id;
    }

    await ensureSupplierRole(admin, userId);

    const existingSupplier = await admin.from("suppliers").select("id").eq("auth_user_id", userId).maybeSingle();
    let supplierId = existingSupplier.data?.id || null;
    if (!supplierId) {
      const slug = await resolveUniqueSlug(admin, toSlug(businessName));
      const inserted = await admin
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
      if (inserted.error || !inserted.data?.id) {
        const details = inserted.error?.message || "Insert failed";
        console.error("[supplier-signup]", {
          request_id: rid,
          endpoint,
          stage: "create_supplier_profile",
          error: details,
        });
        return res.status(500).json({ ok: false, error: "Failed to create supplier profile", details, request_id: rid });
      }
      supplierId = inserted.data.id;
    }

    const bonus = await ensureSignupBonus(admin, supplierId);
    if (!bonus.ok) {
      console.error("[supplier-signup]", {
        request_id: rid,
        endpoint,
        stage: "signup_bonus",
        error: bonus.error,
      });
      return res.status(500).json({ ok: false, error: "Failed to grant signup bonus", details: bonus.error, request_id: rid });
    }

    await sendMagicLink(admin, req, email, businessName, rid);
    return genericOk(res, { existing_account: false });
  } catch (err) {
    console.error("[supplier-signup]", {
      request_id: rid,
      endpoint,
      stage: "crash",
      error: String(err?.message || err),
    });
    return res.status(500).json({
      ok: false,
      error: "Internal Server Error",
      details: String(err?.message || err),
      request_id: rid,
    });
  }
}
