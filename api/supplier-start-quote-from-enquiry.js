import { createClient } from "@supabase/supabase-js";
import { getBearerToken, parseBody, UUID_RE } from "./message-utils.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
        },
      });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const body = parseBody(req);
    const enquiryId = String(body?.enquiryId || "").trim();
    if (!UUID_RE.test(enquiryId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid enquiryId" });
    }

    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: userErr?.message });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const supplierResp = await admin.from("suppliers").select("id").eq("auth_user_id", userId).maybeSingle();
    if (supplierResp.error) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supplierResp.error.message });
    }
    if (!supplierResp.data?.id) return res.status(404).json({ ok: false, error: "Supplier not found" });

    const linkResp = await admin
      .from("enquiry_suppliers")
      .select("id")
      .eq("enquiry_id", enquiryId)
      .eq("supplier_id", supplierResp.data.id)
      .maybeSingle();

    if (linkResp.error) {
      return res.status(500).json({ ok: false, error: "Invite lookup failed", details: linkResp.error.message });
    }
    if (!linkResp.data?.id) {
      return res.status(403).json({ ok: false, error: "Forbidden (not linked to this enquiry)" });
    }

    const existingResp = await admin
      .from("quotes")
      .select("id,status")
      .eq("enquiry_id", enquiryId)
      .eq("supplier_id", supplierResp.data.id)
      .maybeSingle();

    if (existingResp.error) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: existingResp.error.message });
    }
    if (existingResp.data?.id) {
      await admin
        .from("enquiry_suppliers")
        .update({ quote_id: existingResp.data.id })
        .eq("enquiry_id", enquiryId)
        .eq("supplier_id", supplierResp.data.id);
      return res.status(200).json({ ok: true, existed: true, quoteId: existingResp.data.id, status: existingResp.data.status });
    }

    const createResp = await admin
      .from("quotes")
      .insert([
        {
          enquiry_id: enquiryId,
          supplier_id: supplierResp.data.id,
          status: "draft",
          total_amount: 0,
          total_price_gbp: 0,
          currency_code: "GBP",
          created_by_user_id: userId,
        },
      ])
      .select("id,status")
      .single();

    if (createResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to create quote", details: createResp.error.message });
    }

    await admin
      .from("enquiry_suppliers")
      .update({ quote_id: createResp.data.id })
      .eq("enquiry_id", enquiryId)
      .eq("supplier_id", supplierResp.data.id);

    return res.status(200).json({ ok: true, existed: false, quoteId: createResp.data.id, status: createResp.data.status });
  } catch (err) {
    console.error("supplier-start-quote-from-enquiry crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
