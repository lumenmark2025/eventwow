import {
  UUID_RE,
  createAdminClient,
  ensureThreadForQuote,
  getEnv,
  parseBody,
  toMessageDto,
} from "./message-utils.js";
import { notifyMessageToSupplier } from "./_lib/notifications.js";

const ALLOWED_QUOTE_STATUSES = ["sent", "accepted", "declined", "closed"];
const MAX_MESSAGES_PER_MINUTE_PER_TOKEN = 8;

async function loadQuoteFromToken(admin, token) {
  const { data: link, error: linkErr } = await admin
    .from("quote_public_links")
    .select("id,quote_id,revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (linkErr) {
    return { link: null, quote: null, error: { code: 500, message: `Link lookup failed: ${linkErr.message}` } };
  }
  if (!link || link.revoked_at) {
    return { link: null, quote: null, error: { code: 404, message: "Quote not found" } };
  }

  const { data: quote, error: quoteErr } = await admin
    .from("quotes")
    .select("id,supplier_id,enquiry_id,status")
    .eq("id", link.quote_id)
    .maybeSingle();

  if (quoteErr) {
    return { link, quote: null, error: { code: 500, message: `Quote lookup failed: ${quoteErr.message}` } };
  }
  if (!quote) {
    return { link, quote: null, error: { code: 404, message: "Quote not found" } };
  }

  const status = String(quote.status || "").toLowerCase();
  if (!ALLOWED_QUOTE_STATUSES.includes(status)) {
    return { link, quote: null, error: { code: 404, message: "Quote not found" } };
  }

  return { link, quote, error: null };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const { SUPABASE_URL, SERVICE_KEY } = getEnv();

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

    const body = parseBody(req);
    const token = String(body?.token || "").trim();
    const messageBodyRaw =
      typeof body?.body === "string" ? body.body : typeof body?.messageText === "string" ? body.messageText : "";
    const messageBody = String(messageBodyRaw || "").trim();
    const requestedThreadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
    const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim() : "";

    if (!token || !UUID_RE.test(token)) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    if (!messageBody || messageBody.length < 1 || messageBody.length > 2000) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Message body must be between 1 and 2000 chars" });
    }

    const admin = createAdminClient(SUPABASE_URL, SERVICE_KEY);
    const loaded = await loadQuoteFromToken(admin, token);

    if (loaded.error) {
      return res.status(loaded.error.code).json({ ok: false, error: loaded.error.message });
    }

    const ensured = await ensureThreadForQuote(admin, loaded.quote, loaded.quote.supplier_id);
    if (ensured.error || !ensured.thread) {
      return res.status(500).json({ ok: false, error: "Failed to load thread", details: ensured.error?.message || "Unknown error" });
    }
    if (requestedThreadId && requestedThreadId !== ensured.thread.id) {
      return res.status(409).json({ ok: false, error: "Thread mismatch", details: "Thread does not match this quote token" });
    }

    let customerId = null;
    if (loaded.quote.enquiry_id) {
      const { data: enquiry, error: enquiryErr } = await admin
        .from("enquiries")
        .select("customer_id")
        .eq("id", loaded.quote.enquiry_id)
        .maybeSingle();

      if (enquiryErr) {
        return res.status(500).json({ ok: false, error: "Enquiry lookup failed", details: enquiryErr.message });
      }
      customerId = enquiry?.customer_id || null;
    }

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentCount, error: rateErr } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", ensured.thread.id)
      .eq("sender_type", "customer")
      .gte("created_at", oneMinuteAgo);

    if (rateErr) {
      return res.status(500).json({ ok: false, error: "Failed to validate rate limit", details: rateErr.message });
    }

    if (Number(recentCount || 0) >= MAX_MESSAGES_PER_MINUTE_PER_TOKEN) {
      return res.status(429).json({ ok: false, error: "Too many messages", details: "Please wait before sending another message" });
    }

    const nowIso = new Date().toISOString();
    const rawIp = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 300);

    const payload = {
      thread_id: ensured.thread.id,
      enquiry_id: loaded.quote.enquiry_id || ensured.thread.enquiry_id || null,
      supplier_id: ensured.thread.supplier_id || loaded.quote.supplier_id || null,
      customer_id: customerId,
      sender_type: "customer",
      sender_role: "customer",
      sender_supplier_id: null,
      body: messageBody,
      client_message_id: clientMessageId || null,
      meta: {
        ip_hint: rawIp || null,
        ua: userAgent || null,
      },
    };

    async function tryInsert(nextPayload) {
      return admin
        .from("messages")
        .insert([nextPayload])
        .select("id,sender_type,body,created_at")
        .single();
    }

    let inserted = await tryInsert(payload);

    if (
      inserted.error &&
      inserted.error.code === "PGRST204" &&
      (String(inserted.error.message || "").includes("enquiry_id") ||
        String(inserted.error.message || "").includes("supplier_id") ||
        String(inserted.error.message || "").includes("customer_id") ||
        String(inserted.error.message || "").includes("sender_role"))
    ) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.enquiry_id;
      delete fallbackPayload.supplier_id;
      delete fallbackPayload.customer_id;
      delete fallbackPayload.sender_role;
      inserted = await tryInsert(fallbackPayload);
    }

    if (
      inserted.error &&
      inserted.error.code === "22P02" &&
      String(inserted.error.message || "").toLowerCase().includes("actor_role")
    ) {
      const roleCandidates = ["customer", "client", "consumer", "user", "member"];
      for (const role of roleCandidates) {
        const retryPayload = { ...payload, sender_role: role };
        inserted = await tryInsert(retryPayload);
        if (!inserted.error) break;
      }
    }

    if (inserted.error && inserted.error.code === "23505" && clientMessageId) {
      inserted = await admin
        .from("messages")
        .select("id,sender_type,body,created_at")
        .eq("thread_id", ensured.thread.id)
        .eq("client_message_id", clientMessageId)
        .maybeSingle();
    }

    if (inserted.error || !inserted.data) {
      return res.status(500).json({ ok: false, error: "Failed to send message", details: inserted.error?.message || "Unknown error" });
    }

    await admin
      .from("message_threads")
      .update({ updated_at: nowIso })
      .eq("id", ensured.thread.id);

    try {
      await notifyMessageToSupplier({
        admin,
        req,
        messageId: inserted.data.id,
        supplierId: ensured.thread.supplier_id || loaded.quote.supplier_id,
        threadId: ensured.thread.id,
        preview: messageBody,
      });
    } catch (notifyErr) {
      console.error("message_received_supplier notification failed:", notifyErr);
    }

    return res.status(200).json({ ok: true, message: toMessageDto(inserted.data) });
  } catch (err) {
    console.error("public-send-message crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
