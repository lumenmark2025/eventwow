import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import PageHeader from "../../components/layout/PageHeader";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import SupplierCard from "../../components/marketing/SupplierCard";
import { useMarketingMeta } from "../../lib/marketingMeta";

const CATEGORY_OPTIONS = ["All", "Event Supplier", "Pizza Catering", "Photographers", "DJs", "Venues", "Florists", "Bands"];
const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
];

export default function SuppliersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const q = String(searchParams.get("q") || "");
  const category = String(searchParams.get("category") || "All");
  const sort = String(searchParams.get("sort") || "recommended");

  useMarketingMeta({
    title: "Browse suppliers",
    description: "Find trusted event suppliers and request quotes fast.",
    path: "/suppliers",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category && category !== "All") params.set("category", category);
    params.set("sort", sort === "newest" ? "newest" : "recommended");
    params.set("limit", "24");
    params.set("offset", "0");
    return params.toString();
  }, [q, category, sort]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/public-suppliers?${queryString}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load suppliers");
        if (!mounted) return;
        setRows(json?.rows || []);
        setTotalCount(Number(json?.totalCount || 0));
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
  }, [queryString]);

  function setParam(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || String(value).trim() === "" || (key === "category" && value === "All")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }

  return (
    <MarketingShell>
      <PageHeader
        title="Browse suppliers"
        subtitle="Find trusted event suppliers and request quotes fast."
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="md:col-span-6">
            <Input
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Search by supplier name, category, or location"
              aria-label="Search suppliers"
            />
          </div>
          <div className="md:col-span-3">
            <select
              value={category}
              onChange={(e) => setParam("category", e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              aria-label="Filter by category"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              aria-label="Sort suppliers"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">{totalCount} suppliers</p>
        <Button variant="secondary" onClick={() => setSearchParams({}, { replace: true })}>Clear filters</Button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      <section className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="mt-3 h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-12 w-full" />
                <Skeleton className="mt-3 h-10 w-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No suppliers found" description="Try removing filters or searching a broader term." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} showFsa={false} />
            ))}
          </div>
        )}
      </section>
    </MarketingShell>
  );
}
