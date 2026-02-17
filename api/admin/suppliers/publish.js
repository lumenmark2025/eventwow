import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";
import { UUID_RE, parseBody } from "../../message-utils.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ ok: false, error: "Missing server env vars" });

    const body = parseBody(req);
    const supplierId = String(body?.supplierId || body?.supplier_id || "").trim();
    const adminNote = String(body?.adminNotes || body?.admin_notes || "").trim() || null;
    if (!supplierId || !UUID_RE.test(supplierId)) return res.status(400).json({ ok: false, error: "Invalid supplierId" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const rpc = await admin.rpc("admin_approve_supplier_application", {
      p_supplier_id: supplierId,
      p_admin_user_id: auth.userId,
      p_admin_note: adminNote,
    });

    if (rpc.error) {
      const msg = String(rpc.error.message || "");
      const notFound = msg.includes("SUPPLIER_NOT_FOUND");
      return res.status(notFound ? 404 : 500).json({ ok: false, error: notFound ? "Supplier not found" : "Failed to publish supplier", details: msg });
    }

    const update = await admin
      .from("suppliers")
      .update({ onboarding_status: "approved", status: "approved", is_published: true, updated_at: new Date().toISOString() })
      .eq("id", supplierId)
      .select("id,business_name,slug,onboarding_status,status,is_published,approved_at,approved_by,launch_credits_awarded_at,credits_balance")
      .single();

    if (update.error) return res.status(500).json({ ok: false, error: "Published but failed to load supplier", details: update.error.message });

    return res.status(200).json({ ok: true, supplier: update.data });
  } catch (err) {
    console.error("admin/suppliers/publish crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
