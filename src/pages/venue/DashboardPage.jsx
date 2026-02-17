import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  const headers = {
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  const resp = await fetch(path, { ...options, headers });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

export default function VenueDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const json = await apiFetch("/api/venue/my-venues");
        if (!mounted) return;
        setRows(Array.isArray(json?.rows) ? json.rows : []);
      } catch (err) {
        if (!mounted) return;
        setRows([]);
        setError(err?.message || "Failed to load venues");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="My venues" subtitle="Manage the venues linked to your account." />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No venues linked"
              description="Your account is not linked to any venues yet. Submit a claim from a venue page."
              action={<Button as={Link} to="/venues" variant="secondary">Browse venues</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((venue) => (
            <Card key={venue.id} className="overflow-hidden rounded-2xl">
              {venue.hero_image?.signed_url || venue.hero_image?.public_url ? (
                <img src={venue.hero_image?.signed_url || venue.hero_image?.public_url} alt={venue.name} className="h-36 w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-36 w-full bg-gradient-to-br from-slate-100 to-teal-50" />
              )}
              <CardHeader>
                <CardTitle className="text-xl">{venue.name || "Venue"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {venue.location_label ? <Badge variant="neutral">{venue.location_label}</Badge> : null}
                  <Badge
                    variant={
                      venue.status === "published"
                        ? "success"
                        : venue.status === "pending_review"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {venue.status === "published" ? "Published" : venue.status === "pending_review" ? "Pending Review" : "Draft"}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">
                  {venue.short_description || "Add a short description for better visibility."}
                </p>
                <Button as={Link} to={`/venue/${encodeURIComponent(venue.id)}/edit`} className="w-full">
                  Edit venue
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
