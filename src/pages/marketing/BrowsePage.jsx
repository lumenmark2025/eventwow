import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import SupplierCard from "../../components/marketing/SupplierCard";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function BrowsePage() {
  const [q, setQ] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchRows, setSearchRows] = useState([]);
  const [searchPagination, setSearchPagination] = useState({ page: 1, pageSize: 12, total: 0 });

  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [categories, setCategories] = useState([]);

  useMarketingMeta({
    title: "Browse suppliers",
    description: "Explore supplier categories and start your event request.",
    path: "/categories",
  });

  const trimmedQuery = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCategoriesLoading(true);
      setCategoriesError("");
      try {
        const resp = await fetch("/api/public/categories");
        const json = await resp.json().catch(() => []);
        if (!resp.ok) throw new Error("Failed to load categories");
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
  }, []);

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
        const resp = await fetch(`/api/public/suppliers/search?${params.toString()}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to search suppliers");
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
  }, [trimmedQuery]);

  return (
    <MarketingShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Browse suppliers</h1>
        <p className="mt-2 text-sm text-slate-600">Search trusted suppliers or jump into a category.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search suppliers, category, location..."
            className="sm:max-w-md"
          />
          <Button variant="secondary" disabled title="Coming soon">Filters (coming soon)</Button>
          <Button as={Link} to="/request">Post a request</Button>
        </div>

        <div className="mt-4">
          {trimmedQuery ? (
            <p className="text-sm text-slate-600">
              {searchPagination.total} result{searchPagination.total === 1 ? "" : "s"} for "{trimmedQuery}"
            </p>
          ) : null}
          {searchError ? <p className="mt-2 text-sm text-rose-600">{searchError}</p> : null}
        </div>
      </section>

      <section className="mt-6">
        {searchLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={`search-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="mt-3 h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-12 w-full" />
              </div>
            ))}
          </div>
        ) : trimmedQuery && searchRows.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {searchRows.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
          </div>
        ) : trimmedQuery ? (
          <Card>
            <CardContent className="p-4 text-sm text-slate-600">No suppliers found. Try a different search.</CardContent>
          </Card>
        ) : null}
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categoriesLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={`cat-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-3 h-10 w-full" />
              <Skeleton className="mt-3 h-10 w-full" />
            </div>
          ))
        ) : (
          categories.map((cat) => (
            <Card key={cat.slug}>
              <img
                src={cat.hero_image_url || "/assets/placeholders/category-default.svg"}
                alt={`${cat.display_name} suppliers`}
                className="h-28 w-full rounded-t-2xl object-cover"
                loading="lazy"
              />
              <CardHeader><CardTitle className="text-lg">{cat.display_name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">{cat.short_description || "Find vetted suppliers and compare structured quotes."}</p>
                <Button as={Link} to={`/categories/${encodeURIComponent(cat.slug)}`} variant="secondary" className="w-full">View category</Button>
              </CardContent>
            </Card>
          ))
        )}
      </section>
      {categoriesError ? <p className="mt-3 text-sm text-rose-600">{categoriesError}</p> : null}
    </MarketingShell>
  );
}
