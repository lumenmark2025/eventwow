import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function VenueClaimRequestPage() {
  const { slug } = useParams();
  const [venueName, setVenueName] = useState("");
  const [loadingVenue, setLoadingVenue] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    requester_name: "",
    requester_email: "",
    role_at_venue: "owner",
    message: "",
  });

  useMarketingMeta({
    title: "Claim this venue",
    description: "Request ownership access for this venue profile.",
    path: `/venues/${slug || ""}/claim`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingVenue(true);
      try {
        const resp = await fetch(`/api/public-venue?slug=${encodeURIComponent(String(slug || ""))}`);
        const json = await resp.json().catch(() => ({}));
        if (!mounted) return;
        if (resp.ok && json?.venue?.name) {
          setVenueName(json.venue.name);
        } else {
          setVenueName(String(slug || "").replace(/-/g, " "));
        }
      } catch {
        if (mounted) setVenueName(String(slug || "").replace(/-/g, " "));
      } finally {
        if (mounted) setLoadingVenue(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  async function submitClaim(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const resp = await fetch(`/api/public/venues/${encodeURIComponent(String(slug || ""))}/claim-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to submit claim request");
      setSuccess(json?.message || "Thanks - if this email matches a claim request, you'll receive a link shortly.");
      setForm((prev) => ({ ...prev, message: "" }));
    } catch (err) {
      setError(err?.message || "Failed to submit claim request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl">Claim this venue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Request management access for <span className="font-medium text-slate-900">{loadingVenue ? "this venue" : venueName || "this venue"}</span>.
              Admin approval is required before access is granted.
            </p>

            <form className="space-y-3" onSubmit={submitClaim}>
              <Input
                value={form.requester_name}
                onChange={(e) => setForm((prev) => ({ ...prev, requester_name: e.target.value }))}
                placeholder="Your name"
                required
              />
              <Input
                type="email"
                value={form.requester_email}
                onChange={(e) => setForm((prev) => ({ ...prev, requester_email: e.target.value }))}
                placeholder="Your email"
                required
              />
              <select
                value={form.role_at_venue}
                onChange={(e) => setForm((prev) => ({ ...prev, role_at_venue: e.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                aria-label="Role at venue"
              >
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="events-team">Events team</option>
                <option value="other">Other</option>
              </select>
              <textarea
                value={form.message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                placeholder="Optional context (e.g., your role, website, proof of management)"
              />
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit claim request"}</Button>
                <Button as={Link} to={`/venues/${encodeURIComponent(String(slug || ""))}`} variant="secondary">
                  Back to venue
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </MarketingShell>
  );
}

