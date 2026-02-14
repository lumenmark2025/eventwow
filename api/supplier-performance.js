import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
  getSupplierByAuthUser,
} from "./message-utils.js";
import { buildPerformanceSignals } from "./_lib/performanceSignals.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
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

    const auth = await getAuthUserId(SUPABASE_URL, ANON_KEY, token);
    if (auth.error || !auth.userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: auth.error });
    }

    const admin = createAdminClient(SUPABASE_URL, SERVICE_KEY);
    const supplierLookup = await getSupplierByAuthUser(admin, auth.userId);
    if (supplierLookup.error) {
      return res.status(500).json({
        ok: false,
        error: "Supplier lookup failed",
        details: supplierLookup.error.message,
      });
    }
    if (!supplierLookup.supplier) {
      return res.status(404).json({ ok: false, error: "Supplier not found" });
    }

    const perfResp = await admin
      .from("supplier_performance_30d")
      .select(
        "supplier_id,invites_count,quotes_sent_count,quotes_accepted_count,acceptance_rate,response_time_seconds_median,last_quote_sent_at,last_active_at"
      )
      .eq("supplier_id", supplierLookup.supplier.id)
      .maybeSingle();

    if (perfResp.error) {
      const code = String(perfResp.error.code || "");
      const message = String(perfResp.error.message || "");
      const missingView = code === "42P01" || message.toLowerCase().includes("supplier_performance_30d");
      if (!missingView) {
        return res.status(500).json({
          ok: false,
          error: "Failed to load supplier performance",
          details: perfResp.error.message,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      performance: buildPerformanceSignals((perfResp && perfResp.data) || null),
    });
  } catch (err) {
    console.error("supplier-performance crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
