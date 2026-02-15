import { createClient } from "@supabase/supabase-js";
import { resolveAuthMe } from "../../_lib/authMe.js";
import { UUID_RE, ensureThreadForQuote, parseBody } from "../../message-utils.js";

const ALLOWED_QUOTE_STATUSES = ["sent", "accepted", "declined", "closed"];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const me = await resolveAuthMe(req);
    if (!me.ok) return res.status(me.code).json({ ok: false, error: me.error, details: me.details });
    if (me.data.role !== "customer" || !me.data.customer_id) {
      return res.status(403).json({ ok: false, error: "Forbidden (customer only)" });
    }

    const body = parseBody(req);
    const enquiryId = String(body?.enquiry_id || body?.enquiryId || "").trim();
    const supplierId = String(body?.supplier_id || body?.supplierId || "").trim();
    let quoteId = String(body?.quote_id || body?.quoteId || "").trim();

    if (!enquiryId || !UUID_RE.test(enquiryId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid enquiry_id" });
    }
    if (!supplierId || !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid supplier_id" });
    }
    if (quoteId && !UUID_RE.test(quoteId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid quote_id" });
    }

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

    const linkResp = await admin
      .from("enquiry_suppliers")
      .select("id,supplier_id")
      .eq("enquiry_id", enquiryId)
      .eq("supplier_id", supplierId)
      .maybeSingle();
    if (linkResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to validate supplier link", details: linkResp.error.message });
    }
    if (!linkResp.data) {
      return res.status(403).json({ ok: false, error: "Forbidden", details: "Supplier is not linked to this enquiry" });
    }

    let quoteResp;
    if (quoteId) {
      quoteResp = await admin
        .from("quotes")
        .select("id,enquiry_id,supplier_id,status")
        .eq("id", quoteId)
        .eq("enquiry_id", enquiryId)
        .eq("supplier_id", supplierId)
        .maybeSingle();
    } else {
      quoteResp = await admin
        .from("quotes")
        .select("id,enquiry_id,supplier_id,status,created_at")
        .eq("enquiry_id", enquiryId)
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    if (quoteResp.error) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteResp.error.message });
    }
    if (!quoteResp.data) {
      return res.status(409).json({ ok: false, error: "No quote available", details: "A message thread starts once a quote exists." });
    }

    const status = String(quoteResp.data.status || "").toLowerCase();
    if (!ALLOWED_QUOTE_STATUSES.includes(status)) {
      return res.status(409).json({ ok: false, error: "Thread unavailable", details: "Quote must be sent before messaging." });
    }

    quoteId = quoteResp.data.id;

    const ensured = await ensureThreadForQuote(admin, quoteResp.data, supplierId);
    if (ensured.error || !ensured.thread) {
      return res.status(500).json({ ok: false, error: "Failed to create thread", details: ensured.error?.message || "Unknown error" });
    }

    return res.status(200).json({ ok: true, thread_id: ensured.thread.id, quote_id: quoteId });
  } catch (err) {
    console.error("customer thread get-or-create crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

