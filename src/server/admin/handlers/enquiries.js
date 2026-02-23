import { getAdminClient } from "./shared.js";

function requestId() {
  return Math.random().toString(36).slice(2, 10);
}

function hostFromUrl(value) {
  try {
    return new URL(String(value || "")).hostname || null;
  } catch {
    return null;
  }
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

export async function listAdminEnquiries(req, res, auth) {
  const rid = requestId();
  const endpoint = "admin/enquiries/index";
  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error, request_id: rid });
  }

  const { admin, SUPABASE_URL } = client;
  const status = String(req.query?.status || "").trim().toLowerCase() || null;
  const q = String(req.query?.q || "").trim() || null;
  const days = req.query?.days ? toInt(req.query.days, null) : null;
  const page = toInt(req.query?.page || 1, 1);
  const pageSize = Math.min(toInt(req.query?.pageSize || 100, 100), 500);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const queryMeta = { status, q, days, page, pageSize };

  let query = admin
    .from("enquiries")
    .select("id,event_date,event_postcode,status,match_source,created_at,customers(full_name),venues(name)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (q) {
    query = query.or(`event_postcode.ilike.%${q}%,customer_name.ilike.%${q}%`);
  }

  if (days && days > 0) {
    const dt = new Date();
    dt.setDate(dt.getDate() - days);
    query = query.gte("created_at", dt.toISOString());
  }

  const response = await query.range(from, to);
  if (response.error) {
    console.error("[admin-enquiries]", {
      request_id: rid,
      endpoint,
      admin_user_id: auth.userId || null,
      supabase_host: hostFromUrl(SUPABASE_URL),
      filters: queryMeta,
      rowcount: 0,
      error_code: response.error.code || null,
      error_message: response.error.message,
    });
    return res.status(500).json({
      ok: false,
      error: "Failed to load enquiries",
      details: response.error.message,
      request_id: rid,
    });
  }

  const rows = response.data || [];
  return res.status(200).json({
    ok: true,
    rows,
    total: Number(response.count || 0),
    page,
    pageSize,
    request_id: rid,
  });
}

export async function getAdminEnquiryById(req, res) {
  const id = String(req.query?.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing enquiry id" });

  const client = getAdminClient();
  if (!client.ok) {
    return res.status(client.code).json({ ok: false, error: client.error });
  }

  const { admin } = client;
  const enquiryResp = await admin
    .from("enquiries")
    .select(
      "id,status,match_source,event_type,enquiry_category_slug,event_date,start_time,event_postcode,guest_count,budget_range,budget_amount,budget_unit,venue_known,venue_name,venue_postcode,indoor_outdoor,power_available,dietary_requirements,contact_preference,urgency,message,message_quality_score,message_quality_flags,structured_answers,source_page,created_at,customers(full_name,email,phone),venues(name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (enquiryResp.error) {
    return res.status(500).json({ ok: false, error: "Failed to load enquiry", details: enquiryResp.error.message });
  }
  if (!enquiryResp.data) {
    return res.status(404).json({ ok: false, error: "Enquiry not found" });
  }

  const invitesResp = await admin
    .from("enquiry_suppliers")
    .select("id,supplier_id,supplier_status,invited_at,viewed_at,responded_at,declined_reason,suppliers(business_name)")
    .eq("enquiry_id", id)
    .order("invited_at", { ascending: true });

  if (invitesResp.error) {
    return res.status(500).json({ ok: false, error: "Failed to load invites", details: invitesResp.error.message });
  }

  return res.status(200).json({
    ok: true,
    enquiry: enquiryResp.data,
    invites: invitesResp.data || [],
  });
}

