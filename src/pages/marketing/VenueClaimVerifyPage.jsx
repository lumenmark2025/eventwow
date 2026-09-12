import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import Button from "../../components/ui/Button";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function VenueClaimVerifyPage() {
  const [params] = useSearchParams();
  const token = useMemo(
    () => String(params.get("token") || "").trim(),
    [params],
  );
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
        const resp = await fetch(
          `/api/public/venue-claim/verify?token=${encodeURIComponent(token)}`,
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok)
          throw new Error(
            json?.details || json?.error || "Claim link is invalid or expired.",
          );
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
    <AuthShell title="Venue claim status">
      {loading ? (
        <p role="status" className="auth-body auth-muted">
          Verifying claim link...
        </p>
      ) : null}
      {!loading && error ? (
        <p role="alert" className="auth-body auth-error">
          {error}
        </p>
      ) : null}
      {!loading && data?.ok ? (
        <>
          <p className="auth-body auth-ink">
            Your claim request for{" "}
            <span className="font-medium auth-ink">
              {data?.venue?.name || "this venue"}
            </span>{" "}
            is pending admin review.
          </p>
          <p className="auth-body auth-muted">
            We will notify{" "}
            <span className="font-medium auth-ink">
              {data?.requester_email || "your email"}
            </span>{" "}
            once reviewed.
          </p>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {data?.venue?.slug ? (
          <Button
            as={Link}
            to={`/venues/${encodeURIComponent(data.venue.slug)}`}
            variant="secondary"
          >
            Back to venue
          </Button>
        ) : null}
        <Button as={Link} to="/contact" variant="secondary">
          Contact support
        </Button>
      </div>
    </AuthShell>
  );
}
