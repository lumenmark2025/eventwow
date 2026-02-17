import { ensureThreadForQuote } from "../message-utils.js";
import { ensureBookingAccessLink } from "./supplierBookings.js";

function safe(value) {
  return String(value || "").trim();
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildLocationText(enquiry, venue) {
  const venueName = safe(venue?.name) || safe(enquiry?.venue_name);
  const venueArea = safe(venue?.location_label) || safe(venue?.address) || safe(enquiry?.venue_postcode) || safe(enquiry?.event_postcode);
  if (venueName) return venueArea ? `${venueName} - ${venueArea}` : venueName;
  return safe(enquiry?.location_label) || safe(enquiry?.event_postcode) || "Location not provided";
}

export async function upsertEventwowBookingFromAcceptedQuote({ admin, req, quoteId }) {
  const quoteResp = await admin
    .from("quotes")
    .select("id,supplier_id,enquiry_id,total_amount,currency_code,status")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteResp.error) {
    throw new Error(`Quote lookup failed: ${quoteResp.error.message}`);
  }
  if (!quoteResp.data) {
    throw new Error("Quote not found");
  }

  const quote = quoteResp.data;
  if (String(quote.status || "").toLowerCase() !== "accepted") {
    return { booking: null, customerShareUrl: null };
  }

  const enquiryResp = quote.enquiry_id
    ? await admin
        .from("enquiries")
        .select("id,venue_id,event_date,start_time,event_time,end_time,guest_count,location_label,event_postcode,venue_name,venue_postcode,customer_name,customer_id,customers(full_name,email,phone),venues(id,name,location_label,address)")
        .eq("id", quote.enquiry_id)
        .maybeSingle()
    : { data: null, error: null };

  if (enquiryResp.error) {
    throw new Error(`Enquiry lookup failed: ${enquiryResp.error.message}`);
  }

  const enquiry = enquiryResp.data || null;
  const venue = enquiry?.venues || null;
  const customer = enquiry?.customers || null;

  const threadResult = await ensureThreadForQuote(admin, quote, quote.supplier_id);
  if (threadResult.error || !threadResult.thread) {
    throw new Error(`Thread ensure failed: ${threadResult.error?.message || "Unknown error"}`);
  }

  const mapped = {
    supplier_id: quote.supplier_id,
    origin_type: "eventwow",
    source_id: null,
    source_name: "Eventwow",
    event_date: enquiry?.event_date || new Date().toISOString().slice(0, 10),
    start_time: enquiry?.start_time || enquiry?.event_time || null,
    end_time: enquiry?.end_time || null,
    location_text: buildLocationText(enquiry, venue),
    venue_id: enquiry?.venue_id || venue?.id || null,
    customer_name: safe(enquiry?.customer_name) || safe(customer?.full_name) || null,
    customer_email: safe(customer?.email) || null,
    customer_phone: safe(customer?.phone) || null,
    guest_count: enquiry?.guest_count ?? null,
    value_gross: toNumberOrNull(quote.total_amount),
    status: "confirmed",
    enquiry_id: quote.enquiry_id || null,
    quote_id: quote.id,
    message_thread_id: threadResult.thread.id,
    updated_at: new Date().toISOString(),
  };

  const existingResp = await admin
    .from("supplier_bookings")
    .select("id")
    .eq("quote_id", quote.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingResp.error && existingResp.error.code !== "PGRST116") {
    throw new Error(`Booking lookup failed: ${existingResp.error.message}`);
  }

  let booking = null;
  if (existingResp.data?.id) {
    const updateResp = await admin
      .from("supplier_bookings")
      .update(mapped)
      .eq("id", existingResp.data.id)
      .select("*")
      .single();

    if (updateResp.error) {
      throw new Error(`Booking update failed: ${updateResp.error.message}`);
    }
    booking = updateResp.data;
  } else {
    const insertPayload = {
      ...mapped,
      deposit_amount: null,
      balance_amount: null,
      is_deposit_paid: false,
      deposit_paid_at: null,
      is_balance_paid: false,
      balance_paid_at: null,
      supplier_notes: null,
    };

    const insertResp = await admin
      .from("supplier_bookings")
      .insert([insertPayload])
      .select("*")
      .single();

    if (insertResp.error) {
      if (insertResp.error.code === "23505") {
        const retryResp = await admin
          .from("supplier_bookings")
          .select("*")
          .eq("quote_id", quote.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (retryResp.error || !retryResp.data) {
          throw new Error(`Booking insert retry failed: ${retryResp.error?.message || "not found"}`);
        }
        booking = retryResp.data;
      } else {
        throw new Error(`Booking insert failed: ${insertResp.error.message}`);
      }
    } else {
      booking = insertResp.data;
    }
  }

  const ensuredLink = await ensureBookingAccessLink({
    admin,
    req,
    bookingId: booking.id,
    createdByUserId: null,
    invalidateLegacy: true,
  });

  return {
    booking,
    customerShareUrl: ensuredLink.url,
  };
}
