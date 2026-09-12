import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { PublicButton } from "../../components/marketing/PublicComponents";
import {
  SeoLandingHeader,
  SeoResults,
  SeoSupplierResults,
} from "../../components/marketing/PublicSeoComponents";
import { publicGet } from "../../lib/publicRequest";
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

export default function CategoryLocationLandingPageRoute() {
  const { pathname } = useLocation();
  return <CategoryLocationLandingPage key={pathname} />;
}

function CategoryLocationLandingPage() {
  const { categorySlug, locationSlug } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [resolvedCategory, setResolvedCategory] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState("");

  const categoryName = useMemo(
    () => titleFromSlug(categorySlug || ""),
    [categorySlug],
  );
  const locationName = useMemo(
    () => titleFromSlug(locationSlug || ""),
    [locationSlug],
  );

  const pageTitle = useMemo(() => {
    if (categoryName && locationName)
      return `${categoryName} in ${locationName}`;
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
    title: `${pageTitle} | Eventwow`,
    description: pageDescription,
    path: location.pathname,
    canonicalPath: location.pathname,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const params = new URLSearchParams();
        if (categorySlug) params.set("categorySlug", categorySlug);
        if (locationSlug) params.set("locationSlug", locationSlug);
        params.set("limit", "48");
        const json = await publicGet(
          `/api/public-suppliers-by-category-location?${params.toString()}`,
        );
        if (!mounted) return;
        setRows(Array.isArray(json?.rows) ? json.rows : []);
        setTotalCount(Number(json?.totalCount || 0));
        setResolvedCategory(String(json?.categoryName || categoryName || ""));
        setResolvedLocation(String(json?.locationName || locationName || ""));
      } catch (err) {
        if (mounted) {
          setRows([]);
          setTotalCount(0);
          setNotFound(err?.status === 404);
          setError(err?.message || "Failed to load suppliers");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [categorySlug, locationSlug, categoryName, locationName, attempt]);

  const finalCategory = resolvedCategory || categoryName;
  const finalLocation = resolvedLocation || locationName;

  return (
    <MarketingShell landing>
      <div className="public-seo">
        <SeoLandingHeader
          title={
            finalCategory && finalLocation
              ? `${finalCategory} in ${finalLocation}`
              : pageTitle
          }
          subtitle={
            finalCategory && finalLocation
              ? `Find local ${finalCategory.toLowerCase()} suppliers near you and request quotes.`
              : "Find trusted suppliers and request quotes fast."
          }
        />
        <nav className="public-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/suppliers">All suppliers</Link>
          {categorySlug && (
            <>
              <span aria-hidden="true">/</span>
              <Link to={`/category/${encodeURIComponent(categorySlug)}`}>
                {finalCategory || "Category"}
              </Link>
            </>
          )}
        </nav>
        {!loading && !error && (
          <p className="public-seo-count">{totalCount} suppliers</p>
        )}
        <section aria-label="Local suppliers">
          <SeoResults
            loading={loading}
            error={error}
            notFound={notFound}
            onRetry={() => setAttempt((n) => n + 1)}
            empty={!rows.length}
            emptyTitle={`We couldn't find any suppliers for ${finalCategory || "this category"}${finalLocation ? ` in ${finalLocation}` : ""} yet.`}
            emptyDescription="Try browsing broader categories or nearby locations."
            emptyActions={
              <>
                {categorySlug && (
                  <PublicButton
                    as={Link}
                    to={`/category/${encodeURIComponent(categorySlug)}`}
                  >
                    Browse all {finalCategory || "suppliers"}
                  </PublicButton>
                )}
                <PublicButton as={Link} to="/suppliers" variant="secondary">
                  Browse all suppliers
                </PublicButton>
                <PublicButton as={Link} to="/contact" variant="secondary">
                  Are you a supplier? Join Eventwow
                </PublicButton>
              </>
            }
          >
            <SeoSupplierResults rows={rows} />
          </SeoResults>
        </section>
      </div>
    </MarketingShell>
  );
}
