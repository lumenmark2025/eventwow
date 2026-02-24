import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { supabase } from "../../lib/supabase";

async function adminFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  const headers = {
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  return fetch(path, { ...options, headers });
}

async function adminFetchJsonWithFallback(primaryPath, fallbackPath, options = {}) {
  let primaryResp = null;
  try {
    primaryResp = await adminFetch(primaryPath, options);
    const primaryText = await primaryResp.text();
    const primaryJson = primaryText ? JSON.parse(primaryText) : {};
    if (primaryResp.ok) return { ok: true, json: primaryJson };
    if (primaryResp.status !== 404 || !fallbackPath) {
      const message = primaryJson?.details || primaryJson?.error || `Request failed (${primaryResp.status})`;
      return { ok: false, error: message };
    }
  } catch (err) {
    if (!fallbackPath) return { ok: false, error: err?.message || "Request failed" };
  }

  try {
    const fallbackResp = await adminFetch(fallbackPath, options);
    const fallbackText = await fallbackResp.text();
    const fallbackJson = fallbackText ? JSON.parse(fallbackText) : {};
    if (fallbackResp.ok) return { ok: true, json: fallbackJson };
    const message = fallbackJson?.details || fallbackJson?.error || `Request failed (${fallbackResp.status})`;
    return { ok: false, error: message };
  } catch (err) {
    return { ok: false, error: err?.message || "Request failed" };
  }
}

function statusBadge(status) {
  const v = String(status || "").toLowerCase();
  if (v === "saved") return <Badge variant="success">saved</Badge>;
  if (v === "error") return <Badge variant="danger">error</Badge>;
  if (v === "uploading") return <Badge variant="brand">uploading</Badge>;
  if (v === "generating") return <Badge variant="brand">generating</Badge>;
  if (v === "skipped") return <Badge variant="warning">skipped</Badge>;
  return <Badge variant="neutral">queued</Badge>;
}

export default function VenueHeroImagesPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [missingCount, setMissingCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [batchSize, setBatchSize] = useState(10);
  const [delayMs, setDelayMs] = useState(800);
  const [dryRun, setDryRun] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [lastSummary, setLastSummary] = useState(null);

  const progressText = useMemo(() => {
    if (!lastSummary) return "";
    return `Processed ${lastSummary.processed}, saved ${lastSummary.saved}, skipped ${lastSummary.skipped}, errors ${lastSummary.errors}`;
  }, [lastSummary]);

  async function loadPreview() {
    setLoading(true);
    setError("");
    try {
      const loaded = await adminFetchJsonWithFallback(
        "/api/admin/venues/generate-hero-images?limit=200",
        "/api/admin-venues?action=hero_images_preview&limit=200"
      );
      if (!loaded.ok) throw new Error(loaded.error || "Failed to load preview");
      const json = loaded.json || {};
      setMissingCount(Number(json?.missingCount || 0));
      setRows(Array.isArray(json?.preview) ? json.preview : []);
    } catch (err) {
      setError(err?.message || "Failed to load preview");
      setRows([]);
      setMissingCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreview();
  }, []);

  async function runGeneration() {
    setRunning(true);
    setError("");
    setSuccess("");
    setLastSummary(null);

    setRows((prev) => prev.map((row, idx) => (idx < Math.max(1, Number(batchSize || 1)) ? { ...row, status: "generating" } : row)));

    try {
      const payload = {
        batchSize: Number(batchSize || 10),
        delayMs: Number(delayMs || 0),
        dryRun: !!dryRun,
        overwrite: !!overwrite,
      };
      const loaded = await adminFetchJsonWithFallback(
        "/api/admin/venues/generate-hero-images",
        "/api/admin-venues",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate_hero_images", ...payload }),
        }
      );
      if (!loaded.ok) throw new Error(loaded.error || "Generation failed");
      const json = loaded.json || {};
      if (!Array.isArray(json?.results)) {
        throw new Error(json?.details || json?.error || "Generation failed");
      }

      const resultMap = new Map((json?.results || []).map((item) => [item.venueId, item]));
      const errorMap = new Map((json?.errors || []).map((item) => [item.venueId, item.message]));
      setRows((prev) => {
        const next = prev.map((row) => {
          const found = resultMap.get(row.venueId);
          if (!found) return row;
          return {
            ...row,
            status: found.status || row.status,
            url: found.url || "",
            message: errorMap.get(row.venueId) || "",
          };
        });
        for (const item of json?.results || []) {
          if (next.some((row) => row.venueId === item.venueId)) continue;
          next.unshift({
            venueId: item.venueId,
            name: item.name || "Venue",
            town: item.town || "",
            status: item.status || "queued",
            heroImageUrl: item.url || "",
            url: item.url || "",
            message: errorMap.get(item.venueId) || "",
          });
        }
        return next;
      });

      const summary = {
        processed: Number(json?.processed || 0),
        saved: Number(json?.saved || 0),
        skipped: Number(json?.skipped || 0),
        errors: Array.isArray(json?.errors) ? json.errors.length : 0,
      };
      setLastSummary(summary);
      setSuccess("Hero image generation batch completed.");
      await loadPreview();
    } catch (err) {
      setError(err?.message || "Generation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Venue Hero Images"
        subtitle="Generate AI placeholder hero images for venues missing hero_image_url."
        actions={[
          {
            key: "generate",
            label: running ? "Generating..." : "Generate Missing Hero Images",
            onClick: runGeneration,
            disabled: running || loading,
          },
        ]}
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Job controls</CardTitle>
          <CardDescription>Set safe batch controls before each run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Missing hero_image_url: {missingCount}</Badge>
            {progressText ? <Badge variant="brand">{progressText}</Badge> : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700">
              <span>Batch size</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(50, Number(e.target.value || 10))))}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Delay between generations (ms)</span>
              <Input
                type="number"
                min={0}
                max={5000}
                value={delayMs}
                onChange={(e) => setDelayMs(Math.max(0, Math.min(5000, Number(e.target.value || 0))))}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              Overwrite existing hero_image_url
            </label>
            <Button type="button" variant="secondary" onClick={loadPreview} disabled={loading || running}>
              Refresh count
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Requires server env vars: AI_API_KEY (or OPENAI_API_KEY), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
            Uses storage bucket <code>venue-hero-images</code> and writes to <code>venues.hero_image_url</code>.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>Queued and processed venues for this session.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="py-4 text-sm text-slate-600">Loading venues...</p>
          ) : rows.length === 0 ? (
            <p className="py-4 text-sm text-slate-600">No venues found for preview.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Venue</TH>
                    <TH>Town</TH>
                    <TH>Status</TH>
                    <TH>Final URL</TH>
                    <TH>Error</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.venueId}>
                      <TD className="font-medium text-slate-900">{row.name}</TD>
                      <TD>{row.town || "-"}</TD>
                      <TD>{statusBadge(row.status)}</TD>
                      <TD className="max-w-[420px] truncate text-xs text-slate-600">{row.url || row.heroImageUrl || "-"}</TD>
                      <TD className="max-w-[320px] truncate text-xs text-rose-700">{row.message || "-"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
