import { createClient } from "@supabase/supabase-js";

const ALLOWED_QUOTE_STATUSES = ["sent", "accepted", "declined", "closed"];

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function buildQuoteDto(row, supplier, heroPath, quoteToken, items, supabaseUrl) {
  const safeBase = String(supabaseUrl || "").replace(/\/+$/, "");
  const heroImageUrl = heroPath
    ? `${safeBase}/storage/v1/object/public/supplier-gallery/${heroPath}`
    : null;

  return {
    quoteId: row.id,
    quoteToken: quoteToken || null,
    quoteStatus: row.status,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    declinedAt: row.declined_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    totals: {
      total: toNumber(row.total_amount),
      subtotal: toNumber(row.total_amount),
      vat: null,
      currency: String(row.currency_code || "GBP").toUpperCase(),
    },
    supplier: {
      supplierId: supplier?.id || row.supplier_id,
      name: supplier?.business_name || "Supplier",
      slug: supplier?.slug || null,
      heroImageUrl,
      categories: Array.isArray(supplier?.listing_categories) ? supplier.listing_categories : [],
      locationLabel: supplier?.location_label || null,
    },
    items: (items || []).map((it) => ({
      id: it.id,
      description: it.title || "Item",
      qty: toNumber(it.qty),
      unitPrice: toNumber(it.unit_price),
      lineTotal: toNumber(it.qty) * toNumber(it.unit_price),
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
    if (!token) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing token" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const enquiryResp = await admin
      .from("enquiries")
      .select("id,status,event_date,guest_count,venue_name,location_label,message,created_at")
      .eq("public_token", token)
      .maybeSingle();

    if (enquiryResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load enquiry",
        details: enquiryResp.error.message,
      });
    }
    if (!enquiryResp.data) {
      return res.status(404).json({ ok: false, error: "Enquiry not found" });
    }

    const enquiryId = enquiryResp.data.id;

    const [invitesResp, shortlistResp] = await Promise.all([
      admin
        .from("enquiry_suppliers")
        .select("supplier_id")
        .eq("enquiry_id", enquiryId),
      admin
        .from("enquiry_shortlists")
        .select("supplier_id")
        .eq("enquiry_id", enquiryId),
    ]);

    if (invitesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load invites",
        details: invitesResp.error.message,
      });
    }
    if (shortlistResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load shortlist",
        details: shortlistResp.error.message,
      });
    }

    const invitedSupplierIds = Array.from(
      new Set((invitesResp.data || []).map((row) => row.supplier_id).filter(Boolean))
    );

    const supplierResp =
      invitedSupplierIds.length > 0
        ? await admin
            .from("suppliers")
            .select("id,business_name,slug,listing_categories,location_label")
            .in("id", invitedSupplierIds)
        : { data: [], error: null };

    if (supplierResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load suppliers",
        details: supplierResp.error.message,
      });
    }

    const supplierById = new Map((supplierResp.data || []).map((s) => [s.id, s]));
    const supplierIds = Array.from(supplierById.keys());

    const heroResp =
      supplierIds.length > 0
        ? await admin
            .from("supplier_images")
            .select("supplier_id,path,sort_order")
            .eq("type", "hero")
            .in("supplier_id", supplierIds)
            .order("sort_order", { ascending: true })
        : { data: [], error: null };

    if (heroResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier images",
        details: heroResp.error.message,
      });
    }

    const heroBySupplier = new Map();
    for (const img of heroResp.data || []) {
      if (!heroBySupplier.has(img.supplier_id)) {
        heroBySupplier.set(img.supplier_id, img.path || null);
      }
    }

    const quotesResp = await admin
      .from("quotes")
      .select("id,enquiry_id,supplier_id,status,total_amount,currency_code,sent_at,accepted_at,declined_at,closed_at,created_at")
      .eq("enquiry_id", enquiryId)
      .in("status", ALLOWED_QUOTE_STATUSES)
      .order("created_at", { ascending: false });

    if (quotesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load quotes",
        details: quotesResp.error.message,
      });
    }

    const allQuotes = quotesResp.data || [];
    const latestBySupplier = new Map();
    for (const quote of allQuotes) {
      if (!latestBySupplier.has(quote.supplier_id)) {
        latestBySupplier.set(quote.supplier_id, quote);
      }
    }

    const quotes = Array.from(latestBySupplier.values());
    const quoteIds = quotes.map((q) => q.id);

    const [itemsResp, linkResp] = await Promise.all([
      quoteIds.length > 0
        ? admin
            .from("quote_items")
            .select("id,quote_id,title,qty,unit_price,sort_order,created_at")
            .in("quote_id", quoteIds)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
        : { data: [], error: null },
      quoteIds.length > 0
        ? admin
            .from("quote_public_links")
            .select("quote_id,token,revoked_at")
            .in("quote_id", quoteIds)
        : { data: [], error: null },
    ]);

    if (itemsResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load quote items",
        details: itemsResp.error.message,
      });
    }
    if (linkResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load quote links",
        details: linkResp.error.message,
      });
    }

    const itemsByQuote = new Map();
    for (const item of itemsResp.data || []) {
      if (!itemsByQuote.has(item.quote_id)) itemsByQuote.set(item.quote_id, []);
      itemsByQuote.get(item.quote_id).push(item);
    }

    const tokenByQuote = new Map();
    for (const link of linkResp.data || []) {
      if (!link.revoked_at) tokenByQuote.set(link.quote_id, link.token);
    }

    const quoteDtos = quotes.map((quote) =>
      buildQuoteDto(
        quote,
        supplierById.get(quote.supplier_id),
        heroBySupplier.get(quote.supplier_id),
        tokenByQuote.get(quote.id),
        itemsByQuote.get(quote.id) || [],
        SUPABASE_URL
      )
    );

    return res.status(200).json({
      ok: true,
      enquiry: {
        id: enquiryResp.data.id,
        token,
        status: enquiryResp.data.status,
        eventDate: enquiryResp.data.event_date,
        guestCount: enquiryResp.data.guest_count,
        venueName: enquiryResp.data.venue_name || null,
        locationLabel: enquiryResp.data.location_label || null,
        message: enquiryResp.data.message || null,
        createdAt: enquiryResp.data.created_at,
      },
      shortlist: (shortlistResp.data || []).map((row) => row.supplier_id),
      quotes: quoteDtos,
    });
  } catch (err) {
    console.error("public-enquiry-quotes crashed:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal Server Error",
      details: String(err?.message || err),
    });
  }
}
