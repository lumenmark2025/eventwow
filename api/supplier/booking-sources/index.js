import { requireSupplierContext, toSourceDto } from "../../_lib/supplierBookings.js";

export default async function handler(req, res) {
  try {
    const ctx = await requireSupplierContext(req);
    if (!ctx.ok) return res.status(ctx.code).json({ ok: false, error: ctx.error, details: ctx.details });

    if (req.method === "GET") {
      await ctx.admin.rpc("ensure_supplier_booking_sources", { p_supplier_id: ctx.supplierId });

      const listResp = await ctx.admin
        .from("supplier_booking_sources")
        .select("id,supplier_id,name,is_default,is_active,created_at")
        .eq("supplier_id", ctx.supplierId)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (listResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to load booking sources", details: listResp.error.message });
      }

      return res.status(200).json({ ok: true, rows: (listResp.data || []).map(toSourceDto) });
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      const name = String(body?.name || "").trim();
      const isActive = body?.is_active === undefined ? true : !!body.is_active;
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "name must be 2-60 chars" });
      }

      const dupeResp = await ctx.admin
        .from("supplier_booking_sources")
        .select("id")
        .eq("supplier_id", ctx.supplierId)
        .ilike("name", name)
        .maybeSingle();

      if (dupeResp.error && dupeResp.error.code !== "PGRST116") {
        return res.status(500).json({ ok: false, error: "Failed to validate source", details: dupeResp.error.message });
      }
      if (dupeResp.data?.id) {
        return res.status(409).json({ ok: false, error: "Source already exists" });
      }

      const insertResp = await ctx.admin
        .from("supplier_booking_sources")
        .insert([{ supplier_id: ctx.supplierId, name, is_default: false, is_active: isActive }])
        .select("id,supplier_id,name,is_default,is_active,created_at")
        .single();

      if (insertResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to create source", details: insertResp.error.message });
      }

      return res.status(200).json({ ok: true, row: toSourceDto(insertResp.data) });
    }

    if (req.method === "PUT") {
      await ctx.admin.rpc("ensure_supplier_booking_sources", { p_supplier_id: ctx.supplierId });
      const listResp = await ctx.admin
        .from("supplier_booking_sources")
        .select("id,supplier_id,name,is_default,is_active,created_at")
        .eq("supplier_id", ctx.supplierId)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (listResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to ensure defaults", details: listResp.error.message });
      }

      return res.status(200).json({ ok: true, rows: (listResp.data || []).map(toSourceDto) });
    }

    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  } catch (err) {
    console.error("supplier booking-sources crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
