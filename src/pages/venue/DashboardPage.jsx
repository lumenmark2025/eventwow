import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Feedback,
  Skeleton,
} from "../../components/workspace/AdminPrimitives";
import {
  EmptyState,
  FilterBar,
} from "../../components/workspace/WorkspaceComponents";
import WorkspaceImage from "../../components/workspace/WorkspaceImage";

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  const headers = {
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  const resp = await fetch(path, { ...options, headers });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok)
    throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

export default function VenueDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((venue) =>
      `${venue.name || ""} ${venue.location_label || ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [rows, search]);

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
  }, [retry]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My venues"
        subtitle="Manage the venues linked to your account."
      />
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <Feedback onRetry={() => setRetry((value) => value + 1)}>
          {error}
        </Feedback>
      ) : rows.length === 0 ? (
        <div>
          <EmptyState
            title="No venues linked"
            description="Your account is not linked to any venues yet. Submit a claim from a venue page."
          />
          <div className="flex justify-center">
            <Button as={Link} to="/venues" variant="secondary">
              Browse venues
            </Button>
          </div>
        </div>
      ) : (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search venue or location"
            count={visibleRows.length}
          />
          {visibleRows.length === 0 ? (
            <EmptyState
              title="No matching venues"
              description="Try another venue name or location."
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {visibleRows.map((venue) => (
                <Card key={venue.id}>
                  <CardHeader>
                    <CardTitle>{venue.name || "Venue"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <WorkspaceImage
                      src={
                        venue.hero_image?.signed_url ||
                        venue.hero_image?.public_url
                      }
                      alt={venue.name || "Venue"}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="ew-form-help">
                        {venue.location_label || "Location not provided"}
                      </p>
                      <Badge
                        variant={
                          venue.status === "published"
                            ? "success"
                            : venue.status === "pending_review"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {venue.status === "published"
                          ? "Published"
                          : venue.status === "pending_review"
                            ? "Pending Review"
                            : "Draft"}
                      </Badge>
                    </div>
                    <p>
                      {venue.short_description ||
                        "Add a short description to introduce your venue."}
                    </p>
                    <Button
                      as={Link}
                      to={`/venue/${encodeURIComponent(venue.id)}/edit`}
                      variant="secondary"
                    >
                      Edit venue
                      <span className="sr-only">: {venue.name || "Venue"}</span>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
