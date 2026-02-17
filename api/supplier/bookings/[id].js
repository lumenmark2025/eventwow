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

function isValidDate(value) {
  if (value === null) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(safe(value));
}

function isNonNegativeNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "PATCH" && req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const ctx = await requireSupplierContext(req);
    if (!ctx.ok) return res.status(ctx.code).json({ ok: false, error: ctx.error, details: ctx.details });

    const id = safe(req.query?.id);
    if (!id) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing booking id" });

    if (req.method === "GET") {
      const detailResp = await ctx.admin
        .from("supplier_bookings")
        .select("*,venues(id,name,location_label,address)")
        .eq("id", id)
        .eq("supplier_id", ctx.supplierId)
        .maybeSingle();

      if (detailResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to load booking", details: detailResp.error.message });
      }
      if (!detailResp.data) {
        return res.status(404).json({ ok: false, error: "Booking not found" });
      }

      const venue = detailResp.data.venues;
      const locationLabel = venue?.name
        ? [venue.name, venue.location_label || venue.address].filter(Boolean).join(" - ")
        : (safe(detailResp.data.location_text) || "Location not provided");
      const link = await ensureBookingAccessLink({
        admin: ctx.admin,
        req,
        bookingId: detailResp.data.id,
        createdByUserId: ctx.userId,
        invalidateLegacy: true,
      });

      return res.status(200).json({
        ok: true,
        row: {
          ...toBookingDto(detailResp.data),
          location_label: locationLabel,
          customer_share_url: link.url,
          venue: venue
            ? {
                id: venue.id || null,
                name: venue.name || null,
                location_label: venue.location_label || null,
                address: venue.address || null,
              }
            : null,
        },
      });
    }

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");

    const currentResp = await ctx.admin
      .from("supplier_bookings")
      .select("id,supplier_id,origin_type")
      .eq("id", id)
      .eq("supplier_id", ctx.supplierId)
      .maybeSingle();

    if (currentResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load booking", details: currentResp.error.message });
    }
    if (!currentResp.data) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    const patch = normalizeBookingPatch(body);

    if (patch.status && !isValidStatus(patch.status)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid status" });
    }

    if (body?.event_date !== undefined) {
      if (!isValidDate(body.event_date)) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "event_date must be YYYY-MM-DD" });
      }
      patch.event_date = safe(body.event_date) || null;
    }

    if (body?.source_id !== undefined) {
      const sourceId = safe(body.source_id) || null;
      patch.source_id = sourceId;
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
        if (!patch.source_name) patch.source_name = srcResp.data.name;
      } else {
        patch.source_name = null;
      }
    }

    if (body?.start_time !== undefined) patch.start_time = safe(body.start_time) || null;
    if (body?.end_time !== undefined) patch.end_time = safe(body.end_time) || null;
    if (body?.location_text !== undefined) patch.location_text = safe(body.location_text) || null;
    if (body?.customer_name !== undefined) patch.customer_name = safe(body.customer_name) || null;
    if (body?.customer_email !== undefined) patch.customer_email = safe(body.customer_email) || null;
    if (body?.customer_phone !== undefined) patch.customer_phone = safe(body.customer_phone) || null;

    if (body?.guest_count !== undefined) {
      if (body.guest_count === null || body.guest_count === "") {
        patch.guest_count = null;
      } else {
        const nextGuestCount = Number(body.guest_count);
        if (!Number.isInteger(nextGuestCount) || nextGuestCount < 0) {
          return res.status(400).json({ ok: false, error: "Bad request", details: "guest_count must be a non-negative integer" });
        }
        patch.guest_count = nextGuestCount;
      }
    }

    for (const [field, value] of [
      ["value_gross", body?.value_gross],
      ["deposit_amount", body?.deposit_amount],
      ["balance_amount", body?.balance_amount],
    ]) {
      if (value === undefined) continue;
      if (value === null || value === "") {
        patch[field] = null;
        continue;
      }
      if (!isNonNegativeNumber(value)) {
        return res.status(400).json({ ok: false, error: "Bad request", details: `${field} must be >= 0` });
      }
      patch[field] = Number(value);
    }

    if (body?.supplier_notes !== undefined) patch.supplier_notes = safe(body.supplier_notes) || null;

    const isEventwow = String(currentResp.data.origin_type || "").toLowerCase() === "eventwow";
    if (isEventwow) {
      const blockedEventwowFields = [
        "event_date",
        "start_time",
        "end_time",
        "location_text",
        "customer_name",
        "customer_email",
        "customer_phone",
        "guest_count",
        "source_id",
        "source_name",
        "value_gross",
        "deposit_amount",
        "balance_amount",
        "message_thread_id",
      ];
      const attempted = blockedEventwowFields.filter((key) => body?.[key] !== undefined);
      if (attempted.length > 0) {
        return res.status(400).json({
          ok: false,
          error: "Bad request",
          details: "Eventwow bookings only allow status, payment flags, and supplier notes updates",
        });
      }
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "No fields to update" });
    }

    const updateResp = await ctx.admin
      .from("supplier_bookings")
      .update(patch)
      .eq("id", id)
      .eq("supplier_id", ctx.supplierId)
      .select("*")
      .maybeSingle();

    if (updateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to update booking", details: updateResp.error.message });
    }
    if (!updateResp.data) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    return res.status(200).json({ ok: true, row: toBookingDto(updateResp.data) });
  } catch (err) {
    console.error("supplier booking patch crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
