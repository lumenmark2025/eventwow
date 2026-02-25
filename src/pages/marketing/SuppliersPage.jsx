import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import SupplierCard from "../../components/marketing/SupplierCard";
import { useMarketingMeta } from "../../lib/marketingMeta";

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
];

export default function SuppliersPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);

  const q = String(searchParams.get("q") || "");
  const locationFilter = String(searchParams.get("location") || "");
  const category = String(searchParams.get("category") || "All");
  const sort = String(searchParams.get("sort") || "recommended");

  useMarketingMeta({
    title: "Event suppliers near you | Eventwow",
    description: "Find trusted event suppliers across the UK and request personalised quotes directly.",
    path: `/suppliers${location.search || ""}`,
    canonicalPath: "/suppliers",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (locationFilter.trim()) params.set("location", locationFilter.trim());
    if (category && category !== "All") params.set("category", category);
    params.set("sort", sort === "newest" ? "newest" : "recommended");
    params.set("limit", "24");
    params.set("offset", "0");
    return params.toString();
  }, [q, locationFilter, category, sort]);

  const categoryOptions = useMemo(() => {
    const names = (Array.isArray(categories) ? categories : [])
      .map((row) => String(row?.display_name || "").trim())
      .filter(Boolean);
    const unique = [...new Set(names)];
    if (category && category !== "All" && !unique.includes(category)) unique.push(category);
    return ["All", ...unique];
  }, [categories, category]);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch("/api/public/categories/options");
        const json = await resp.json().catch(() => []);
        if (!resp.ok) throw new Error("Failed to load category options");
        if (!mounted) return;
        setCategories(Array.isArray(json) ? json : []);
      } catch {
        if (mounted) setCategories([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
      <section className="rounded-3xl bg-[radial-gradient(circle_at_top_left,#2563eb_0%,#1d4ed8_45%,#60a5fa_100%)] p-8 text-white shadow-lg sm:p-10">
        <h1 className="text-4xl font-semibold tracking-tight">Event suppliers near you</h1>
        <p className="mt-3 text-base text-white/90">Find trusted event suppliers and request quotes fast.</p>
      </section>

      <section className="mt-6 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
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
              {categoryOptions.map((option) => (
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

      <section className="mt-12 rounded-3xl bg-[radial-gradient(circle_at_top_right,#60a5fa_0%,#2563eb_40%,#1d4ed8_100%)] p-8 text-center text-white shadow-lg">
        <h2 className="text-4xl font-semibold tracking-tight">Are you an event supplier?</h2>
        <p className="mx-auto mt-3 max-w-3xl text-base text-white/90">
          Join Eventwow and receive direct enquiries from customers planning real events. No high commission percentages.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <Button as={Link} to="/supplier/signup" variant="secondary" className="border-white/45 bg-white/10 text-white hover:bg-white/20">
            Become a supplier
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
