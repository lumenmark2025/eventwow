import { createClient } from "@supabase/supabase-js";
import { resolveAuthMe } from "../../_lib/authMe.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const me = await resolveAuthMe(req);
    if (!me.ok) return res.status(me.code).json({ ok: false, error: me.error, details: me.details });
    if (me.data.role !== "customer" || !me.data.customer_id) {
      return res.status(403).json({ ok: false, error: "Forbidden (customer only)" });
    }

    const admin = createClient(me.supabaseUrl, me.serviceKey, { auth: { persistSession: false } });
    const resp = await admin
      .from("enquiries")
      .select("id,status,event_date,guest_count,venue_name,location_label,enquiry_category_slug,created_at")
      .eq("customer_id", me.data.customer_id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (resp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load enquiries", details: resp.error.message });
    }

    const rows = (resp.data || []).map((row) => ({
      id: row.id,
      status: row.status || "new",
      eventDate: row.event_date || null,
      guestCount: row.guest_count ?? null,
      venueName: row.venue_name || row.location_label || null,
      categorySlug: row.enquiry_category_slug || null,
      createdAt: row.created_at || null,
    }));

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    console.error("customer enquiries list crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
