import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveAuthMe } from "./authMe.js";

function safe(value) {
  return String(value || "").trim();
}

function linkSecret() {
  return (
    process.env.BOOKING_LINK_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "eventwow-booking-link-secret"
  );
}

export function normalizeBookingPatch(payload = {}) {
  const patch = {};

  if (payload.status !== undefined) {
    patch.status = safe(payload.status).toLowerCase();
  }
  if (payload.value_gross !== undefined) patch.value_gross = payload.value_gross === null ? null : Number(payload.value_gross);
  if (payload.deposit_amount !== undefined) patch.deposit_amount = payload.deposit_amount === null ? null : Number(payload.deposit_amount);
  if (payload.balance_amount !== undefined) patch.balance_amount = payload.balance_amount === null ? null : Number(payload.balance_amount);
  if (payload.supplier_notes !== undefined) patch.supplier_notes = safe(payload.supplier_notes) || null;
  if (payload.start_time !== undefined) patch.start_time = safe(payload.start_time) || null;
  if (payload.end_time !== undefined) patch.end_time = safe(payload.end_time) || null;
  if (payload.location_text !== undefined) patch.location_text = safe(payload.location_text) || null;
  if (payload.customer_name !== undefined) patch.customer_name = safe(payload.customer_name) || null;
  if (payload.customer_email !== undefined) patch.customer_email = safe(payload.customer_email) || null;
  if (payload.customer_phone !== undefined) patch.customer_phone = safe(payload.customer_phone) || null;
  if (payload.guest_count !== undefined) patch.guest_count = payload.guest_count === null ? null : Number(payload.guest_count);
  if (payload.source_id !== undefined) patch.source_id = safe(payload.source_id) || null;
  if (payload.source_name !== undefined) patch.source_name = safe(payload.source_name) || null;
  if (payload.message_thread_id !== undefined) patch.message_thread_id = safe(payload.message_thread_id) || null;

  if (payload.is_deposit_paid !== undefined) {
    const next = !!payload.is_deposit_paid;
    patch.is_deposit_paid = next;
    patch.deposit_paid_at = next ? new Date().toISOString() : null;
  }
  if (payload.is_balance_paid !== undefined) {
    const next = !!payload.is_balance_paid;
    patch.is_balance_paid = next;
    patch.balance_paid_at = next ? new Date().toISOString() : null;
  }

  patch.updated_at = new Date().toISOString();
  return patch;
}

export function tokenFromLinkId(linkId) {
  return crypto.createHmac("sha256", linkSecret()).update(String(linkId || "")).digest("base64url");
}

export function hashAccessToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function tokenHashFromLinkId(linkId) {
  return hashAccessToken(tokenFromLinkId(linkId));
}

export function buildShareUrl(req, token) {
  const production = String(process.env.VERCEL_ENV || "").toLowerCase() === "production";
  const host = production
    ? "eventwow.co.uk"
    : (req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000");
  const proto = production ? "https" : (req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https"));
  return `${proto}://${host}/booking-access?t=${encodeURIComponent(token)}`;
}

export async function ensureBookingAccessLink({ admin, req, bookingId, createdByUserId = null, invalidateLegacy = true }) {
  const activeResp = await admin
    .from("booking_access_links")
    .select("id,booking_id,token_hash,revoked_at,created_at")
    .eq("booking_id", bookingId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (activeResp.error) {
    throw new Error(`Failed to load access link: ${activeResp.error.message}`);
  }

  if (activeResp.data) {
    const link = activeResp.data;
    const expectedHash = tokenHashFromLinkId(link.id);
    if (!invalidateLegacy || link.token_hash === expectedHash) {
      const token = tokenFromLinkId(link.id);
      return { linkId: link.id, token, url: buildShareUrl(req, token) };
    }

    await admin
      .from("booking_access_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", link.id)
      .is("revoked_at", null);
  }

  const linkId = crypto.randomUUID();
  const token = tokenFromLinkId(linkId);
  const tokenHash = hashAccessToken(token);

  const insertResp = await admin
    .from("booking_access_links")
    .insert([
      {
        id: linkId,
        booking_id: bookingId,
        token_hash: tokenHash,
        created_by_user_id: createdByUserId,
        expires_at: null,
      },
    ])
    .select("id")
    .single();

  if (insertResp.error) {
    throw new Error(`Failed to create access link: ${insertResp.error.message}`);
  }

  return { linkId, token, url: buildShareUrl(req, token) };
}

export async function revokeActiveBookingAccessLinks({ admin, bookingId }) {
  const now = new Date().toISOString();
  const resp = await admin
    .from("booking_access_links")
    .update({ revoked_at: now })
    .eq("booking_id", bookingId)
    .is("revoked_at", null)
    .select("id");

  if (resp.error) {
    throw new Error(`Failed to revoke access links: ${resp.error.message}`);
  }
  return resp.data || [];
}

export async function requireSupplierContext(req) {
  const me = await resolveAuthMe(req);
  if (!me.ok) {
    return { ok: false, code: me.code, error: me.error, details: me.details };
  }
  if (me.data.role !== "supplier" || !me.data.supplier_id) {
    return { ok: false, code: 403, error: "Forbidden (supplier only)" };
  }

  const admin = createClient(me.supabaseUrl, me.serviceKey, { auth: { persistSession: false } });
  return {
    ok: true,
    admin,
    userId: me.data.user_id,
    supplierId: me.data.supplier_id,
  };
}

export function toSourceDto(row) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    name: row.name,
    is_default: !!row.is_default,
    is_active: !!row.is_active,
    created_at: row.created_at,
  };
}

export function toBookingDto(row) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    origin_type: row.origin_type,
    source_id: row.source_id,
    source_name: row.source_name,
    event_date: row.event_date,
    start_time: row.start_time,
    end_time: row.end_time,
    location_text: row.location_text,
    venue_id: row.venue_id,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    customer_phone: row.customer_phone,
    guest_count: row.guest_count,
    value_gross: row.value_gross,
    deposit_amount: row.deposit_amount,
    balance_amount: row.balance_amount,
    is_deposit_paid: !!row.is_deposit_paid,
    deposit_paid_at: row.deposit_paid_at,
    is_balance_paid: !!row.is_balance_paid,
    balance_paid_at: row.balance_paid_at,
    status: row.status,
    supplier_notes: row.supplier_notes,
    enquiry_id: row.enquiry_id,
    quote_id: row.quote_id,
    message_thread_id: row.message_thread_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
