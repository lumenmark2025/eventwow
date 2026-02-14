import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { parseBody } from "./_lib/venues.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const body = parseBody(req);
    const venueId = String(body?.venueId || "").trim();
    const supplierIds = Array.isArray(body?.supplierIds) ? body.supplierIds.map((x) => String(x).trim()).filter(Boolean) : [];

    if (!venueId) return res.status(400).json({ ok: false, error: "Bad request", details: "venueId is required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const venueResp = await admin.from("venues").select("id").eq("id", venueId).maybeSingle();
    if (venueResp.error) return res.status(500).json({ ok: false, error: "Venue lookup failed", details: venueResp.error.message });
    if (!venueResp.data) return res.status(404).json({ ok: false, error: "Venue not found" });

    if (supplierIds.length > 0) {
      const suppliersResp = await admin.from("suppliers").select("id").in("id", supplierIds);
      if (suppliersResp.error) return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: suppliersResp.error.message });
      if ((suppliersResp.data || []).length !== supplierIds.length) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "One or more supplierIds are invalid" });
      }
    }

    const delResp = await admin.from("venue_suppliers_link").delete().eq("venue_id", venueId);
    if (delResp.error) return res.status(500).json({ ok: false, error: "Failed to update linked suppliers", details: delResp.error.message });

    if (supplierIds.length > 0) {
      const rows = supplierIds.map((supplierId) => ({ venue_id: venueId, supplier_id: supplierId }));
      const insResp = await admin.from("venue_suppliers_link").insert(rows);
      if (insResp.error) return res.status(500).json({ ok: false, error: "Failed to update linked suppliers", details: insResp.error.message });
    }

    return res.status(200).json({ ok: true, supplierIds });
  } catch (err) {
    console.error("admin-venue-set-linked-suppliers crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

