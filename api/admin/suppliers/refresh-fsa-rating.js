import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../_lib/adminAuth.js";
import { UUID_RE, parseBody } from "../../message-utils.js";
import { fetchFhrsEstablishment, parseFsaUrl } from "../../_lib/fsa.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const body = parseBody(req);
    const supplierId = String(body?.supplierId || body?.supplier_id || "").trim();
    if (!supplierId || !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid supplierId" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const supplierResp = await admin
      .from("suppliers")
      .select("id,fsa_rating_url,fsa_establishment_id")
      .eq("id", supplierId)
      .maybeSingle();

    if (supplierResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load supplier", details: supplierResp.error.message });
    }
    if (!supplierResp.data) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    let establishmentId = Number(supplierResp.data.fsa_establishment_id || 0);
    let ratingUrl = supplierResp.data.fsa_rating_url || null;

    if ((!Number.isInteger(establishmentId) || establishmentId <= 0) && ratingUrl) {
      const parsed = parseFsaUrl(ratingUrl);
      if (parsed?.error || !parsed.establishmentId) {
        return res.status(400).json({ ok: false, error: "Invalid FHRS link", details: parsed?.error || "Missing establishment id" });
      }
      establishmentId = parsed.establishmentId;
      ratingUrl = parsed.url;
    }

    if (!Number.isInteger(establishmentId) || establishmentId <= 0) {
      return res.status(400).json({ ok: false, error: "No FHRS establishment ID on supplier" });
    }

    const fetched = await fetchFhrsEstablishment(establishmentId);
    const updateResp = await admin
      .from("suppliers")
      .update({
        fsa_rating_url: ratingUrl,
        fsa_establishment_id: establishmentId,
        fsa_rating_value: fetched.ratingValue,
        fsa_rating_date: fetched.ratingDate,
        fsa_rating_last_fetched_at: fetched.lastFetchedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplierId)
      .select("id,is_insured,fsa_rating_url,fsa_establishment_id,fsa_rating_value,fsa_rating_date,fsa_rating_last_fetched_at")
      .maybeSingle();

    if (updateResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to update supplier FHRS data", details: updateResp.error.message });
    }

    return res.status(200).json({ ok: true, supplier: updateResp.data });
  } catch (err) {
    console.error("admin refresh fsa rating crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
