import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
  parseBody,
  UUID_RE,
} from "./message-utils.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const { SUPABASE_URL, SERVICE_KEY, ANON_KEY } = getEnv();
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const auth = await getAuthUserId(SUPABASE_URL, ANON_KEY, token);
    if (auth.error || !auth.userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: auth.error });
    }

    const body = parseBody(req);
    const enquiryId = String(body?.enquiryId || "").trim();
    if (!UUID_RE.test(enquiryId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid enquiryId" });
    }

    const admin = createAdminClient(SUPABASE_URL, SERVICE_KEY);
    const supplierResp = await admin
      .from("suppliers")
      .select("id")
      .eq("auth_user_id", auth.userId)
      .maybeSingle();

    if (supplierResp.error) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supplierResp.error.message });
    }
    if (!supplierResp.data?.id) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const inviteResp = await admin
      .from("enquiry_suppliers")
      .select("id,supplier_status")
      .eq("enquiry_id", enquiryId)
      .eq("supplier_id", supplierResp.data.id)
      .maybeSingle();

    if (inviteResp.error) {
      return res.status(500).json({ ok: false, error: "Invite lookup failed", details: inviteResp.error.message });
    }
    if (!inviteResp.data?.id) {
      return res.status(404).json({ ok: false, error: "Invite not found" });
    }

    const current = String(inviteResp.data.supplier_status || "").toLowerCase();
    if (["quoted", "accepted", "declined"].includes(current)) {
      if (current === "declined") return res.status(200).json({ ok: true, status: "declined" });
      return res.status(409).json({ ok: false, error: "Cannot decline enquiry", details: "Invite already resolved" });
    }

    const nowIso = new Date().toISOString();
    const declineResp = await admin
      .from("enquiry_suppliers")
      .update({
        supplier_status: "declined",
        responded_at: nowIso,
      })
      .eq("id", inviteResp.data.id)
      .eq("supplier_id", supplierResp.data.id)
      .select("id,supplier_status,responded_at")
      .single();

    if (declineResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to decline enquiry", details: declineResp.error.message });
    }

    return res.status(200).json({
      ok: true,
      row: {
        id: declineResp.data.id,
        status: declineResp.data.supplier_status,
        respondedAt: declineResp.data.responded_at,
      },
    });
  } catch (err) {
    console.error("supplier-decline-enquiry crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
