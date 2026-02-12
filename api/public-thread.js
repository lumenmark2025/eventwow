import {
  UUID_RE,
  createAdminClient,
  ensureThreadForQuote,
  getEnv,
  toMessageDto,
} from "./message-utils.js";

const ALLOWED_QUOTE_STATUSES = ["sent", "accepted", "declined", "closed"];

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
    if (req.method !== "GET") {
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

    const token = String(req.query?.token || "").trim();
    if (!token || !UUID_RE.test(token)) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
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

    const { data: messages, error: msgErr } = await admin
      .from("messages")
      .select("id,sender_type,body,created_at")
      .eq("thread_id", ensured.thread.id)
      .order("created_at", { ascending: true })
      .limit(500);

    if (msgErr) {
      return res.status(500).json({ ok: false, error: "Failed to load messages", details: msgErr.message });
    }

    return res.status(200).json({
      ok: true,
      thread: {
        id: ensured.thread.id,
        quoteId: ensured.thread.quote_id,
        updatedAt: ensured.thread.updated_at,
        status: ensured.thread.status,
      },
      messages: (messages || []).map(toMessageDto),
    });
  } catch (err) {
    console.error("public-thread crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
