import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent } from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { toPublicImageUrl } from "../../lib/publicImageUrl";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function VenuesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const q = String(searchParams.get("q") || "");
  const sort = String(searchParams.get("sort") || "recommended");

  useMarketingMeta({
    title: "Browse venues",
    description: "Discover event venues and view trusted suppliers who work there.",
    path: "/venues",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("sort", sort === "newest" ? "newest" : "recommended");
    params.set("limit", "24");
    params.set("offset", "0");
    return params.toString();
  }, [q, sort]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/public-venues?${queryString}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load venues");
        if (!mounted) return;
        setRows(json?.rows || []);
        setTotalCount(Number(json?.totalCount || 0));
      } catch (err) {
        if (mounted) {
          setRows([]);
          setTotalCount(0);
          setError(err?.message || "Failed to load venues");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [queryString]);

  function setParam(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || String(value).trim() === "") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }

  function guestRange(venue) {
    const max = Number(venue?.guestMax);
    // Listing cards should only show a maximum guest count (and only if present in the profile).
    if (Number.isFinite(max) && max > 0) return `Up to ${max} guests`;
    return null;
  }

  return (
    <MarketingShell>
      <PageHeader
        title="Browse venues"
        subtitle="Find venue spaces and supplier-ready locations for your event."
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="md:col-span-8">
            <Input
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Search venues by name or location"
              aria-label="Search venues"
            />
          </div>
          <div className="md:col-span-4">
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              aria-label="Sort venues"
            >
              <option value="recommended">Recommended</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">{totalCount} venues</p>
        <Button variant="secondary" onClick={() => setSearchParams({}, { replace: true })}>Clear filters</Button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      <section className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`venue-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="mt-3 h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-12 w-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No venues found" description="Try removing filters or searching a broader term." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((venue) => {
              const hero = toPublicImageUrl(venue.heroImageUrl);
              const guest = guestRange(venue);
              return (
                <Card key={venue.id} className="overflow-hidden rounded-2xl">
                  {hero ? (
                    <img src={hero} alt={`${venue.name} cover`} className="h-36 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-36 bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50" />
                  )}
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <h3 className="line-clamp-1 text-lg font-semibold tracking-tight text-slate-900">{venue.name}</h3>
                      {venue.locationLabel ? <p className="mt-1 text-xs text-slate-500">{venue.locationLabel}</p> : null}
                    </div>
                    <div className="flex min-h-[26px] flex-wrap gap-1.5">
                      {guest ? <Badge variant="neutral">{guest}</Badge> : null}
                    </div>
                    <p className="line-clamp-2 text-sm text-slate-600">{venue.shortDescription || "Venue profile on Eventwow."}</p>
                    <Button as={Link} to={`/venues/${venue.slug}`} className="w-full">
                      View venue
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </MarketingShell>
  );
}
