import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-slate-500">{hint}</CardContent>
    </Card>
  );
}

export default function SupplierDashboard({ supplier }) {
  const supplierId = supplier?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [stats, setStats] = useState({
    invitedCount: 0,
    activeEnquiriesCount: 0,
    quotesSentCount: 0,
    acceptedCount: 0,
    upcomingBookingsCount: 0,
  });

  const [creditsBalance, setCreditsBalance] = useState(0);
  const [creditHistory, setCreditHistory] = useState([]);
  const [bundleBusy, setBundleBusy] = useState("");
  const [bundleMsg, setBundleMsg] = useState("");
  const [performance, setPerformance] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [rankingTips, setRankingTips] = useState([]);

  async function startBundleCheckout(bundle) {
    if (bundleBusy) return;
    setBundleBusy(bundle);
    setErr("");
    setBundleMsg("");
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-create-credit-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bundle }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error([json?.error, json?.details].filter(Boolean).join(": ") || "Failed to start checkout");

      const checkoutUrl = String(json?.checkoutUrl || "").trim();
      if (!checkoutUrl) throw new Error("No checkout URL returned");
      window.location.assign(checkoutUrl);
    } catch (ex) {
      setErr(ex?.message || "Failed to start checkout");
    } finally {
      setBundleBusy("");
    }
  }

  useEffect(() => {
    if (!supplierId) return;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const today = new Date().toISOString().slice(0, 10);

        setCreditsBalance(supplier.credits_balance ?? 0);

        const { data: credits, error: creditErr } = await supabase
          .from("credit_transactions")
          .select("id, change, reason, created_at")
          .eq("supplier_id", supplierId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (creditErr) throw creditErr;
        setCreditHistory(credits || []);

        const { count: linkCount, error: linkErr } = await supabase
          .from("enquiry_suppliers")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId);
        if (linkErr) throw linkErr;

        const { count: activeCount, error: activeErr } = await supabase
          .from("enquiry_suppliers")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .not("supplier_status", "in", "(declined)");
        if (activeErr) throw activeErr;

        const { count: quotesSent, error: qErr } = await supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .in("status", ["sent", "accepted", "declined", "closed"]);
        if (qErr) throw qErr;

        const { count: accepted, error: aErr } = await supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .eq("status", "accepted");
        if (aErr) throw aErr;

        const { count: upcomingBookings, error: bErr } = await supabase
          .from("off_platform_bookings")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .gte("event_date", today)
          .in("status", ["tentative", "confirmed"]);
        if (bErr) throw bErr;

        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;
        const accessToken = sessionData?.session?.access_token;
        if (accessToken) {
          const perfResp = await fetch("/api/supplier-performance", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const perfJson = await perfResp.json().catch(() => ({}));
          if (perfResp.ok) {
            setPerformance(perfJson?.performance || null);
          }
          const rankingResp = await fetch("/api/supplier/ranking", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const rankingJson = await rankingResp.json().catch(() => ({}));
          if (rankingResp.ok) {
            setRanking(rankingJson?.ranking || null);
            setRankingTips(Array.isArray(rankingJson?.tips) ? rankingJson.tips : []);
          }
        }

        setStats({
          invitedCount: linkCount || 0,
          activeEnquiriesCount: activeCount || 0,
          quotesSentCount: quotesSent || 0,
          acceptedCount: accepted || 0,
          upcomingBookingsCount: upcomingBookings || 0,
        });
      } catch (ex) {
        setErr(ex?.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supplierId, supplier]);

  useEffect(() => {
    const status = String(searchParams.get("credits") || "").toLowerCase();
    if (!status) return;
    if (status === "success") {
      setBundleMsg("Payment completed. Credits are being applied.");
    }
    if (status === "cancel") {
      setBundleMsg("Credit purchase canceled.");
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("credits");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (err) return <div className="text-sm text-red-600">{err}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${supplier?.business_name ? `, ${supplier.business_name}` : ""}`}
        subtitle="Track requests, quote performance, credits and upcoming commitments."
      />

      <Section title="Snapshot" right={<Badge variant="brand">Live</Badge>}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Open requests" value={stats.activeEnquiriesCount} hint={`Linked total: ${stats.invitedCount}`} />
          <StatCard label="My quotes" value={stats.quotesSentCount} hint={`Accepted: ${stats.acceptedCount}`} />
          <StatCard label="My bookings" value={stats.upcomingBookingsCount} hint="Upcoming tentative + confirmed" />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Credits</CardDescription>
            <CardTitle className="text-4xl">{creditsBalance}</CardTitle>
          </CardHeader>
          <CardContent>
            {bundleMsg ? <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700">{bundleMsg}</div> : null}
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 text-sm font-medium text-slate-900">Buy credit bundles</div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => startBundleCheckout("credits_25")} disabled={!!bundleBusy}>
                  {bundleBusy === "credits_25" ? "Opening..." : "25 credits - GBP 12.50"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => startBundleCheckout("credits_50")} disabled={!!bundleBusy}>
                  {bundleBusy === "credits_50" ? "Opening..." : "50 credits - GBP 25.00"}
                </Button>
              </div>
            </div>

            <div className="mb-2 text-sm font-medium">Recent credit history</div>
            {creditHistory.length === 0 ? (
              <EmptyState title="No credit activity" description="Your credit transactions will appear here." />
            ) : (
              <div className="space-y-2">
                {creditHistory.slice(0, 8).map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-slate-800">{row.reason}</div>
                      <div className="text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString()}</div>
                    </div>
                    <Badge variant={row.change > 0 ? "success" : "danger"}>{row.change > 0 ? `+${row.change}` : row.change}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next moves</CardTitle>
            <CardDescription>Use this checklist to improve response speed and win rate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Open new requests and mark responses promptly.</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Keep quotes tidy and send with clear totals.</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Use close/reopen controls if your availability changes.</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your marketplace performance</CardTitle>
          <CardDescription>Your private ranking components and practical improvement tips.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Smoothed acceptance</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {Number.isFinite(Number(ranking?.smoothed_acceptance))
                ? `${Math.round(Number(ranking.smoothed_acceptance) * 100)}%`
                : "-"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Typical reply</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {Number.isFinite(Number(performance?.typicalResponseHours))
                ? `~${Number(performance.typicalResponseHours).toFixed(Number(performance.typicalResponseHours) < 10 ? 1 : 0)}h`
                : "-"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Base quality</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {Number.isFinite(Number(ranking?.base_quality))
                ? `${Math.round(Number(ranking.base_quality) * 100)} / 100`
                : "-"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Activity</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{ranking?.activity_label || "No recent activity data"}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Volume confidence</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{ranking?.volume_label || "Low"}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Response score</div>
            <div className="mt-1 text-sm font-medium text-slate-900">
              {Number.isFinite(Number(ranking?.response_score))
                ? `${Math.round(Number(ranking.response_score) * 100)} / 100`
                : "-"}
            </div>
          </div>
          <div className="md:col-span-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Tips</div>
            {(rankingTips || []).length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-slate-700">
                {rankingTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No urgent actions. Keep responding quickly and stay active.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
