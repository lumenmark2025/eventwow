import {
  ensureBookingAccessLink,
  normalizeBookingPatch,
  requireSupplierContext,
  toBookingDto,
} from "../../_lib/supplierBookings.js";

function safe(value) {
  return String(value || "").trim();
}

function isValidStatus(status) {
  return ["draft", "confirmed", "cancelled", "completed"].includes(String(status || "").toLowerCase());
}

function isNonNegativeNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(safe(value));
}

function buildLocationLabel(row) {
  const venue = row?.venues || null;
  const venueName = safe(venue?.name);
  const venueArea = safe(venue?.location_label) || safe(venue?.address);
  if (venueName) return venueArea ? `${venueName} - ${venueArea}` : venueName;
  return safe(row?.location_text) || "Location not provided";
}

function toBookingListDto(row) {
  return {
    id: row.id,
    origin_type: row.origin_type,
    event_date: row.event_date,
    start_time: row.start_time,
    customer_name: row.customer_name || null,
    guest_count: row.guest_count,
    status: row.status,
    source_id: row.source_id || null,
    source_name: row.source_name || null,
    value_gross: row.value_gross,
    deposit_amount: row.deposit_amount,
    balance_amount: row.balance_amount,
    is_deposit_paid: !!row.is_deposit_paid,
    deposit_paid_at: row.deposit_paid_at,
    is_balance_paid: !!row.is_balance_paid,
    balance_paid_at: row.balance_paid_at,
    location_label: buildLocationLabel(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export default async function handler(req, res) {
  try {
    const ctx = await requireSupplierContext(req);
    if (!ctx.ok) return res.status(ctx.code).json({ ok: false, error: ctx.error, details: ctx.details });

    if (req.method === "GET") {
      const query = ctx.admin
        .from("supplier_bookings")
        .select("id,origin_type,event_date,start_time,location_text,customer_name,guest_count,status,source_id,source_name,value_gross,deposit_amount,balance_amount,is_deposit_paid,deposit_paid_at,is_balance_paid,balance_paid_at,created_at,updated_at,venues(name,location_label,address)")
        .eq("supplier_id", ctx.supplierId)
        .order("event_date", { ascending: true })
        .order("created_at", { ascending: false });

      const origin = safe(req.query?.origin).toLowerCase();
      const from = safe(req.query?.from);
      const to = safe(req.query?.to);
      const status = safe(req.query?.status).toLowerCase();

      if (origin === "eventwow" || origin === "external") query.eq("origin_type", origin);
      if (from) query.gte("event_date", from);
      if (to) query.lte("event_date", to);
      if (status && isValidStatus(status)) query.eq("status", status);

      const rowsResp = await query.limit(300);
      if (rowsResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to load bookings", details: rowsResp.error.message });
      }
      return res.status(200).json({ ok: true, rows: (rowsResp.data || []).map(toBookingListDto) });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");

    const eventDate = safe(body?.event_date);
    if (!eventDate || !isValidDate(eventDate)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "event_date must be YYYY-MM-DD" });
    }

    const originType = "external";

    const status = safe(body?.status || "confirmed").toLowerCase() || "confirmed";
    if (!isValidStatus(status)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid status" });
    }

    if (body?.enquiry_id || body?.quote_id || body?.venue_id || body?.message_thread_id) {
      return res.status(400).json({
        ok: false,
        error: "Bad request",
        details: "External booking create cannot set enquiry_id, quote_id, venue_id, or message_thread_id",
      });
    }

    let sourceId = safe(body?.source_id) || null;
    let sourceName = safe(body?.source_name) || null;
    if (sourceId) {
      const srcResp = await ctx.admin
        .from("supplier_booking_sources")
        .select("id,name")
        .eq("id", sourceId)
        .eq("supplier_id", ctx.supplierId)
        .maybeSingle();
      if (srcResp.error || !srcResp.data) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid source_id" });
      }
      if (!sourceName) sourceName = srcResp.data.name;
    }

    const insert = normalizeBookingPatch(body);
    const guestCount = body?.guest_count === undefined || body?.guest_count === null ? null : Number(body.guest_count);
    if (guestCount !== null && (!Number.isInteger(guestCount) || guestCount < 0)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "guest_count must be a non-negative integer" });
    }
    for (const [field, value] of [
      ["value_gross", body?.value_gross],
      ["deposit_amount", body?.deposit_amount],
      ["balance_amount", body?.balance_amount],
    ]) {
      if (value !== undefined && value !== null && !isNonNegativeNumber(value)) {
        return res.status(400).json({ ok: false, error: "Bad request", details: `${field} must be >= 0` });
      }
    }

    const row = {
      supplier_id: ctx.supplierId,
      origin_type: originType,
      source_id: sourceId,
      source_name: sourceName,
      event_date: eventDate,
      status,
      start_time: safe(body?.start_time) || null,
      end_time: safe(body?.end_time) || null,
      location_text: safe(body?.location_text) || null,
      venue_id: null,
      customer_name: safe(body?.customer_name) || null,
      customer_email: safe(body?.customer_email) || null,
      customer_phone: safe(body?.customer_phone) || null,
      guest_count: guestCount,
      value_gross: body?.value_gross === undefined || body?.value_gross === null ? null : Number(body.value_gross),
      deposit_amount: body?.deposit_amount === undefined || body?.deposit_amount === null ? null : Number(body.deposit_amount),
      balance_amount: body?.balance_amount === undefined || body?.balance_amount === null ? null : Number(body.balance_amount),
      is_deposit_paid: insert.is_deposit_paid === undefined ? false : insert.is_deposit_paid,
      deposit_paid_at: insert.deposit_paid_at || null,
      is_balance_paid: insert.is_balance_paid === undefined ? false : insert.is_balance_paid,
      balance_paid_at: insert.balance_paid_at || null,
      supplier_notes: safe(body?.supplier_notes) || null,
      enquiry_id: null,
      quote_id: null,
      message_thread_id: null,
      updated_at: new Date().toISOString(),
    };

    const createResp = await ctx.admin
      .from("supplier_bookings")
      .insert([row])
      .select("*")
      .single();

    if (createResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to create booking", details: createResp.error.message });
    }

    const link = await ensureBookingAccessLink({
      admin: ctx.admin,
      req,
      bookingId: createResp.data.id,
      createdByUserId: ctx.userId,
      invalidateLegacy: true,
    });

    return res.status(200).json({
      ok: true,
      row: toBookingDto(createResp.data),
      customer_share_url: link.url,
    });
  } catch (err) {
    console.error("supplier bookings index crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
