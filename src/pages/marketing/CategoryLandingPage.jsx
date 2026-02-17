import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import PageHeader from "../../components/layout/PageHeader";
import Button from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import SupplierCard from "../../components/marketing/SupplierCard";
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

export default function CategoryLandingPage() {
  const { slug } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });

  const page = clampPage(searchParams.get("page") || "1");
  const fallbackTitle = useMemo(() => titleFromSlug(slug || ""), [slug]);
  const categoryName = category?.display_name || fallbackTitle || "Category";

  const totalPages = Math.max(1, Math.ceil(Number(pagination.total || 0) / Number(pagination.pageSize || PAGE_SIZE)));
  const safePage = Math.min(page, totalPages);

  useMarketingMeta({
    title: categoryName,
    description:
      String(category?.short_description || "").trim() ||
      `Browse trusted ${categoryName.toLowerCase()} suppliers on Eventwow.`,
    path: `${location.pathname}${safePage > 1 ? `?page=${safePage}` : ""}`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));
        const resp = await fetch(`/api/public/categories/${encodeURIComponent(slug || "")}/suppliers?${params.toString()}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load category suppliers");
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
        setError(err?.message || "Failed to load category suppliers");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug, page]);

  function setPage(nextPage) {
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
  }

  return (
    <MarketingShell>
      <PageHeader
        title={categoryName}
        subtitle={category?.short_description || `Discover trusted ${categoryName.toLowerCase()} suppliers ready to quote.`}
      />

      <div className="mt-2">
        <p className="text-sm text-slate-600">{Number(pagination.total || 0)} suppliers</p>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      <section className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`category-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="mt-3 h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-12 w-full" />
                <Skeleton className="mt-3 h-10 w-full" />
              </div>
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <EmptyState
                title={`No ${categoryName.toLowerCase()} suppliers found yet`}
                description="Try browsing all suppliers or post an enquiry and we will help match you."
              />
              <div className="flex flex-wrap gap-2">
                <Button as={Link} to="/suppliers" variant="secondary">Browse all suppliers</Button>
                <Button as={Link} to="/request">Post an enquiry</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {suppliers.map((supplier) => (
                <SupplierCard key={supplier.id} supplier={supplier} />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="secondary" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {safePage} of {totalPages}
              </span>
              <Button variant="secondary" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </>
        )}
      </section>
    </MarketingShell>
  );
}
