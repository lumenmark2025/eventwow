import { createClient } from "@supabase/supabase-js";

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
      .select("id,public_token,status,event_date,event_time,location_label,postcode,guest_count,category_label,message,created_at")
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

    const invitesResp = await admin
      .from("enquiry_suppliers")
      .select("id,supplier_id,supplier_status,invited_at,responded_at,quote_id")
      .eq("enquiry_id", enquiryId);

    if (invitesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load enquiry invites",
        details: invitesResp.error.message,
      });
    }

    const supplierIds = Array.from(new Set((invitesResp.data || []).map((x) => x.supplier_id).filter(Boolean)));
    const suppliersResp =
      supplierIds.length > 0
        ? await admin
            .from("suppliers")
            .select("id,business_name,slug,listing_categories")
            .in("id", supplierIds)
        : { data: [], error: null };

    if (suppliersResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load suppliers",
        details: suppliersResp.error.message,
      });
    }

    const imagesResp =
      supplierIds.length > 0
        ? await admin
            .from("supplier_images")
            .select("supplier_id,type,path,sort_order")
            .in("supplier_id", supplierIds)
            .eq("type", "hero")
        : { data: [], error: null };

    if (imagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier images",
        details: imagesResp.error.message,
      });
    }

    const quoteIds = (invitesResp.data || []).map((x) => x.quote_id).filter(Boolean);
    const quotesResp =
      quoteIds.length > 0
        ? await admin
            .from("quotes")
            .select("id,enquiry_id,supplier_id,status,total_amount,currency_code,sent_at,accepted_at,declined_at,created_at")
            .in("id", quoteIds)
        : await admin
            .from("quotes")
            .select("id,enquiry_id,supplier_id,status,total_amount,currency_code,sent_at,accepted_at,declined_at,created_at")
            .eq("enquiry_id", enquiryId);

    if (quotesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load quote summary",
        details: quotesResp.error.message,
      });
    }

    const supplierById = new Map((suppliersResp.data || []).map((s) => [s.id, s]));
    const heroBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!heroBySupplier.has(img.supplier_id)) heroBySupplier.set(img.supplier_id, img);
    }
    const quotesById = new Map((quotesResp.data || []).map((q) => [q.id, q]));
    const latestQuoteBySupplier = new Map();
    for (const q of quotesResp.data || []) {
      const prev = latestQuoteBySupplier.get(q.supplier_id);
      if (!prev || String(q.created_at || "") > String(prev.created_at || "")) {
        latestQuoteBySupplier.set(q.supplier_id, q);
      }
    }

    const inviteRows = (invitesResp.data || []).map((row) => {
      const supplier = supplierById.get(row.supplier_id);
      const hero = heroBySupplier.get(row.supplier_id);
      const quote = row.quote_id ? quotesById.get(row.quote_id) : latestQuoteBySupplier.get(row.supplier_id) || null;
      return {
        id: row.id,
        status: row.supplier_status,
        invitedAt: row.invited_at,
        respondedAt: row.responded_at,
        supplier: supplier
          ? {
              name: supplier.business_name || "Supplier",
              slug: supplier.slug || null,
              category: Array.isArray(supplier.listing_categories) ? supplier.listing_categories[0] || null : null,
              heroImageUrl: hero
                ? `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/supplier-gallery/${hero.path}`
                : null,
            }
          : null,
        quote: quote
          ? {
              id: quote.id,
              status: quote.status,
              total: quote.total_amount,
              currency: quote.currency_code || "GBP",
              sentAt: quote.sent_at,
              acceptedAt: quote.accepted_at,
              declinedAt: quote.declined_at,
            }
          : null,
      };
    });

    return res.status(200).json({
      ok: true,
      enquiry: {
        id: enquiryResp.data.id,
        status: enquiryResp.data.status,
        eventDate: enquiryResp.data.event_date,
        eventTime: enquiryResp.data.event_time,
        locationLabel: enquiryResp.data.location_label,
        postcode: enquiryResp.data.postcode,
        guestCount: enquiryResp.data.guest_count,
        categoryLabel: enquiryResp.data.category_label,
        message: enquiryResp.data.message,
        createdAt: enquiryResp.data.created_at,
      },
      invitedCount: inviteRows.length,
      invites: inviteRows,
    });
  } catch (err) {
    console.error("public-enquiry crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
