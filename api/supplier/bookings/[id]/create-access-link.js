import {
  ensureBookingAccessLink,
  requireSupplierContext,
} from "../../../_lib/supplierBookings.js";

function safe(value) {
  return String(value || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const ctx = await requireSupplierContext(req);
    if (!ctx.ok) return res.status(ctx.code).json({ ok: false, error: ctx.error, details: ctx.details });

    const bookingId = safe(req.query?.id);
    if (!bookingId) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing booking id" });

    const bookingResp = await ctx.admin
      .from("supplier_bookings")
      .select("id,supplier_id")
      .eq("id", bookingId)
      .eq("supplier_id", ctx.supplierId)
      .maybeSingle();

    if (bookingResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to validate booking", details: bookingResp.error.message });
    }
    if (!bookingResp.data) return res.status(404).json({ ok: false, error: "Booking not found" });

    const link = await ensureBookingAccessLink({
      admin: ctx.admin,
      req,
      bookingId,
      createdByUserId: ctx.userId,
      invalidateLegacy: true,
    });

    return res.status(200).json({
      ok: true,
      url: link.url,
      share_url: link.url,
      access_link: {
        id: link.linkId,
        booking_id: bookingId,
      },
    });
  } catch (err) {
    console.error("supplier create booking access link crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
