import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

function formatPercent(value) {
  const pct = Number(value || 0) * 100;
  return `${pct.toFixed(1)}%`;
}

function fromNow(iso) {
  if (!iso) return "-";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "-";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function authGet(url) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [funnel, setFunnel] = useState(null);
  const [supplierMetrics, setSupplierMetrics] = useState([]);
  const [recentLedger, setRecentLedger] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [funnelResp, supplierResp, ledgerResp] = await Promise.all([
          authGet("/api/admin-quote-funnel"),
          authGet("/api/admin-supplier-metrics"),
          authGet("/api/admin-credits-ledger?limit=8&offset=0"),
        ]);
        if (!mounted) return;
        setFunnel(funnelResp?.totals || null);
        setSupplierMetrics(supplierResp?.rows || []);
        setRecentLedger(ledgerResp?.rows || []);
      } catch (e) {
        if (mounted) setError(e?.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const creditsIssued30d = useMemo(
    () => recentLedger.filter((row) => Number(row.delta || 0) > 0).reduce((sum, row) => sum + Number(row.delta || 0), 0),
    [recentLedger]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" subtitle="Operational overview for credits and quote conversion." />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : (
          <>
            <StatCard label="Active suppliers (30d)" value={supplierMetrics.length} />
            <StatCard label="Credits issued (recent)" value={creditsIssued30d} hint="From latest ledger entries" />
            <StatCard label="Quotes sent (30d)" value={funnel?.sent ?? 0} />
            <StatCard label="Acceptance rate (30d)" value={formatPercent(funnel?.acceptance_rate)} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Recent credit activity">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : recentLedger.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No recent adjustments" description="Ledger entries will appear after credit changes." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Supplier</TH>
                        <TH>Delta</TH>
                        <TH>Reason</TH>
                        <TH>When</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {recentLedger.map((row) => (
                        <TR key={row.id}>
                          <TD>{row?.supplier?.business_name || "Supplier"}</TD>
                          <TD>
                            <Badge variant={Number(row.delta) >= 0 ? "success" : "danger"}>
                              {Number(row.delta) > 0 ? `+${row.delta}` : row.delta}
                            </Badge>
                          </TD>
                          <TD>{row.reason}</TD>
                          <TD className="text-slate-500">{fromNow(row.created_at)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </Section>

        <Section title="Top supplier performance">
          <Card>
            <CardHeader>
              <CardTitle>Acceptance leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : supplierMetrics.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No supplier metrics yet" description="Send quotes to populate performance stats." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Supplier</TH>
                        <TH>Sent</TH>
                        <TH>Accepted</TH>
                        <TH>Rate</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {[...supplierMetrics]
                        .sort((a, b) => b.acceptance_rate - a.acceptance_rate || b.quotes_sent - a.quotes_sent)
                        .slice(0, 8)
                        .map((row) => (
                          <TR key={row.supplier_id}>
                            <TD>{row?.supplier?.business_name || "Supplier"}</TD>
                            <TD>{row.quotes_sent}</TD>
                            <TD>{row.quotes_accepted}</TD>
                            <TD>
                              <Badge variant="brand">{formatPercent(row.acceptance_rate)}</Badge>
                            </TD>
                          </TR>
                        ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  );
}
