import {
  UUID_RE,
  createAdminClient,
  ensureSupplierThreadState,
  ensureThreadForQuote,
  getAuthUserId,
  getBearerToken,
  getEnv,
  getSupplierByAuthUser,
  parseBody,
} from "./message-utils.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const { SUPABASE_URL, SERVICE_KEY, ANON_KEY } = getEnv();

    if (!SUPABASE_URL || !ANON_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
        },
      });
    }

    if (!SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing service role key",
        details: "SUPABASE_SERVICE_ROLE_KEY is required for server-side writes",
      });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const body = parseBody(req);
    const quoteId = String(body?.quoteId || body?.quote_id || "").trim();
    if (!quoteId || !UUID_RE.test(quoteId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid quoteId" });
    }

    const auth = await getAuthUserId(SUPABASE_URL, ANON_KEY, token);
    if (auth.error || !auth.userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: auth.error });
    }

    const admin = createAdminClient(SUPABASE_URL, SERVICE_KEY);

    const supplierLookup = await getSupplierByAuthUser(admin, auth.userId);
    if (supplierLookup.error) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supplierLookup.error.message });
    }
    if (!supplierLookup.supplier) {
      return res.status(409).json({ ok: false, error: "Cannot open thread", details: "Supplier not found" });
    }

    const { data: quote, error: quoteErr } = await admin
      .from("quotes")
      .select("id,enquiry_id,supplier_id,status")
      .eq("id", quoteId)
      .eq("supplier_id", supplierLookup.supplier.id)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }
    if (!quote) {
      return res.status(404).json({ ok: false, error: "Thread not found", details: "Quote not found for this supplier" });
    }

    if (String(quote.status || "").toLowerCase() === "draft") {
      return res.status(409).json({ ok: false, error: "Cannot open thread", details: "Quote must be sent first" });
    }

    const ensured = await ensureThreadForQuote(admin, quote, supplierLookup.supplier.id);
    if (ensured.error || !ensured.thread) {
      return res.status(500).json({ ok: false, error: "Failed to create thread", details: ensured.error?.message || "Unknown error" });
    }

    await ensureSupplierThreadState(admin, ensured.thread.id, supplierLookup.supplier.id);

    return res.status(200).json({ ok: true, threadId: ensured.thread.id });
  } catch (err) {
    console.error("supplier-get-thread crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
