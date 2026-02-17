import {
  requireSupplierContext,
  revokeActiveBookingAccessLinks,
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
      .select("id")
      .eq("id", bookingId)
      .eq("supplier_id", ctx.supplierId)
      .maybeSingle();

    if (bookingResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to validate booking", details: bookingResp.error.message });
    }
    if (!bookingResp.data) return res.status(404).json({ ok: false, error: "Booking not found" });

    const revoked = await revokeActiveBookingAccessLinks({ admin: ctx.admin, bookingId });

    return res.status(200).json({ ok: true, revoked_count: revoked.length });
  } catch (err) {
    console.error("supplier revoke booking access link crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
