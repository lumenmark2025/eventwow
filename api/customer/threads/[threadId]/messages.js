import { createClient } from "@supabase/supabase-js";
import { resolveAuthMe } from "../../../_lib/authMe.js";
import { UUID_RE, parseBody, toMessageDto } from "../../../message-utils.js";
import { notifyMessageToSupplier } from "../../../_lib/notifications.js";

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(n)));
}

async function loadOwnedThread(admin, me, threadId) {
  const threadResp = await admin
    .from("message_threads")
    .select("id,quote_id,supplier_id,enquiry_id,status,updated_at")
    .eq("id", threadId)
    .maybeSingle();
  if (threadResp.error) {
    return { code: 500, error: "Thread lookup failed", details: threadResp.error.message, thread: null };
  }
  if (!threadResp.data) return { code: 404, error: "Thread not found", details: null, thread: null };

  let enquiryId = threadResp.data.enquiry_id || null;
  if (!enquiryId && threadResp.data.quote_id) {
    const quoteResp = await admin
      .from("quotes")
      .select("id,enquiry_id")
      .eq("id", threadResp.data.quote_id)
      .maybeSingle();
    if (quoteResp.error) {
      return { code: 500, error: "Quote lookup failed", details: quoteResp.error.message, thread: null };
    }
    enquiryId = quoteResp.data?.enquiry_id || null;
  }
  if (!enquiryId) return { code: 403, error: "Forbidden", details: "Thread is not linked to an enquiry", thread: null };

  const enquiryResp = await admin
    .from("enquiries")
    .select("id,customer_id,customer_user_id")
    .eq("id", enquiryId)
    .maybeSingle();
  if (enquiryResp.error) {
    return { code: 500, error: "Enquiry lookup failed", details: enquiryResp.error.message, thread: null };
  }
  if (!enquiryResp.data) return { code: 404, error: "Enquiry not found", details: null, thread: null };

  const ownsEnquiry =
    enquiryResp.data.customer_id === me.data.customer_id || enquiryResp.data.customer_user_id === me.data.user_id;
  if (!ownsEnquiry) return { code: 403, error: "Forbidden", details: null, thread: null };

  return {
    code: 200,
    error: null,
    details: null,
    thread: {
      ...threadResp.data,
      enquiry_id: enquiryId,
    },
  };
}

export default async function handler(req, res) {
  try {
    const method = String(req.method || "").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const me = await resolveAuthMe(req);
    if (!me.ok) return res.status(me.code).json({ ok: false, error: me.error, details: me.details });
    if (me.data.role !== "customer" || !me.data.customer_id) {
      return res.status(403).json({ ok: false, error: "Forbidden (customer only)" });
    }

    const threadId = String(req.query?.threadId || "").trim();
    if (!threadId || !UUID_RE.test(threadId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid thread id" });
    }

    const admin = createClient(me.supabaseUrl, me.serviceKey, { auth: { persistSession: false } });
    const ownedThread = await loadOwnedThread(admin, me, threadId);
    if (!ownedThread.thread) {
      return res.status(ownedThread.code).json({ ok: false, error: ownedThread.error, details: ownedThread.details || undefined });
    }

    if (method === "GET") {
      const limit = clampLimit(req.query?.limit);
      const cursor = String(req.query?.cursor || "").trim();

      let query = admin
        .from("messages")
        .select("id,sender_type,body,created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (cursor) query = query.lt("created_at", cursor);

      const msgResp = await query;
      if (msgResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to load messages", details: msgResp.error.message });
      }

      const rows = [...(msgResp.data || [])].reverse();
      const nextCursor = rows.length > 0 ? rows[0].created_at : null;

      return res.status(200).json({
        ok: true,
        thread: {
          id: ownedThread.thread.id,
          quote_id: ownedThread.thread.quote_id || null,
          supplier_id: ownedThread.thread.supplier_id || null,
          status: ownedThread.thread.status || "open",
          updated_at: ownedThread.thread.updated_at || null,
        },
        messages: rows.map(toMessageDto),
        next_cursor: nextCursor,
      });
    }

    const body = parseBody(req);
    const messageBody = typeof body?.body === "string" ? body.body.trim() : "";
    const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim() : "";

    if (!messageBody || messageBody.length < 2 || messageBody.length > 2000) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Message body must be between 2 and 2000 chars" });
    }

    const nowIso = new Date().toISOString();
    const payload = {
      thread_id: ownedThread.thread.id,
      enquiry_id: ownedThread.thread.enquiry_id || null,
      supplier_id: ownedThread.thread.supplier_id || null,
      customer_id: me.data.customer_id,
      sender_type: "customer",
      sender_role: "customer",
      sender_supplier_id: null,
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
      const roleCandidates = ["customer", "client", "consumer", "user", "member"];
      for (const role of roleCandidates) {
        inserted = await tryInsert({ ...payload, sender_role: role });
        if (!inserted.error) break;
      }
    }

    if (inserted.error && inserted.error.code === "23505" && clientMessageId) {
      inserted = await admin
        .from("messages")
        .select("id,sender_type,body,created_at")
        .eq("thread_id", ownedThread.thread.id)
        .eq("client_message_id", clientMessageId)
        .maybeSingle();
    }

    if (inserted.error || !inserted.data) {
      return res.status(500).json({ ok: false, error: "Failed to send message", details: inserted.error?.message || "Unknown error" });
    }

    await admin
      .from("message_threads")
      .update({ updated_at: nowIso })
      .eq("id", ownedThread.thread.id);

    try {
      await notifyMessageToSupplier({
        admin,
        req,
        messageId: inserted.data.id,
        supplierId: ownedThread.thread.supplier_id || null,
        threadId: ownedThread.thread.id,
        preview: messageBody,
      });
    } catch (notifyErr) {
      console.error("message_received_supplier notification failed:", notifyErr);
    }

    return res.status(200).json({ ok: true, message: toMessageDto(inserted.data) });
  } catch (err) {
    console.error("customer thread messages crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}

