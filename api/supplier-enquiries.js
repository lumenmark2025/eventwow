import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
} from "./message-utils.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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
    const supplierId = supplierResp.data.id;

    const statusFilter = String(req.query?.status || "").trim().toLowerCase();
    const query = admin
      .from("enquiry_suppliers")
      .select(
        "id,enquiry_id,supplier_id,supplier_status,invited_at,viewed_at,responded_at,quote_id,declined_reason,enquiries(id,status,event_date,event_time,event_postcode,location_label,guest_count,category_label,notes,message,created_at)"
      )
      .eq("supplier_id", supplierId)
      .order("invited_at", { ascending: false });

    if (statusFilter) {
      query.eq("supplier_status", statusFilter);
    }

    const invitesResp = await query.limit(200);
    if (invitesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load enquiries",
        details: invitesResp.error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      rows: (invitesResp.data || []).map((row) => ({
        id: row.id,
        enquiryId: row.enquiry_id,
        status: row.supplier_status,
        invitedAt: row.invited_at,
        viewedAt: row.viewed_at,
        respondedAt: row.responded_at,
        quoteId: row.quote_id || null,
        declineReason: row.declined_reason || null,
        enquiry: row.enquiries
          ? {
              id: row.enquiries.id,
              status: row.enquiries.status,
              eventDate: row.enquiries.event_date,
              eventTime: row.enquiries.event_time,
              locationLabel: row.enquiries.location_label || row.enquiries.event_postcode || null,
              postcode: row.enquiries.event_postcode || null,
              guestCount: row.enquiries.guest_count,
              categoryLabel: row.enquiries.category_label || null,
              message: row.enquiries.message || row.enquiries.notes || null,
              createdAt: row.enquiries.created_at,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("supplier-enquiries crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
