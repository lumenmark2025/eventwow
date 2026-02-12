import {
  UUID_RE,
  createAdminClient,
  ensureSupplierThreadState,
  getAuthUserId,
  getBearerToken,
  getEnv,
  getSupplierByAuthUser,
  toMessageDto,
} from "./message-utils.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const { SUPABASE_URL, SERVICE_KEY, ANON_KEY } = getEnv();

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const threadId = String(req.query?.threadId || "").trim();
    if (!threadId || !UUID_RE.test(threadId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid threadId" });
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
      return res.status(409).json({ ok: false, error: "Cannot load thread", details: "Supplier not found" });
    }

    const { data: thread, error: threadErr } = await admin
      .from("message_threads")
      .select("id,quote_id,supplier_id,updated_at,status")
      .eq("id", threadId)
      .eq("supplier_id", supplierLookup.supplier.id)
      .maybeSingle();

    if (threadErr) {
      return res.status(500).json({ ok: false, error: "Thread lookup failed", details: threadErr.message });
    }
    if (!thread) {
      return res.status(404).json({ ok: false, error: "Thread not found" });
    }

    const { data: messages, error: msgErr } = await admin
      .from("messages")
      .select("id,sender_type,body,created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(500);

    if (msgErr) {
      return res.status(500).json({ ok: false, error: "Failed to load messages", details: msgErr.message });
    }

    const nowIso = new Date().toISOString();
    await ensureSupplierThreadState(admin, thread.id, supplierLookup.supplier.id, {
      last_read_at: nowIso,
      unread_count: 0,
    });

    return res.status(200).json({
      ok: true,
      thread: {
        id: thread.id,
        quoteId: thread.quote_id,
        updatedAt: thread.updated_at,
        status: thread.status,
      },
      messages: (messages || []).map(toMessageDto),
    });
  } catch (err) {
    console.error("supplier-thread crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
