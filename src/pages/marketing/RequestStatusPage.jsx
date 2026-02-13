import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { useMarketingMeta } from "../../lib/marketingMeta";

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function RequestStatusPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useMarketingMeta({
    title: "Your request",
    description: "Track supplier invite and quote progress for your enquiry.",
    path: `/request/${token || ""}`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/public-enquiry?token=${encodeURIComponent(String(token || ""))}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Request not found");
        if (!mounted) return;
        setData(json);
      } catch (err) {
        if (mounted) setError(err?.message || "Request not found");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <MarketingShell>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !data ? (
        <EmptyState title="Request not found" description={error || "Please submit a new request."} />
      ) : (
        <div className="space-y-5">
          {data?.invites?.[0]?.supplier?.name ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Request sent to {data.invites[0].supplier.name}.
            </div>
          ) : null}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">Your request is live</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>We’ve sent your request to <span className="font-semibold">{data.invitedCount}</span> suppliers.</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">Status: {data.enquiry?.status || "new"}</Badge>
                {data.enquiry?.eventDate ? <Badge variant="neutral">Event date: {data.enquiry.eventDate}</Badge> : null}
                {data.enquiry?.locationLabel ? <Badge variant="neutral">{data.enquiry.locationLabel}</Badge> : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-xl">Supplier activity</CardTitle>
            </CardHeader>
            <CardContent>
              {Array.isArray(data.invites) && data.invites.length > 0 ? (
                <div className="space-y-3">
                  {data.invites.map((invite) => (
                    <div key={invite.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{invite.supplier?.name || "Supplier"}</p>
                        <Badge variant="neutral">{invite.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Invited: {fmtDate(invite.invitedAt)}</p>
                      {invite.quote ? (
                        <p className="mt-1 text-sm text-slate-700">
                          Quote: {invite.quote.status} {invite.quote.total ? `- GBP ${Number(invite.quote.total || 0).toFixed(2)}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No suppliers invited yet.</p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button as={Link} to="/browse" variant="secondary">
              Browse suppliers
            </Button>
            <Button as={Link} to="/request">
              Submit another request
            </Button>
          </div>
        </div>
      )}
    </MarketingShell>
  );
}
