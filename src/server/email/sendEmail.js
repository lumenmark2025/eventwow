import { getResendClient } from "./resendClient.js";

const sentKeyCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Email timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

function pruneCache(now) {
  for (const [key, ts] of sentKeyCache.entries()) {
    if (now - ts > CACHE_TTL_MS) sentKeyCache.delete(key);
  }
}

function normalizeRecipients(to) {
  const values = Array.isArray(to) ? to : [to];
  return values.map((v) => String(v || "").trim()).filter(Boolean);
}

export async function sendTransactionalEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  eventType = "email",
  eventId = "",
  idempotencyKey = "",
  maxRetries = 2,
  timeoutMs = 8000,
}) {
  const now = Date.now();
  pruneCache(now);

  const recipients = normalizeRecipients(to);
  if (!recipients.length) return { ok: false, skipped: true, reason: "No recipient" };

  const dedupeKey = String(
    idempotencyKey || `${eventType}:${eventId}:${recipients.join(",").toLowerCase()}:${String(subject || "").toLowerCase()}`
  ).trim();
  if (dedupeKey && sentKeyCache.has(dedupeKey)) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email:skipped]", {
        eventType,
        reason: "Duplicate suppressed",
        recipients,
        subject: String(subject || "Eventwow update"),
      });
    }
    return { ok: true, skipped: true, reason: "Duplicate suppressed" };
  }

  const client = getResendClient();
  const from = String(process.env.EMAIL_FROM || "").trim();
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[email:skipped]", { eventType, reason: "RESEND_API_KEY missing" });
    }
    return { ok: false, skipped: true, reason: "RESEND_API_KEY missing" };
  }
  if (!from) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[email:skipped]", { eventType, reason: "EMAIL_FROM missing" });
    }
    return { ok: false, skipped: true, reason: "EMAIL_FROM missing" };
  }

  const devOverride = String(process.env.DEV_EMAIL_OVERRIDE || "").trim();
  const effectiveRecipients = devOverride ? [devOverride] : recipients;

  const payload = {
    from,
    to: effectiveRecipients,
    subject: String(subject || "Eventwow update"),
    html: String(html || ""),
    text: String(text || ""),
    replyTo: String(replyTo || process.env.EMAIL_REPLY_TO || "").trim() || undefined,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await withTimeout(client.emails.send(payload), timeoutMs);
      if (result?.error) throw new Error(String(result.error?.message || result.error));

      if (dedupeKey) sentKeyCache.set(dedupeKey, now);
      if (process.env.NODE_ENV !== "production") {
        console.info("[email:sent]", {
          eventType,
          recipients: effectiveRecipients,
          subject: payload.subject,
          resendId: result?.data?.id || null,
          from: payload.from,
          devOverride: !!devOverride,
        });
      }
      return { ok: true, data: result?.data || null };
    } catch (err) {
      const message = String(err?.message || err);
      const isLast = attempt >= maxRetries;
      console.error("[email:failed]", {
        eventType,
        attempt: attempt + 1,
        recipients: effectiveRecipients,
        subject: payload.subject,
        error: message,
      });
      if (isLast) return { ok: false, error: message };
      await sleep(250 * (attempt + 1));
    }
  }

  return { ok: false, error: "Unknown email failure" };
}
