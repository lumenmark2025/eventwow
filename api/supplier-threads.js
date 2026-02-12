import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
  getSupplierByAuthUser,
} from "./message-utils.js";

function preview(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= 120) return value;
  return `${value.slice(0, 117)}...`;
}

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
      return res.status(409).json({ ok: false, error: "Cannot load threads", details: "Supplier not found" });
    }

    const { data: threads, error: threadErr } = await admin
      .from("message_threads")
      .select(
        "id,quote_id,updated_at,status,quotes(id,status,total_amount,currency_code,enquiries(event_date,event_postcode,venues(name)))"
      )
      .eq("supplier_id", supplierLookup.supplier.id)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (threadErr) {
      return res.status(500).json({ ok: false, error: "Failed to load threads", details: threadErr.message });
    }

    const ids = (threads || []).map((t) => t.id);
    if (ids.length === 0) {
      return res.status(200).json({ ok: true, threads: [] });
    }

    const [msgResp, stateResp] = await Promise.all([
      admin
        .from("messages")
        .select("id,thread_id,body,sender_type,created_at")
        .in("thread_id", ids)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("supplier_thread_state")
        .select("thread_id,last_read_at")
        .eq("supplier_id", supplierLookup.supplier.id)
        .in("thread_id", ids),
    ]);

    if (msgResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load messages", details: msgResp.error.message });
    }
    if (stateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load thread state", details: stateResp.error.message });
    }

    const latestByThread = new Map();
    for (const row of msgResp.data || []) {
      if (!latestByThread.has(row.thread_id)) {
        latestByThread.set(row.thread_id, row);
      }
    }

    const readStateByThread = new Map((stateResp.data || []).map((s) => [s.thread_id, s]));

    const rows = (threads || []).map((t) => {
      const latest = latestByThread.get(t.id) || null;
      const state = readStateByThread.get(t.id) || null;
      const updatedAt = t.updated_at || latest?.created_at || null;
      const lastReadAt = state?.last_read_at || null;
      const unread = !lastReadAt || (updatedAt && updatedAt > lastReadAt);

      return {
        id: t.id,
        quoteId: t.quote_id,
        status: t.status,
        updatedAt,
        unread,
        lastReadAt,
        quote: {
          id: t.quotes?.id || t.quote_id,
          status: t.quotes?.status || null,
          total: t.quotes?.total_amount ?? null,
          currency: t.quotes?.currency_code || "GBP",
          eventDate: t.quotes?.enquiries?.event_date || null,
          eventPostcode: t.quotes?.enquiries?.event_postcode || null,
          venueName: t.quotes?.enquiries?.venues?.name || null,
        },
        lastMessage: latest
          ? {
              body: preview(latest.body),
              senderType: latest.sender_type,
              createdAt: latest.created_at,
            }
          : null,
      };
    });

    return res.status(200).json({ ok: true, threads: rows });
  } catch (err) {
    console.error("supplier-threads crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
