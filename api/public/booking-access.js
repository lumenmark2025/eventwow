import { createClient } from "@supabase/supabase-js";
import { hashAccessToken } from "../_lib/supplierBookings.js";

function safe(value) {
  return String(value || "").trim();
}

function maskEmail(email) {
  const raw = safe(email).toLowerCase();
  if (!raw.includes("@")) return "";
  const [local, domain] = raw.split("@");
  if (!local || !domain) return "";
  const first = local.slice(0, 1);
  const maskedLocal = `${first}${"*".repeat(Math.max(1, Math.min(6, local.length - 1)))}`;
  return `${maskedLocal}@${domain}`;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: "Missing server env vars" });
    }

    const token = safe(req.query?.t);
    if (!token) return res.status(404).json({ ok: false, error: "Booking not found" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const hash = hashAccessToken(token);

    const linkResp = await admin
      .from("booking_access_links")
      .select("id,booking_id,used_at,revoked_at")
      .eq("token_hash", hash)
      .maybeSingle();

    if (linkResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to validate link", details: linkResp.error.message });
    }
    if (!linkResp.data || linkResp.data.revoked_at) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    if (!linkResp.data.used_at) {
      await admin
        .from("booking_access_links")
        .update({ used_at: new Date().toISOString() })
        .eq("id", linkResp.data.id)
        .is("used_at", null);
    }

    const bookingResp = await admin
      .from("supplier_bookings")
      .select(
        "id,origin_type,event_date,start_time,end_time,location_text,guest_count,status,value_gross,deposit_amount,balance_amount,is_deposit_paid,deposit_paid_at,is_balance_paid,balance_paid_at,customer_name,customer_email,venue_id,quote_id,message_thread_id,venues(id,name,location_label,address),suppliers(id,business_name,slug,hero_image_url)"
      )
      .eq("id", linkResp.data.booking_id)
      .maybeSingle();

    if (bookingResp.error || !bookingResp.data) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    let quote = null;
    let quoteItems = [];
    let quotePublicToken = null;
    if (bookingResp.data.quote_id) {
      const [quoteResp, itemResp, quoteLinkResp] = await Promise.all([
        admin
          .from("quotes")
          .select("id,status,total_amount,currency_code,quote_text,sent_at,accepted_at,declined_at,closed_at")
          .eq("id", bookingResp.data.quote_id)
          .maybeSingle(),
        admin
          .from("quote_items")
          .select("id,title,qty,unit_price,sort_order")
          .eq("quote_id", bookingResp.data.quote_id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        admin
          .from("quote_public_links")
          .select("token,revoked_at")
          .eq("quote_id", bookingResp.data.quote_id)
          .maybeSingle(),
      ]);

      if (!quoteResp.error && quoteResp.data) {
        quote = {
          id: quoteResp.data.id,
          status: quoteResp.data.status,
          total_amount: money(quoteResp.data.total_amount),
          currency_code: safe(quoteResp.data.currency_code || "GBP").toUpperCase(),
          quote_text: quoteResp.data.quote_text || null,
          sent_at: quoteResp.data.sent_at || null,
          accepted_at: quoteResp.data.accepted_at || null,
          declined_at: quoteResp.data.declined_at || null,
          closed_at: quoteResp.data.closed_at || null,
        };
      }
      if (!itemResp.error && Array.isArray(itemResp.data)) {
        quoteItems = itemResp.data.map((it) => ({
          id: it.id,
          title: it.title || "Item",
          qty: Number(it.qty || 0),
          unit_price: Number(it.unit_price || 0),
          line_total: Number(it.qty || 0) * Number(it.unit_price || 0),
        }));
      }
      if (!quoteLinkResp.error && quoteLinkResp.data && !quoteLinkResp.data.revoked_at) {
        quotePublicToken = quoteLinkResp.data.token;
      }
    }

    const venue = bookingResp.data.venues;
    const supplier = bookingResp.data.suppliers;
    const locationLabel = venue?.name
      ? [venue.name, venue.location_label || venue.address || bookingResp.data.location_text].filter(Boolean).join(" - ")
      : (bookingResp.data.location_text || "Location not provided");

    return res.status(200).json({
      ok: true,
      booking: {
        id: bookingResp.data.id,
        origin_type: bookingResp.data.origin_type,
        event_date: bookingResp.data.event_date,
        start_time: bookingResp.data.start_time,
        end_time: bookingResp.data.end_time,
        event_location_label: locationLabel,
        guest_count: bookingResp.data.guest_count,
        status: bookingResp.data.status,
        customer_name: bookingResp.data.customer_name || null,
        has_customer_email: !!safe(bookingResp.data.customer_email),
        customer_email_masked: maskEmail(bookingResp.data.customer_email),
        value_gross: money(bookingResp.data.value_gross),
        deposit_amount: money(bookingResp.data.deposit_amount),
        balance_amount: money(bookingResp.data.balance_amount),
        is_deposit_paid: !!bookingResp.data.is_deposit_paid,
        deposit_paid_at: bookingResp.data.deposit_paid_at,
        is_balance_paid: !!bookingResp.data.is_balance_paid,
        balance_paid_at: bookingResp.data.balance_paid_at,
        venue: venue
          ? {
              id: venue.id,
              name: venue.name,
              location_label: venue.location_label || null,
            }
          : null,
        supplier: supplier
          ? {
              id: supplier.id,
              name: supplier.business_name || null,
              slug: supplier.slug || null,
              hero_image_url: supplier.hero_image_url || null,
            }
          : null,
        message_thread_id: bookingResp.data.message_thread_id || null,
      },
      quote: quote
        ? {
            ...quote,
            items: quoteItems,
            public_quote_path: quotePublicToken ? `/quote/${quotePublicToken}` : null,
            public_quote_token: quotePublicToken || null,
          }
        : null,
    });
  } catch (err) {
    console.error("public booking-access crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
