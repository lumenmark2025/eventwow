import { Resend } from "resend";

export function createEmailClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendEmail({ to, subject, html, replyTo, eventKey }) {
  try {
    const client = createEmailClient();
    const from = process.env.EMAIL_FROM;

    if (!client) {
      return { ok: false, skipped: true, reason: "RESEND_API_KEY missing" };
    }
    if (!from) {
      return { ok: false, skipped: true, reason: "EMAIL_FROM missing" };
    }
    if (!to) {
      return { ok: false, skipped: true, reason: "No recipient" };
    }

    const payload = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };

    const effectiveReplyTo = replyTo || process.env.EMAIL_REPLY_TO;
    if (effectiveReplyTo) payload.replyTo = effectiveReplyTo;

    const result = await client.emails.send(payload);

    if (result?.error) {
      console.error("sendEmail failed:", { eventKey, error: result.error });
      return { ok: false, error: result.error };
    }

    return { ok: true, data: result?.data || null };
  } catch (err) {
    console.error("sendEmail crashed:", { eventKey, err });
    return { ok: false, error: String(err?.message || err) };
  }
}
