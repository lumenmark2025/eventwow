import { createClient } from "@supabase/supabase-js";
import { resolveAuthMe } from "../../../_lib/authMe.js";

function byCreatedDesc(a, b) {
  return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
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
      .select("id,customer_id,customer_user_id")
      .eq("id", enquiryId)
      .maybeSingle();
    if (enquiryResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load enquiry", details: enquiryResp.error.message });
    }
    if (!enquiryResp.data) return res.status(404).json({ ok: false, error: "Enquiry not found" });

    const ownsEnquiry =
      enquiryResp.data.customer_id === me.data.customer_id || enquiryResp.data.customer_user_id === me.data.user_id;
    if (!ownsEnquiry) return res.status(403).json({ ok: false, error: "Forbidden" });

    const [inviteResp, quoteResp] = await Promise.all([
      admin
        .from("enquiry_suppliers")
        .select("supplier_id")
        .eq("enquiry_id", enquiryId),
      admin
        .from("quotes")
        .select("id,supplier_id,created_at")
        .eq("enquiry_id", enquiryId)
        .order("created_at", { ascending: false }),
    ]);

    if (inviteResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier links", details: inviteResp.error.message });
    }
    if (quoteResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load quotes", details: quoteResp.error.message });
    }

    const invitedSupplierIds = Array.from(new Set((inviteResp.data || []).map((row) => row.supplier_id).filter(Boolean)));
    if (invitedSupplierIds.length === 0) return res.status(200).json({ ok: true, rows: [] });

    const suppliersResp = await admin
      .from("suppliers")
      .select("id,business_name")
      .in("id", invitedSupplierIds);
    if (suppliersResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load suppliers", details: suppliersResp.error.message });
    }

    const quoteBySupplier = new Map();
    for (const quote of (quoteResp.data || []).sort(byCreatedDesc)) {
      if (!quote?.supplier_id) continue;
      if (!quoteBySupplier.has(quote.supplier_id)) quoteBySupplier.set(quote.supplier_id, quote);
    }

    const quoteIds = Array.from(new Set((quoteResp.data || []).map((row) => row.id).filter(Boolean)));
    const threadResp =
      quoteIds.length > 0
        ? await admin.from("message_threads").select("id,quote_id").in("quote_id", quoteIds)
        : { data: [], error: null };
    if (threadResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load threads", details: threadResp.error.message });
    }
    const threadByQuote = new Map((threadResp.data || []).map((row) => [row.quote_id, row.id]));

    const supplierById = new Map((suppliersResp.data || []).map((row) => [row.id, row]));
    const rows = invitedSupplierIds.map((supplierId) => {
      const supplier = supplierById.get(supplierId);
      const quote = quoteBySupplier.get(supplierId);
      return {
        supplier_id: supplierId,
        supplier_name: supplier?.business_name || "Supplier",
        quote_id: quote?.id || null,
        thread_id: quote?.id ? threadByQuote.get(quote.id) || null : null,
      };
    });

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    console.error("customer messaging-targets crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

