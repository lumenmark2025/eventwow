import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";
import { UUID_RE, parseBody } from "../../message-utils.js";

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
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    const body = parseBody(req);
    const supplierId = String(body?.supplierId || body?.supplier_id || "").trim();
    const adminNotes = String(body?.adminNotes || body?.admin_notes || "").trim() || null;
    if (!supplierId || !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Invalid supplierId" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const updateResp = await admin
      .from("suppliers")
      .update({
        onboarding_status: "rejected",
        status: "rejected",
        is_published: false,
        rejected_at: new Date().toISOString(),
        admin_notes: adminNotes,
        approved_at: null,
        approved_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplierId)
      .select("id,business_name,slug,onboarding_status,status,is_published,rejected_at,admin_notes")
      .maybeSingle();

    if (updateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to reject supplier", details: updateResp.error.message });
    }
    if (!updateResp.data) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    return res.status(200).json({ ok: true, supplier: updateResp.data });
  } catch (err) {
    console.error("admin/suppliers/reject crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
