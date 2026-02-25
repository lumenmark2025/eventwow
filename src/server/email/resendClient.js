import { Resend } from "resend";

let cachedClient = null;

export function getResendClient() {
  if (cachedClient) return cachedClient;
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

