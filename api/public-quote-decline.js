import { createClient } from "@supabase/supabase-js";
import { notifyQuoteDeclined } from "./_lib/notifications.js";

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

async function loadQuoteByToken(supabaseAdmin, token) {
  const { data: link, error: linkErr } = await supabaseAdmin
    .from("quote_public_links")
    .select("id,quote_id,revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (linkErr) throw new Error(`Link lookup failed: ${linkErr.message}`);
  if (!link || link.revoked_at) return null;

  const { data: quote, error: quoteErr } = await supabaseAdmin
    .from("quotes")
    .select(
      "id,status,total_amount,currency_code,sent_at,accepted_at,declined_at,closed_at,suppliers(business_name),enquiries(event_date,event_postcode,venues(name))"
    )
    .eq("id", link.quote_id)
    .maybeSingle();

  if (quoteErr) throw new Error(`Quote lookup failed: ${quoteErr.message}`);
  if (!quote) return null;

  const { data: items, error: itemErr } = await supabaseAdmin
    .from("quote_items")
    .select("id,title,qty,unit_price,sort_order")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (itemErr) throw new Error(`Item lookup failed: ${itemErr.message}`);

  return toPublicDto(quote, items || []);
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

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const token = String(body?.token || "").trim();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (!token || !UUID_RE.test(token)) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("quote_public_links")
      .select("quote_id,revoked_at")
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
      .select("id,status,supplier_id,customer_action_name,customer_action_email")
      .eq("id", link.quote_id)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }
    if (!quote) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const status = String(quote.status || "").toLowerCase();
    if (status === "declined") {
      const dto = await loadQuoteByToken(supabaseAdmin, token);
      return res.status(200).json({ ok: true, ...dto });
    }

    if (status === "accepted" || status === "closed") {
      return res.status(409).json({
        ok: false,
        error: "Cannot decline quote",
        details: `Quote is already ${status}`,
      });
    }

    if (status !== "sent") {
      return res.status(409).json({
        ok: false,
        error: "Cannot decline quote",
        details: "Only sent quotes can be declined",
      });
    }

    const nowIso = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("quotes")
      .update({
        status: "declined",
        declined_at: nowIso,
        accepted_at: null,
        customer_action_name: name || null,
        customer_action_email: email || null,
        customer_action_note: note || null,
        updated_at: nowIso,
        updated_by_user: null,
      })
      .eq("id", quote.id)
      .eq("status", "sent")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      return res.status(500).json({ ok: false, error: "Failed to decline quote", details: updateErr.message });
    }

    if (!updated) {
      const { data: latest, error: latestErr } = await supabaseAdmin
        .from("quotes")
        .select("status")
        .eq("id", quote.id)
        .maybeSingle();

      if (latestErr || !latest) {
        return res.status(409).json({ ok: false, error: "Cannot decline quote", details: "Quote changed" });
      }

      const latestStatus = String(latest.status || "").toLowerCase();
      if (latestStatus === "declined") {
        const dto = await loadQuoteByToken(supabaseAdmin, token);
        return res.status(200).json({ ok: true, ...dto });
      }

      return res.status(409).json({
        ok: false,
        error: "Cannot decline quote",
        details: `Quote is already ${latestStatus}`,
      });
    }

    try {
      await notifyQuoteDeclined({
        admin: supabaseAdmin,
        req,
        quoteId: quote.id,
        supplierId: quote.supplier_id,
        customerName: name || quote.customer_action_name || null,
        customerEmail: email || quote.customer_action_email || null,
      });
    } catch (notifyErr) {
      console.error("quote_declined notification failed:", notifyErr);
    }

    const dto = await loadQuoteByToken(supabaseAdmin, token);
    return res.status(200).json({ ok: true, ...dto });
  } catch (err) {
    console.error("public-quote-decline crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
