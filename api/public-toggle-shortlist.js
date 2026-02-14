import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  return body || {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

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
    const token = String(body?.token || "").trim();
    const supplierId = String(body?.supplierId || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();

    if (!token || !supplierId || !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid token or supplierId" });
    }

    if (!["add", "remove"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid action" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const enquiryResp = await admin
      .from("enquiries")
      .select("id")
      .eq("public_token", token)
      .maybeSingle();

    if (enquiryResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load enquiry", details: enquiryResp.error.message });
    }
    if (!enquiryResp.data) {
      return res.status(404).json({ ok: false, error: "Enquiry not found" });
    }

    const enquiryId = enquiryResp.data.id;
    const inviteResp = await admin
      .from("enquiry_suppliers")
      .select("id")
      .eq("enquiry_id", enquiryId)
      .eq("supplier_id", supplierId)
      .maybeSingle();

    if (inviteResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to validate supplier invite", details: inviteResp.error.message });
    }
    if (!inviteResp.data) {
      return res.status(404).json({ ok: false, error: "Supplier not found for this enquiry" });
    }

    if (action === "add") {
      const upsertResp = await admin
        .from("enquiry_shortlists")
        .upsert([{ enquiry_id: enquiryId, supplier_id: supplierId }], { onConflict: "enquiry_id,supplier_id" });

      if (upsertResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to update shortlist", details: upsertResp.error.message });
      }
    } else {
      const removeResp = await admin
        .from("enquiry_shortlists")
        .delete()
        .eq("enquiry_id", enquiryId)
        .eq("supplier_id", supplierId);

      if (removeResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to update shortlist", details: removeResp.error.message });
      }
    }

    const shortlistResp = await admin
      .from("enquiry_shortlists")
      .select("supplier_id")
      .eq("enquiry_id", enquiryId);

    if (shortlistResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load shortlist", details: shortlistResp.error.message });
    }

    return res.status(200).json({
      ok: true,
      shortlist: (shortlistResp.data || []).map((row) => row.supplier_id),
    });
  } catch (err) {
    console.error("public-toggle-shortlist crashed:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal Server Error",
      details: String(err?.message || err),
    });
  }
}
