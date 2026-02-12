import {
  UUID_RE,
  createAdminClient,
  ensureSupplierThreadState,
  getAuthUserId,
  getBearerToken,
  getEnv,
  getSupplierByAuthUser,
  parseBody,
  toMessageDto,
} from "./message-utils.js";
import { notifyMessageToCustomer } from "./_lib/notifications.js";

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
    const messageBody = typeof body?.body === "string" ? body.body.trim() : "";
    const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim() : "";

    if (!threadId || !UUID_RE.test(threadId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid threadId" });
    }

    if (!messageBody || messageBody.length < 1 || messageBody.length > 2000) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Message body must be between 1 and 2000 chars" });
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
      return res.status(409).json({ ok: false, error: "Cannot send message", details: "Supplier not found" });
    }

    const { data: thread, error: threadErr } = await admin
      .from("message_threads")
      .select("id,quote_id,supplier_id,enquiry_id")
      .eq("id", threadId)
      .eq("supplier_id", supplierLookup.supplier.id)
      .maybeSingle();

    if (threadErr) {
      return res.status(500).json({ ok: false, error: "Thread lookup failed", details: threadErr.message });
    }
    if (!thread) {
      return res.status(404).json({ ok: false, error: "Thread not found" });
    }

    let customerId = null;
    if (thread.enquiry_id) {
      const { data: enquiry, error: enquiryErr } = await admin
        .from("enquiries")
        .select("customer_id")
        .eq("id", thread.enquiry_id)
        .maybeSingle();

      if (enquiryErr) {
        return res.status(500).json({ ok: false, error: "Enquiry lookup failed", details: enquiryErr.message });
      }
      customerId = enquiry?.customer_id || null;
    }

    const nowIso = new Date().toISOString();
    const payload = {
      thread_id: thread.id,
      enquiry_id: thread.enquiry_id || null,
      supplier_id: thread.supplier_id || supplierLookup.supplier.id,
      customer_id: customerId,
      sender_type: "supplier",
      sender_role: "supplier",
      sender_supplier_id: supplierLookup.supplier.id,
      body: messageBody,
      client_message_id: clientMessageId || null,
      meta: null,
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
      const roleCandidates = ["supplier", "vendor", "business", "provider", "admin", "staff", "member"];
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
        .eq("thread_id", thread.id)
        .eq("client_message_id", clientMessageId)
        .maybeSingle();
    }

    if (inserted.error || !inserted.data) {
      return res.status(500).json({ ok: false, error: "Failed to send message", details: inserted.error?.message || "Unknown error" });
    }

    await admin
      .from("message_threads")
      .update({ updated_at: nowIso })
      .eq("id", thread.id);

    await ensureSupplierThreadState(admin, thread.id, supplierLookup.supplier.id, {
      last_read_at: nowIso,
      unread_count: 0,
    });

    try {
      await notifyMessageToCustomer({
        admin,
        req,
        messageId: inserted.data.id,
        quoteId: thread.quote_id,
        preview: messageBody,
      });
    } catch (notifyErr) {
      console.error("message_received_customer notification failed:", notifyErr);
    }

    return res.status(200).json({ ok: true, message: toMessageDto(inserted.data) });
  } catch (err) {
    console.error("supplier-send-message crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
