import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import SupplierCard from "../../components/marketing/SupplierCard";
import { useMarketingMeta } from "../../lib/marketingMeta";

function titleFromSlug(value) {
  const safe = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!safe) return "";
  return safe
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function CategoryLocationLandingPage() {
  const { categorySlug, locationSlug } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [resolvedCategory, setResolvedCategory] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState("");

  const categoryName = useMemo(() => titleFromSlug(categorySlug || ""), [categorySlug]);
  const locationName = useMemo(() => titleFromSlug(locationSlug || ""), [locationSlug]);

  const pageTitle = useMemo(() => {
    if (categoryName && locationName) return `${categoryName} in ${locationName}`;
    if (categoryName) return `${categoryName}`;
    if (locationName) return `Suppliers in ${locationName}`;
    return "Suppliers";
  }, [categoryName, locationName]);

  const pageDescription = useMemo(() => {
    if (categoryName && locationName) {
      return `Browse ${categoryName.toLowerCase()} suppliers in ${locationName}. Request quotes from trusted local vendors on Eventwow.`;
    }
    if (categoryName) {
      return `Browse ${categoryName.toLowerCase()} suppliers and request quotes from trusted vendors on Eventwow.`;
    }
    if (locationName) {
      return `Browse trusted suppliers in ${locationName} and request quotes on Eventwow.`;
    }
    return "Browse trusted suppliers and request quotes on Eventwow.";
  }, [categoryName, locationName]);

  useMarketingMeta({
    title: pageTitle,
    description: pageDescription,
    path: location.pathname,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (categorySlug) params.set("categorySlug", categorySlug);
        if (locationSlug) params.set("locationSlug", locationSlug);
        params.set("limit", "48");
        const resp = await fetch(`/api/public-suppliers-by-category-location?${params.toString()}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load suppliers");
        if (!mounted) return;
        setRows(Array.isArray(json?.rows) ? json.rows : []);
        setTotalCount(Number(json?.totalCount || 0));
        setResolvedCategory(String(json?.categoryName || categoryName || ""));
        setResolvedLocation(String(json?.locationName || locationName || ""));
      } catch (err) {
        if (mounted) {
          setRows([]);
          setTotalCount(0);
          setError(err?.message || "Failed to load suppliers");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [categorySlug, locationSlug, categoryName, locationName]);

  const finalCategory = resolvedCategory || categoryName;
  const finalLocation = resolvedLocation || locationName;

  return (
    <MarketingShell>
      <PageHeader
        title={finalCategory && finalLocation ? `${finalCategory} in ${finalLocation}` : pageTitle}
        subtitle={finalCategory && finalLocation ? `Find local ${finalCategory.toLowerCase()} suppliers near you and request quotes.` : "Find trusted suppliers and request quotes fast."}
      />

      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm text-slate-600">{totalCount} suppliers</p>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      <section className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`seo-supplier-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="mt-3 h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-12 w-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <EmptyState
                title={`We couldn't find any suppliers for ${finalCategory || "this category"}${finalLocation ? ` in ${finalLocation}` : ""} yet.`}
                description="Try browsing broader categories or nearby locations."
              />
              <div className="flex flex-wrap gap-2">
                {categorySlug ? (
                  <Button as={Link} to={`/category/${encodeURIComponent(categorySlug)}`}>
                    Browse all {finalCategory || "suppliers"}
                  </Button>
                ) : null}
                <Button as={Link} to="/suppliers" variant="secondary">Browse all suppliers</Button>
                <Button as={Link} to="/contact" variant="secondary">Are you a supplier? Join Eventwow</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
          </div>
        )}
      </section>
    </MarketingShell>
  );
}
