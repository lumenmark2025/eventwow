import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { useMarketingMeta } from "../../lib/marketingMeta";
import { publicGet } from "../../lib/publicRequest";
import {
  PublicPageHeader,
  PublicSearch,
  PublicSelect,
  PublicFilterPanel,
  MarketplaceResults,
  PublicResultsState,
  PublicCallout,
  VenueCard,
} from "../../components/marketing/PublicComponents";

export default function VenuesPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const q = String(searchParams.get("q") || "");
  const sort = String(searchParams.get("sort") || "recommended");

  useMarketingMeta({
    title: "Event venues near you | Eventwow",
    description:
      "Discover event venues across the UK and compare options by location, style, and guest capacity.",
    path: `/venues${location.search || ""}`,
    canonicalPath: "/venues",
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
        const json = await publicGet(`/api/public-venues?${queryString}`);
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
  }, [queryString, retry]);

  function setParam(key, value) {
    setSearchParams(
      () => {
        // URL changes precede React commits. Preserve the latest filter when
        // controls change rapidly instead of merging a previous render snapshot.
        const next = new URLSearchParams(window.location.search);
        if (!value || String(value).trim() === "") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  const clear = () => setSearchParams({}, { replace: true });
  return (
    <MarketingShell>
      <PublicPageHeader
        breadcrumb="Venues"
        title="Event venues near you"
        subtitle={
          loading
            ? "Finding venues…"
            : error
              ? "Results unavailable"
              : `Showing ${rows.length} of ${totalCount} venues`
        }
      />
      <PublicSearch
        label="Search venues"
        value={q}
        onChange={(e) => setParam("q", e.target.value)}
        placeholder="Search venues by name or location…"
      />
      <MarketplaceResults
        kind="venues"
        filters={
          <PublicFilterPanel onClear={clear} active={!!location.search}>
            <PublicSelect
              label="Sort venues"
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
            >
              <option value="recommended">Recommended</option>
              <option value="newest">Newest</option>
            </PublicSelect>
            <p className="public-meta">
              Search by venue name or location. Explore each profile for
              capacity, facilities and event details.
            </p>
          </PublicFilterPanel>
        }
      >
        <PublicResultsState
          kind="venues"
          loading={loading}
          error={error}
          empty={!rows.length}
          onRetry={() => setRetry((n) => n + 1)}
          onClear={location.search ? clear : undefined}
        >
          <div className="public-venue-grid">
            {rows.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        </PublicResultsState>
      </MarketplaceResults>
      <PublicCallout
        title="Planning the rest of your event?"
        description="Explore catering, entertainment and other event suppliers."
        to="/suppliers"
        label="Find suppliers"
      />
    </MarketingShell>
  );
}
