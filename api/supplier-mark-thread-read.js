import {
  UUID_RE,
  createAdminClient,
  ensureSupplierThreadState,
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

    const body = parseBody(req);
    const threadId = String(body?.threadId || "").trim();

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
      return res.status(409).json({ ok: false, error: "Cannot mark read", details: "Supplier not found" });
    }

    const { data: thread, error: threadErr } = await admin
      .from("message_threads")
      .select("id")
      .eq("id", threadId)
      .eq("supplier_id", supplierLookup.supplier.id)
      .maybeSingle();

    if (threadErr) {
      return res.status(500).json({ ok: false, error: "Thread lookup failed", details: threadErr.message });
    }
    if (!thread) {
      return res.status(404).json({ ok: false, error: "Thread not found" });
    }

    const nowIso = new Date().toISOString();
    const { error: stateErr } = await ensureSupplierThreadState(admin, thread.id, supplierLookup.supplier.id, {
      last_read_at: nowIso,
      unread_count: 0,
    });

    if (stateErr) {
      return res.status(500).json({ ok: false, error: "Failed to mark read", details: stateErr.message });
    }

    return res.status(200).json({ ok: true, lastReadAt: nowIso });
  } catch (err) {
    console.error("supplier-mark-thread-read crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
