import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { PublicButton } from "../../components/marketing/PublicComponents";
import {
  SeoLandingHeader,
  SeoResults,
  SeoSupplierResults,
  SeoPagination,
} from "../../components/marketing/PublicSeoComponents";
import { publicGet } from "../../lib/publicRequest";
import { useMarketingMeta } from "../../lib/marketingMeta";
import { slugify } from "../../utils/slugify";

function titleFromSlug(value) {
  const safe = slugify(value);
  if (!safe) return "";
  return safe
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampPage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

const PAGE_SIZE = 24;

export default function CategoryLandingPageRoute() {
  const { pathname } = useLocation();
  return <CategoryLandingPage key={pathname} />;
}

function CategoryLandingPage() {
  const { slug } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });

  const page = clampPage(searchParams.get("page") || "1");
  const fallbackTitle = useMemo(() => titleFromSlug(slug || ""), [slug]);
  const categoryName = category?.display_name || fallbackTitle || "Category";

  const totalPages = Math.max(
    1,
    Math.ceil(
      Number(pagination.total || 0) / Number(pagination.pageSize || PAGE_SIZE),
    ),
  );
  const safePage = Math.min(page, totalPages);

  useMarketingMeta({
    title: `${categoryName} in UK | Eventwow`,
    description:
      String(category?.short_description || "").trim() ||
      `Browse trusted ${categoryName.toLowerCase()} suppliers on Eventwow.`,
    path: `${location.pathname}${safePage > 1 ? `?page=${safePage}` : ""}`,
    canonicalPath: location.pathname,
  });

  const setPage = useCallback(
    (nextPage) => {
      const next = Math.max(1, Math.floor(Number(nextPage || 1)));
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (next <= 1) {
          params.delete("page");
        } else {
          params.set("page", String(next));
        }
        return params;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));
        const json = await publicGet(
          `/api/public/categories/${encodeURIComponent(slug || "")}/suppliers?${params.toString()}`,
        );
        if (!mounted) return;
        setCategory(json?.category || null);
        setSuppliers(Array.isArray(json?.suppliers) ? json.suppliers : []);
        setPagination({
          page: Number(json?.pagination?.page || page),
          pageSize: Number(json?.pagination?.pageSize || PAGE_SIZE),
          total: Number(json?.pagination?.total || 0),
        });
        const total = Number(json?.pagination?.total || 0);
        const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (page > lastPage) setPage(lastPage);
      } catch (err) {
        if (!mounted) return;
        setCategory(null);
        setSuppliers([]);
        setPagination({ page, pageSize: PAGE_SIZE, total: 0 });
        setNotFound(err?.status === 404);
        setError(err?.message || "Failed to load category suppliers");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug, page, setPage, attempt]);

  return (
    <MarketingShell landing>
      <div className="public-seo">
        <SeoLandingHeader
          title={categoryName}
          subtitle={
            category?.short_description ||
            `Discover trusted ${categoryName.toLowerCase()} suppliers ready to quote.`
          }
        />
        <nav className="public-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/suppliers">All suppliers</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{categoryName}</span>
        </nav>
        {!loading && !error && (
          <p className="public-seo-count">
            {Number(pagination.total || 0)} suppliers
          </p>
        )}
        <section aria-label="Category suppliers">
          <SeoResults
            loading={loading}
            error={error}
            notFound={notFound}
            onRetry={() => setAttempt((n) => n + 1)}
            empty={!suppliers.length}
            emptyTitle={`No ${categoryName.toLowerCase()} suppliers found yet`}
            emptyDescription="Try browsing all suppliers or post an enquiry and we will help match you."
            emptyActions={
              <>
                <PublicButton as={Link} to="/suppliers" variant="secondary">
                  Browse all suppliers
                </PublicButton>
                <PublicButton as={Link} to="/request">
                  Post an enquiry
                </PublicButton>
              </>
            }
          >
            <SeoSupplierResults rows={suppliers} />
            <SeoPagination
              page={page}
              safePage={safePage}
              totalPages={totalPages}
              onPage={setPage}
            />
          </SeoResults>
        </section>
      </div>
    </MarketingShell>
  );
}
