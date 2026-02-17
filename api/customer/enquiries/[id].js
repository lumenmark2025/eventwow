import { createClient } from "@supabase/supabase-js";
import { resolveAuthMe } from "../../_lib/authMe.js";

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const me = await resolveAuthMe(req);
    if (!me.ok) return res.status(me.code).json({ ok: false, error: me.error, details: me.details });
    if (me.data.role !== "customer" || !me.data.customer_id) {
      return res.status(403).json({ ok: false, error: "Forbidden (customer only)" });
    }

    const enquiryId = String(req.query?.id || "").trim();
    if (!enquiryId) return res.status(400).json({ ok: false, error: "Bad request", details: "Missing enquiry id" });

    const admin = createClient(me.supabaseUrl, me.serviceKey, { auth: { persistSession: false } });

    const enquiryResp = await admin
      .from("enquiries")
      .select("id,status,event_date,start_time,guest_count,venue_name,location_label,enquiry_category_slug,message,created_at,public_token")
      .eq("id", enquiryId)
      .eq("customer_id", me.data.customer_id)
      .maybeSingle();
    if (enquiryResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load enquiry", details: enquiryResp.error.message });
    }
    if (!enquiryResp.data) return res.status(404).json({ ok: false, error: "Enquiry not found" });

    const [inviteResp, quoteResp] = await Promise.all([
      admin
        .from("enquiry_suppliers")
        .select("id,supplier_id,supplier_status,invited_at,responded_at,quote_id")
        .eq("enquiry_id", enquiryId),
      admin
        .from("quotes")
        .select("id,supplier_id,status,total_amount,currency_code,quote_text,sent_at,accepted_at,declined_at,created_at")
        .eq("enquiry_id", enquiryId)
        .order("created_at", { ascending: false }),
    ]);
    if (inviteResp.error) return res.status(500).json({ ok: false, error: "Failed to load invites", details: inviteResp.error.message });
    if (quoteResp.error) return res.status(500).json({ ok: false, error: "Failed to load quotes", details: quoteResp.error.message });

    const supplierIds = Array.from(
      new Set([...(inviteResp.data || []).map((r) => r.supplier_id), ...(quoteResp.data || []).map((r) => r.supplier_id)].filter(Boolean))
    );

    const suppliersResp =
      supplierIds.length > 0
        ? await admin.from("suppliers").select("id,business_name,slug,location_label").in("id", supplierIds)
        : { data: [], error: null };
    if (suppliersResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    }
    const supplierById = new Map((suppliersResp.data || []).map((s) => [s.id, s]));

    const quoteIds = (quoteResp.data || []).map((q) => q.id);
    const [itemsResp, linksResp, threadsResp] = await Promise.all([
      quoteIds.length > 0
        ? admin.from("quote_items").select("id,quote_id,title,qty,unit_price,sort_order,created_at").in("quote_id", quoteIds)
        : { data: [], error: null },
      quoteIds.length > 0
        ? admin.from("quote_public_links").select("quote_id,token,revoked_at").in("quote_id", quoteIds)
        : { data: [], error: null },
      quoteIds.length > 0
        ? admin.from("message_threads").select("id,quote_id,updated_at,status").in("quote_id", quoteIds)
        : { data: [], error: null },
    ]);
    if (itemsResp.error) return res.status(500).json({ ok: false, error: "Failed to load quote items", details: itemsResp.error.message });
    if (linksResp.error) return res.status(500).json({ ok: false, error: "Failed to load quote links", details: linksResp.error.message });
    if (threadsResp.error) return res.status(500).json({ ok: false, error: "Failed to load message threads", details: threadsResp.error.message });

    const threadIds = (threadsResp.data || []).map((t) => t.id);
    const messagesResp =
      threadIds.length > 0
        ? await admin
            .from("messages")
            .select("id,thread_id,sender_type,body,created_at")
            .in("thread_id", threadIds)
            .order("created_at", { ascending: true })
        : { data: [], error: null };
    if (messagesResp.error) return res.status(500).json({ ok: false, error: "Failed to load messages", details: messagesResp.error.message });

    const itemsByQuote = new Map();
    for (const it of itemsResp.data || []) {
      if (!itemsByQuote.has(it.quote_id)) itemsByQuote.set(it.quote_id, []);
      itemsByQuote.get(it.quote_id).push(it);
    }
    const tokenByQuote = new Map();
    for (const link of linksResp.data || []) {
      if (!link.revoked_at) tokenByQuote.set(link.quote_id, link.token);
    }
    const threadByQuote = new Map((threadsResp.data || []).map((t) => [t.quote_id, t]));
    const messagesByThread = new Map();
    for (const msg of messagesResp.data || []) {
      if (!messagesByThread.has(msg.thread_id)) messagesByThread.set(msg.thread_id, []);
      messagesByThread.get(msg.thread_id).push({
        id: msg.id,
        senderType: msg.sender_type,
        body: msg.body,
        createdAt: msg.created_at,
      });
    }

    const invites = (inviteResp.data || []).map((row) => {
      const supplier = supplierById.get(row.supplier_id);
      return {
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: supplier?.business_name || "Supplier",
        supplierSlug: supplier?.slug || null,
        status: row.supplier_status || "invited",
        invitedAt: row.invited_at || null,
        respondedAt: row.responded_at || null,
      };
    });

    const quotes = (quoteResp.data || []).map((row) => {
      const supplier = supplierById.get(row.supplier_id);
      const thread = threadByQuote.get(row.id);
      return {
        id: row.id,
        quoteToken: tokenByQuote.get(row.id) || null,
        supplierId: row.supplier_id,
        supplierName: supplier?.business_name || "Supplier",
        status: row.status,
        totalAmount: toNumber(row.total_amount),
        currencyCode: String(row.currency_code || "GBP").toUpperCase(),
        quoteText: row.quote_text || null,
        sentAt: row.sent_at || null,
        acceptedAt: row.accepted_at || null,
        declinedAt: row.declined_at || null,
        createdAt: row.created_at || null,
        items: (itemsByQuote.get(row.id) || []).map((it) => ({
          id: it.id,
          title: it.title || "Item",
          qty: toNumber(it.qty),
          unitPrice: toNumber(it.unit_price),
          lineTotal: toNumber(it.qty) * toNumber(it.unit_price),
        })),
        thread: thread
          ? {
              id: thread.id,
              status: thread.status || "open",
              updatedAt: thread.updated_at || null,
              messages: messagesByThread.get(thread.id) || [],
            }
          : null,
      };
    });

    return res.status(200).json({
      ok: true,
      enquiry: {
        id: enquiryResp.data.id,
        status: enquiryResp.data.status,
        eventDate: enquiryResp.data.event_date || null,
        startTime: enquiryResp.data.start_time || null,
        guestCount: enquiryResp.data.guest_count ?? null,
        venueName: enquiryResp.data.venue_name || enquiryResp.data.location_label || null,
        categorySlug: enquiryResp.data.enquiry_category_slug || null,
        message: enquiryResp.data.message || null,
        createdAt: enquiryResp.data.created_at || null,
        publicToken: enquiryResp.data.public_token || null,
      },
      invites,
      quotes,
    });
  } catch (err) {
    console.error("customer enquiry detail crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
