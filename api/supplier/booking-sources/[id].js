import { requireSupplierContext, toSourceDto } from "../../_lib/supplierBookings.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "PATCH") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const ctx = await requireSupplierContext(req);
    if (!ctx.ok) return res.status(ctx.code).json({ ok: false, error: ctx.error, details: ctx.details });

    const id = String(req.query?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing source id" });

    const currentResp = await ctx.admin
      .from("supplier_booking_sources")
      .select("id,supplier_id,name,is_default,is_active,created_at")
      .eq("id", id)
      .eq("supplier_id", ctx.supplierId)
      .maybeSingle();

    if (currentResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load source", details: currentResp.error.message });
    }
    if (!currentResp.data) return res.status(404).json({ ok: false, error: "Source not found" });

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");

    const patch = {};
    if (body?.name !== undefined) {
      if (currentResp.data.is_default) {
        return res.status(400).json({ ok: false, error: "Default sources cannot be renamed" });
      }
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "name must be 2-60 chars" });
      }

      const dupeResp = await ctx.admin
        .from("supplier_booking_sources")
        .select("id")
        .eq("supplier_id", ctx.supplierId)
        .ilike("name", name)
        .neq("id", id)
        .maybeSingle();

      if (dupeResp.error && dupeResp.error.code !== "PGRST116") {
        return res.status(500).json({ ok: false, error: "Failed to validate source", details: dupeResp.error.message });
      }
      if (dupeResp.data?.id) {
        return res.status(409).json({ ok: false, error: "Source already exists" });
      }
      patch.name = name;
    }
    if (body?.is_active !== undefined) patch.is_active = !!body.is_active;

    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "No fields to update" });
    }

    const updateResp = await ctx.admin
      .from("supplier_booking_sources")
      .update(patch)
      .eq("id", id)
      .eq("supplier_id", ctx.supplierId)
      .select("id,supplier_id,name,is_default,is_active,created_at")
      .maybeSingle();

    if (updateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to update source", details: updateResp.error.message });
    }
    if (!updateResp.data) return res.status(404).json({ ok: false, error: "Source not found" });

    return res.status(200).json({ ok: true, row: toSourceDto(updateResp.data) });
  } catch (err) {
    console.error("supplier booking-source patch crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
