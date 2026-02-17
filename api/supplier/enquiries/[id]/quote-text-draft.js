import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
} from "../../../message-utils.js";
import { buildSupplierEnquiryDto } from "../../../_lib/supplierEnquiryDto.js";

function buildDraftText(enquiry) {
  const customer = enquiry?.customerName || "there";
  const category = enquiry?.categoryLabel || "your event";
  const date = enquiry?.eventDate || "your requested date";
  const location = enquiry?.venue?.name || enquiry?.locationLabel || "your location";
  const message = enquiry?.message ? `\n\nNotes from your enquiry: ${enquiry.message}` : "";

  return `Hi ${customer},

Thanks for your enquiry for ${category} on ${date} at ${location}.

We can provide a tailored package including setup, service and clear timings to match your event requirements. The line items below show the pricing breakdown, and I can adjust options based on your preferences and budget.
${message}

If you'd like, I can refine this quote with any extra details before you decide.`;
}

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
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
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

    if (supplierResp.error || !supplierResp.data?.id) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const enquiryResp = await admin
      .from("enquiry_suppliers")
      .select(
        "enquiry_id,enquiries(id,event_date,start_time,event_time,event_postcode,location_label,guest_count,category_label,enquiry_category_slug,budget_range,budget_amount,budget_unit,venue_name,venue_postcode,customer_name,customer_email,message,notes,customers(full_name),venues(name,address,location_label))"
      )
      .eq("supplier_id", supplierResp.data.id)
      .eq("enquiry_id", enquiryId)
      .maybeSingle();

    if (enquiryResp.error || !enquiryResp.data?.enquiries) {
      return res.status(404).json({ ok: false, error: "Enquiry not found" });
    }

    const enquiry = buildSupplierEnquiryDto(enquiryResp.data.enquiries);
    return res.status(200).json({ ok: true, draftText: buildDraftText(enquiry) });
  } catch (err) {
    console.error("supplier quote text draft crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
