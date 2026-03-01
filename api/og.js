import { getOgPayload, renderOgHtml } from "../src/server/seo/og.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const type = String(req.query?.type || "home").trim().toLowerCase();
    const slug = String(req.query?.slug || "").trim();
    const payload = await getOgPayload(type, slug);
    const html = renderOgHtml(payload);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).send(html);
  } catch (err) {
    console.error("og endpoint crashed:", err);
    const html = renderOgHtml(await getOgPayload("home"));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  }
}
