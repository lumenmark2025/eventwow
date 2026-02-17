import { createClient } from "@supabase/supabase-js";
import { hashAccessToken } from "../_lib/supplierBookings.js";

function safe(value) {
  return String(value || "").trim();
}

function normalizedEmail(value) {
  return safe(value).toLowerCase();
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch { return {}; }
  }
  return req.body;
}

function buildRedirectUrl(req, token) {
  const production = String(process.env.VERCEL_ENV || "").toLowerCase() === "production";
  const host = production
    ? "eventwow.co.uk"
    : (req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000");
  const proto = production ? "https" : (req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https"));
  return `${proto}://${host}/booking-access?t=${encodeURIComponent(token)}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    const body = parseBody(req);
    const token = safe(body?.token);
    const emailInput = normalizedEmail(body?.email);
    if (!token) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing token" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const publicClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

    const hash = hashAccessToken(token);

    const linkResp = await admin
      .from("booking_access_links")
      .select("id,booking_id,revoked_at")
      .eq("token_hash", hash)
      .maybeSingle();

    if (linkResp.error || !linkResp.data || linkResp.data.revoked_at) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    const bookingResp = await admin
      .from("supplier_bookings")
      .select("id,customer_email")
      .eq("id", linkResp.data.booking_id)
      .maybeSingle();

    if (bookingResp.error || !bookingResp.data) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    const bookingEmail = normalizedEmail(bookingResp.data.customer_email);
    if (!bookingEmail) {
      return res.status(400).json({ ok: false, error: "Customer email not set" });
    }

    if (emailInput && emailInput !== bookingEmail) {
      return res.status(400).json({ ok: false, error: "Email does not match this booking" });
    }

    const redirectTo = buildRedirectUrl(req, token);

    await publicClient.auth.signInWithOtp({
      email: bookingEmail,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });

    return res.status(200).json({ ok: true, message: "If the email matches, you will receive a sign-in link shortly." });
  } catch (err) {
    console.error("public booking-magic-link crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
