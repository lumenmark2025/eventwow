import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function VenueClaimVerifyPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => String(params.get("token") || "").trim(), [params]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useMarketingMeta({
    title: "Venue claim verification",
    description: "Verify your venue claim request token.",
    path: "/claim/venue",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      setData(null);
      if (!token) {
        setLoading(false);
        setError("Missing claim token.");
        return;
      }
      try {
        const resp = await fetch(`/api/public/venue-claim/verify?token=${encodeURIComponent(token)}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Claim link is invalid or expired.");
        if (!mounted) return;
        setData(json);
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "Claim link is invalid or expired.");
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
      <div className="mx-auto max-w-2xl">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl">Venue claim status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-sm text-slate-600">Verifying claim link...</p> : null}
            {!loading && error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {!loading && data?.ok ? (
              <>
                <p className="text-sm text-slate-700">
                  Your claim request for <span className="font-medium text-slate-900">{data?.venue?.name || "this venue"}</span> is pending admin review.
                </p>
                <p className="text-sm text-slate-600">
                  We will notify <span className="font-medium text-slate-900">{data?.requester_email || "your email"}</span> once reviewed.
                </p>
              </>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {data?.venue?.slug ? (
                <Button as={Link} to={`/venues/${encodeURIComponent(data.venue.slug)}`} variant="secondary">Back to venue</Button>
              ) : null}
              <Button as={Link} to="/contact" variant="secondary">Contact support</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MarketingShell>
  );
}

