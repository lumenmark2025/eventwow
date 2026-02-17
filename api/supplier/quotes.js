import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
} from "../message-utils.js";

function safe(value) {
  return String(value || "").trim();
}

function buildLocation(enquiry) {
  const venue = enquiry?.venues || null;
  const venueName = safe(venue?.name) || safe(enquiry?.venue_name);
  const venueArea = safe(venue?.location_label) || safe(venue?.address) || safe(enquiry?.venue_postcode) || safe(enquiry?.event_postcode);

  if (venueName) {
    return venueArea ? `${venueName} — ${venueArea}` : venueName;
  }

  const freeText = safe(enquiry?.location_label) || safe(enquiry?.event_postcode);
  if (freeText) return freeText;

  return "Location not provided";
}

function toQuoteListDto(row) {
  const enquiry = row?.enquiries || {};
  const customerName =
    safe(enquiry?.customers?.full_name) || safe(enquiry?.customer_name) || "Unknown customer";
  const locationLabel = buildLocation(enquiry);

    const quote = {
      id: row.id,
      status: row.status || "draft",
      total: Number(row.total_amount || 0),
      currencyCode: String(row.currency_code || "GBP").toUpperCase(),
      createdAt: row.created_at || null,
      sentAt: row.sent_at || null,
      acceptedAt: row.accepted_at || null,
      declinedAt: row.declined_at || null,
      closedAt: row.closed_at || null,
      updatedAt: row.updated_at || null,
    };

  const enquirySummary = {
    id: enquiry.id || row.enquiry_id,
    eventDate: enquiry.event_date || null,
    startTime: enquiry.start_time || enquiry.event_time || null,
    guestCount: enquiry.guest_count ?? null,
    budget: {
      amount: enquiry.budget_amount === null || enquiry.budget_amount === undefined ? null : Number(enquiry.budget_amount),
      unit: safe(enquiry.budget_unit) || null,
      range: safe(enquiry.budget_range) || null,
    },
  };

  return {
    quote,
    enquiry: enquirySummary,
    customer: {
      name: customerName,
    },
    event_location_label: locationLabel,
    venue: enquiry?.venues
      ? {
          id: enquiry.venues.id || null,
          name: enquiry.venues.name || null,
          city: enquiry.venues.location_label || null,
          postcode: enquiry.venue_postcode || enquiry.event_postcode || null,
        }
      : null,
    // Backward-compatible top-level fields used by legacy SupplierQuotes list UI.
    id: quote.id,
    status: quote.status,
    total_amount: quote.total,
    currency_code: quote.currencyCode,
    enquiry_id: enquirySummary.id,
    created_at: quote.createdAt,
    sent_at: quote.sentAt,
    accepted_at: quote.acceptedAt,
    declined_at: quote.declinedAt,
    closed_at: quote.closedAt,
    updated_at: quote.updatedAt,
    enquiries: {
      event_date: enquirySummary.eventDate,
      start_time: enquirySummary.startTime,
      guest_count: enquirySummary.guestCount,
      location_label: locationLabel,
      customer_name: customerName,
      venues: enquiry?.venues
        ? {
            id: enquiry.venues.id || null,
            name: enquiry.venues.name || null,
            location_label: enquiry.venues.location_label || null,
          }
        : null,
    },
  };
}

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

    const query = admin
      .from("quotes")
      .select(
        "id,status,total_amount,currency_code,enquiry_id,created_at,sent_at,accepted_at,declined_at,closed_at,updated_at,enquiries(id,event_date,start_time,event_time,guest_count,budget_amount,budget_unit,budget_range,location_label,event_postcode,venue_name,venue_postcode,customer_name,customers(full_name),venues(id,name,location_label,address))"
      )
      .eq("supplier_id", supplierResp.data.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const status = safe(req.query?.status).toLowerCase();
    if (status) query.eq("status", status);

    const quotesResp = await query;
    if (quotesResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load quotes", details: quotesResp.error.message });
    }

    return res.status(200).json({
      ok: true,
      rows: (quotesResp.data || []).map(toQuoteListDto),
    });
  } catch (err) {
    console.error("supplier/quotes crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
