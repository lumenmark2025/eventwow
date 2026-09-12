import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import {
  PublicButton,
  PublicSearch,
} from "../../components/marketing/PublicComponents";
import {
  SeoLandingHeader,
  SeoCategoryCard,
  SeoResults,
  SeoSupplierResults,
} from "../../components/marketing/PublicSeoComponents";
import { publicGet } from "../../lib/publicRequest";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function BrowsePage() {
  const [categoryAttempt, setCategoryAttempt] = useState(0);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchRows, setSearchRows] = useState([]);
  const [searchPagination, setSearchPagination] = useState({
    page: 1,
    pageSize: 12,
    total: 0,
  });

  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [categories, setCategories] = useState([]);

  useMarketingMeta({
    title: "Browse event categories | Eventwow",
    description:
      "Explore event service categories and discover trusted suppliers across the UK.",
    path: "/categories",
  });

  const trimmedQuery = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCategoriesLoading(true);
      setCategoriesError("");
      try {
        const json = await publicGet("/api/public/categories");
        if (!mounted) return;
        setCategories(Array.isArray(json) ? json : []);
      } catch (err) {
        if (!mounted) return;
        setCategories([]);
        setCategoriesError(err?.message || "Failed to load categories");
      } finally {
        if (mounted) setCategoriesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [categoryAttempt]);

  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(async () => {
      if (!trimmedQuery) {
        setSearchRows([]);
        setSearchPagination({ page: 1, pageSize: 12, total: 0 });
        setSearchError("");
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      setSearchError("");
      try {
        const params = new URLSearchParams();
        params.set("q", trimmedQuery);
        params.set("page", "1");
        params.set("pageSize", "12");
        const json = await publicGet(
          `/api/public/suppliers/search?${params.toString()}`,
        );
        if (!mounted) return;
        setSearchRows(Array.isArray(json?.suppliers) ? json.suppliers : []);
        setSearchPagination({
          page: Number(json?.pagination?.page || 1),
          pageSize: Number(json?.pagination?.pageSize || 12),
          total: Number(json?.pagination?.total || 0),
        });
      } catch (err) {
        if (!mounted) return;
        setSearchRows([]);
        setSearchPagination({ page: 1, pageSize: 12, total: 0 });
        setSearchError(err?.message || "Failed to search suppliers");
      } finally {
        if (mounted) setSearchLoading(false);
      }
    }, 300);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery, searchAttempt]);

  return (
    <MarketingShell landing>
      <div className="public-seo">
        <SeoLandingHeader
          title="Browse event categories"
          subtitle="Search trusted suppliers or jump into a category."
        >
          <PublicSearch
            label="Search suppliers, category, location"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSearchLoading(!!e.target.value.trim());
            }}
            placeholder="Search suppliers, category, location..."
          />
          <div className="public-seo-actions">
            <PublicButton variant="secondary" disabled title="Coming soon">
              Filters (coming soon)
            </PublicButton>
            <PublicButton as={Link} to="/request">
              Post a request
            </PublicButton>
          </div>
        </SeoLandingHeader>
        {trimmedQuery && (
          <section
            className="public-seo-search-results"
            aria-label="Supplier search results"
          >
            {!searchLoading && !searchError && (
              <p className="public-seo-count">
                {searchPagination.total} result
                {searchPagination.total === 1 ? "" : "s"} for "{trimmedQuery}"
              </p>
            )}
            <SeoResults
              loading={searchLoading}
              error={searchError}
              onRetry={() => setSearchAttempt((n) => n + 1)}
              empty={!searchRows.length}
              emptyTitle="No suppliers found. Try a different search."
            >
              <SeoSupplierResults rows={searchRows} />
            </SeoResults>
          </section>
        )}
        <section aria-label="Event categories">
          <SeoResults
            kind="categories"
            loading={categoriesLoading}
            error={categoriesError}
            onRetry={() => setCategoryAttempt((n) => n + 1)}
            empty={!categories.length}
            emptyTitle="No categories available yet."
          >
            <div className="public-seo-categories">
              {categories.map((cat) => (
                <SeoCategoryCard key={cat.slug} category={cat} />
              ))}
            </div>
          </SeoResults>
        </section>
      </div>
    </MarketingShell>
  );
}
