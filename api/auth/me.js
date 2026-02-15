import { resolveAuthMe } from "../_lib/authMe.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    const me = await resolveAuthMe(req);
    if (!me.ok) return res.status(me.code).json({ ok: false, error: me.error, details: me.details });
    return res.status(200).json({ ok: true, ...me.data });
  } catch (err) {
    console.error("auth/me crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
