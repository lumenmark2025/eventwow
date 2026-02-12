import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toPublicDto(quote, items) {
  return {
    quote: {
      id: quote.id,
      status: quote.status,
      sent_at: quote.sent_at,
      accepted_at: quote.accepted_at,
      declined_at: quote.declined_at,
      closed_at: quote.closed_at,
      subtotal: quote.total_amount,
      tax: null,
      total: quote.total_amount,
      currency: quote.currency_code || "GBP",
    },
    supplier: {
      name: quote.suppliers?.business_name || "Supplier",
      phone: null,
      email: null,
      logo_url: null,
    },
    enquiry: {
      event_date: quote.enquiries?.event_date || null,
      location_summary:
        [quote.enquiries?.venues?.name, quote.enquiries?.event_postcode].filter(Boolean).join(" - ") || null,
      guest_count: null,
    },
    items: (items || []).map((it) => ({
      id: it.id,
      title: it.title || "Item",
      description: null,
      qty: Number(it.qty || 0),
      unit_price: Number(it.unit_price || 0),
      line_total: Number(it.qty || 0) * Number(it.unit_price || 0),
    })),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const token = String(req.query?.token || "").trim();
    if (!token || !UUID_RE.test(token)) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("quote_public_links")
      .select("id,quote_id,token,revoked_at,view_count")
      .eq("token", token)
      .maybeSingle();

    if (linkErr) {
      return res.status(500).json({ ok: false, error: "Link lookup failed", details: linkErr.message });
    }
    if (!link || link.revoked_at) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("quotes")
      .select(
        "id,status,total_amount,currency_code,sent_at,accepted_at,declined_at,closed_at,suppliers(business_name),enquiries(event_date,event_postcode,venues(name))"
      )
      .eq("id", link.quote_id)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }
    if (!quote) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const status = String(quote.status || "").toLowerCase();
    if (!["sent", "accepted", "declined", "closed"].includes(status)) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const { data: items, error: itemErr } = await supabaseAdmin
      .from("quote_items")
      .select("id,title,qty,unit_price,sort_order")
      .eq("quote_id", quote.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (itemErr) {
      return res.status(500).json({ ok: false, error: "Failed to load items", details: itemErr.message });
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("quote_public_links")
      .update({
        last_viewed_at: nowIso,
        view_count: Number(link.view_count || 0) + 1,
      })
      .eq("id", link.id);

    return res.status(200).json({
      ok: true,
      ...toPublicDto(quote, items || []),
    });
  } catch (err) {
    console.error("public-quote crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
