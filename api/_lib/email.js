import { sendTransactionalEmail } from "../../src/server/email/sendEmail.js";
import { getResendClient } from "../../src/server/email/resendClient.js";

export function createEmailClient() {
  return getResendClient();
}

export async function sendEmail({ to, subject, html, text, replyTo, eventKey }) {
  const result = await sendTransactionalEmail({
    to,
    subject,
    html,
    text,
    replyTo,
    eventType: "transactional",
    eventId: eventKey || "",
    idempotencyKey: eventKey || "",
  });
  if (!result.ok && !result.skipped) {
    console.error("sendEmail failed:", { eventKey, error: result.error });
  }
  return result;
}
