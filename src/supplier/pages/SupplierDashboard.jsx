import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/Badge";

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
    </div>
  );
}
