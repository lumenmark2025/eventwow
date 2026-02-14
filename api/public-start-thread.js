import {
  UUID_RE,
  createAdminClient,
  ensureThreadForQuote,
  getEnv,
  parseBody,
} from "./message-utils.js";

const ALLOWED_QUOTE_STATUSES = ["sent", "accepted", "declined", "closed"];

async function ensureQuoteToken(admin, quoteId) {
  const existing = await admin
    .from("quote_public_links")
    .select("quote_id,token,revoked_at")
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (existing.error) return { error: existing.error, token: null };
  if (existing.data && !existing.data.revoked_at) {
    return { error: null, token: existing.data.token };
  }

  const inserted = await admin
    .from("quote_public_links")
    .insert([{ quote_id: quoteId }])
    .select("token")
    .single();

  if (!inserted.error && inserted.data?.token) {
    return { error: null, token: inserted.data.token };
  }

  if (inserted.error?.code === "23505") {
    const retry = await admin
      .from("quote_public_links")
      .select("token,revoked_at")
      .eq("quote_id", quoteId)
      .maybeSingle();
    if (retry.error) return { error: retry.error, token: null };
    if (!retry.data || retry.data.revoked_at) {
      return { error: { message: "Quote token unavailable" }, token: null };
    }
    return { error: null, token: retry.data.token };
  }

  return { error: inserted.error || { message: "Failed to create quote link" }, token: null };
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
    const supplierId = String(body?.supplierId || "").trim();
    const quoteId = String(body?.quoteId || "").trim();

    if (!token) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Missing token" });
    }

    if (!supplierId && !quoteId) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "supplierId or quoteId is required" });
    }
    if (supplierId && !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid supplierId" });
    }
    if (quoteId && !UUID_RE.test(quoteId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid quoteId" });
    }

    const admin = createAdminClient(SUPABASE_URL, SERVICE_KEY);

    const enquiryResp = await admin
      .from("enquiries")
      .select("id")
      .eq("public_token", token)
      .maybeSingle();

    if (enquiryResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load enquiry", details: enquiryResp.error.message });
    }
    if (!enquiryResp.data) {
      return res.status(404).json({ ok: false, error: "Enquiry not found" });
    }

    const enquiryId = enquiryResp.data.id;
    let resolvedSupplierId = supplierId || null;

    if (resolvedSupplierId) {
      const inviteResp = await admin
        .from("enquiry_suppliers")
        .select("id")
        .eq("enquiry_id", enquiryId)
        .eq("supplier_id", resolvedSupplierId)
        .maybeSingle();

      if (inviteResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to validate supplier invite", details: inviteResp.error.message });
      }
      if (!inviteResp.data) {
        return res.status(404).json({ ok: false, error: "Supplier not found for this enquiry" });
      }
    }

    const quoteQuery = admin
      .from("quotes")
      .select("id,enquiry_id,supplier_id,status")
      .eq("enquiry_id", enquiryId)
      .in("status", ALLOWED_QUOTE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);

    const quoteResp = quoteId
      ? await quoteQuery.eq("id", quoteId)
      : await quoteQuery.eq("supplier_id", resolvedSupplierId);

    if (quoteResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load quote", details: quoteResp.error.message });
    }

    const quote = (quoteResp.data || [])[0] || null;
    if (!quote) {
      return res.status(404).json({ ok: false, error: "Quote not found" });
    }

    const ensured = await ensureThreadForQuote(admin, quote, quote.supplier_id);
    if (ensured.error || !ensured.thread) {
      return res.status(500).json({ ok: false, error: "Failed to start thread", details: ensured.error?.message || "Unknown error" });
    }

    const ensuredToken = await ensureQuoteToken(admin, quote.id);
    if (ensuredToken.error || !ensuredToken.token) {
      return res.status(500).json({ ok: false, error: "Failed to start thread", details: ensuredToken.error?.message || "Quote token unavailable" });
    }

    return res.status(200).json({
      ok: true,
      threadId: ensured.thread.id,
      quoteId: quote.id,
      quoteToken: ensuredToken.token,
    });
  } catch (err) {
    console.error("public-start-thread crashed:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal Server Error",
      details: String(err?.message || err),
    });
  }
}
