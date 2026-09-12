import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
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
        const resp = await fetch(
          `/api/public-venue?slug=${encodeURIComponent(String(slug || ""))}`,
        );
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
      const resp = await fetch(
        `/api/public/venues/${encodeURIComponent(String(slug || ""))}/claim-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to submit claim request",
        );
      setSuccess(
        json?.message ||
          "Thanks - if this email matches a claim request, you'll receive a link shortly.",
      );
      setForm((prev) => ({ ...prev, message: "" }));
    } catch (err) {
      setError(err?.message || "Failed to submit claim request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Claim this venue">
      <p className="auth-body auth-muted">
        Request management access for{" "}
        <span className="font-medium auth-ink">
          {loadingVenue ? "this venue" : venueName || "this venue"}
        </span>
        . Admin approval is required before access is granted.
      </p>

      <form className="space-y-3" onSubmit={submitClaim}>
        <label htmlFor="claim-name">Your name</label>
        <Input
          id="claim-name"
          value={form.requester_name}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, requester_name: e.target.value }))
          }
          placeholder="Your name"
          required
        />
        <label htmlFor="claim-email">Your email</label>
        <Input
          id="claim-email"
          type="email"
          value={form.requester_email}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, requester_email: e.target.value }))
          }
          placeholder="Your email"
          required
        />
        <label htmlFor="claim-role">Role at venue</label>
        <select
          id="claim-role"
          value={form.role_at_venue}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, role_at_venue: e.target.value }))
          }
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 auth-body"
          aria-label="Role at venue"
        >
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="events-team">Events team</option>
          <option value="other">Other</option>
        </select>
        <label htmlFor="claim-context">Context (optional)</label>
        <textarea
          id="claim-context"
          value={form.message}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, message: e.target.value }))
          }
          className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 auth-body shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          placeholder="Optional context (e.g., your role, website, proof of management)"
        />
        {error ? (
          <p role="alert" className="auth-body auth-error">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="auth-body auth-success">
            {success}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit claim request"}
          </Button>
          <Button
            as={Link}
            to={`/venues/${encodeURIComponent(String(slug || ""))}`}
            variant="secondary"
          >
            Back to venue
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
