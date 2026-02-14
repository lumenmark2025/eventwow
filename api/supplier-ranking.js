import {
  createAdminClient,
  getAuthUserId,
  getBearerToken,
  getEnv,
  getSupplierByAuthUser,
} from "./message-utils.js";
import { baseQualityScore } from "./_lib/ranking.js";

function toPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n * 100));
}

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
    const supplierId = supplierLookup.supplier.id;

    const [featureResp, marketResp] = await Promise.all([
      admin.from("supplier_rank_features_30d").select("supplier_id,quotes_sent_30d,accepted_30d,response_time_median_minutes_30d,last_active_at,smoothed_acceptance,response_score,activity_score,volume_score,base_quality").eq("supplier_id", supplierId).maybeSingle(),
      admin.from("marketplace_stats_30d").select("global_acceptance_rate_30d").maybeSingle(),
    ]);
    if (featureResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load rank features", details: featureResp.error.message });
    }
    if (marketResp.error) {
      return res.status(500).json({ ok: false, error: "Failed to load marketplace stats", details: marketResp.error.message });
    }

    const fr = featureResp.data || {};
    const features = Number.isFinite(Number(fr.base_quality))
      ? {
          smoothedAcceptance: Number(fr.smoothed_acceptance || 0),
          responseScore: Number(fr.response_score || 0),
          activityScore: Number(fr.activity_score || 0),
          volumeScore: Number(fr.volume_score || 0),
          baseQuality: Number(fr.base_quality || 0),
        }
      : baseQualityScore({
          accepted30d: fr.accepted_30d || 0,
          quotesSent30d: fr.quotes_sent_30d || 0,
          globalAcceptanceRate30d: Number(marketResp.data?.global_acceptance_rate_30d || 0),
          responseMinutes30d: fr.response_time_median_minutes_30d,
          lastActiveAt: fr.last_active_at,
        });

    const tips = [];
    if (features.responseScore < 0.5) tips.push("Median response time is high. Enable notifications and reply sooner.");
    if (features.activityScore < 0.5) tips.push("Activity score is low. Log in weekly to keep your profile fresh.");
    if (features.smoothedAcceptance < 0.45) tips.push("Acceptance score is low. Quote promptly and keep pricing competitive.");

    const volumeLabel = features.volumeScore < 0.35 ? "Low" : features.volumeScore < 0.7 ? "Medium" : "High";
    const activityLabel = features.activityScore < 0.5 ? "Not active in 14+ days" : "Active recently";

    return res.status(200).json({
      ok: true,
      ranking: {
        smoothed_acceptance: features.smoothedAcceptance,
        response_score: features.responseScore,
        activity_score: features.activityScore,
        volume_score: features.volumeScore,
        base_quality: features.baseQuality,
        base_quality_100: Math.round(toPercent(features.baseQuality)),
        last_active_at: fr.last_active_at || null,
        acceptance_percent: Math.round(toPercent(features.smoothedAcceptance)),
        response_bucket: features.responseScore < 0.5 ? "Needs improvement" : features.responseScore < 0.75 ? "Good" : "Excellent",
        activity_label: activityLabel,
        volume_label: volumeLabel,
      },
      tips,
    });
  } catch (err) {
    console.error("supplier-ranking crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
