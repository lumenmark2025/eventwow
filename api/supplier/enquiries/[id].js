import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
} from "../../message-utils.js";
import { buildSupplierEnquiryDto } from "../../_lib/supplierEnquiryDto.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const enquiryId = String(req.query?.id || "").trim();
    if (!enquiryId) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing enquiry id" });
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
      .select(
        "id,enquiry_id,supplier_status,invited_at,viewed_at,responded_at,quote_id,declined_reason,enquiries(id,status,event_date,start_time,event_time,event_postcode,location_label,guest_count,category_label,enquiry_category_slug,budget_range,budget_amount,budget_unit,venue_name,venue_postcode,customer_name,customer_email,message,notes,created_at,customers(full_name),venues(name,address,location_label))"
      )
      .eq("supplier_id", supplierResp.data.id)
      .eq("enquiry_id", enquiryId)
      .maybeSingle();

    if (inviteResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load enquiry", details: inviteResp.error.message });
    }
    if (!inviteResp.data?.enquiries) {
      return res.status(404).json({ ok: false, error: "Enquiry not found" });
    }

    const enquiry = buildSupplierEnquiryDto(inviteResp.data.enquiries);

    return res.status(200).json({
      ok: true,
      enquiry,
      invite: {
        id: inviteResp.data.id,
        enquiryId: inviteResp.data.enquiry_id,
        status: inviteResp.data.supplier_status,
        invitedAt: inviteResp.data.invited_at,
        viewedAt: inviteResp.data.viewed_at,
        respondedAt: inviteResp.data.responded_at,
        quoteId: inviteResp.data.quote_id || null,
        declineReason: inviteResp.data.declined_reason || null,
      },
    });
  } catch (err) {
    console.error("supplier enquiry detail crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
