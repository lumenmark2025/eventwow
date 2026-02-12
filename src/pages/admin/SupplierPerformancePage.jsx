import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

async function authGet(url) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds == null) return "-";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export default function SupplierPerformancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("volume");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const json = await authGet("/api/admin-supplier-metrics");
        if (!mounted) return;
        setRows(json?.rows || []);
      } catch (e) {
        if (mounted) setError(e?.message || "Failed to load supplier performance");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let data = rows;
    if (q) {
      data = data.filter((row) => {
        const name = String(row?.supplier?.business_name || "").toLowerCase();
        const slug = String(row?.supplier?.slug || "").toLowerCase();
        return name.includes(q) || slug.includes(q);
      });
    }
    data = [...data];
    if (sortBy === "rate") {
      data.sort((a, b) => b.acceptance_rate - a.acceptance_rate || b.quotes_sent - a.quotes_sent);
    } else {
      data.sort((a, b) => b.quotes_sent - a.quotes_sent || b.acceptance_rate - a.acceptance_rate);
    }
    return data;
  }, [rows, search, sortBy]);

  return (
    <div className="space-y-6">
      <PageHeader title="Supplier Performance" subtitle="Quote funnel performance by supplier." />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Section
        title="Supplier metrics"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier..." className="min-w-[220px]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            >
              <option value="volume">Sort: Volume</option>
              <option value="rate">Sort: Acceptance rate</option>
            </select>
          </div>
        }
      >
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No suppliers found" description="Try a different search filter." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Supplier</TH>
                      <TH>Sent</TH>
                      <TH>Accepted</TH>
                      <TH>Declined</TH>
                      <TH>Closed</TH>
                      <TH>Acceptance</TH>
                      <TH>Avg to accept</TH>
                      <TH>Last sent</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((row) => (
                      <TR key={row.supplier_id}>
                        <TD>{row?.supplier?.business_name || row.supplier_id}</TD>
                        <TD>{row.quotes_sent}</TD>
                        <TD>{row.quotes_accepted}</TD>
                        <TD>{row.quotes_declined}</TD>
                        <TD>{row.quotes_closed}</TD>
                        <TD><Badge variant="brand">{formatPercent(row.acceptance_rate)}</Badge></TD>
                        <TD>{formatSeconds(row.avg_time_to_accept_seconds)}</TD>
                        <TD className="whitespace-nowrap text-slate-500">
                          {row.last_quote_sent_at ? new Date(row.last_quote_sent_at).toLocaleString() : "-"}
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
  );
}
