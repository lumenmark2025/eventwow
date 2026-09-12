import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import SupplierCard from "../../components/marketing/SupplierCard";
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
} from "../../components/marketing/PublicComponents";

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
];

export default function SuppliersPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [optionsError, setOptionsError] = useState("");
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
    description:
      "Find trusted event suppliers across the UK and request personalised quotes directly.",
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
    if (category && category !== "All" && !unique.includes(category))
      unique.push(category);
    return ["All", ...unique];
  }, [categories, category]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const json = await publicGet(`/api/public-suppliers?${queryString}`);
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
  }, [queryString, retry]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setOptionsError("");
        const json = await publicGet("/api/public/categories/options");
        if (!mounted) return;
        setCategories(Array.isArray(json) ? json : []);
      } catch {
        if (mounted) {
          setCategories([]);
          setOptionsError("Category options are unavailable.");
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [optionsRetry]);

  function setParam(key, value) {
    setSearchParams(
      () => {
        // URL changes precede React commits. Preserve the latest filter when
        // controls change rapidly instead of merging a previous render snapshot.
        const next = new URLSearchParams(window.location.search);
        if (
          !value ||
          String(value).trim() === "" ||
          (key === "category" && value === "All")
        ) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  const clear = () => setSearchParams({}, { replace: true });
  return (
    <MarketingShell>
      <PublicPageHeader
        breadcrumb="Suppliers"
        title={
          category !== "All"
            ? `${category} suppliers${locationFilter ? ` in ${locationFilter}` : ""}`
            : "Event suppliers near you"
        }
        subtitle={
          loading
            ? "Finding suppliers…"
            : error
              ? "Results unavailable"
              : `Showing ${rows.length} of ${totalCount} suppliers`
        }
      />
      <PublicSearch
        label="Search suppliers"
        placeholder="Search suppliers, services or locations…"
        value={q}
        onChange={(e) => setParam("q", e.target.value)}
      />
      <MarketplaceResults
        kind="suppliers"
        filters={
          <PublicFilterPanel onClear={clear} active={!!location.search}>
            <PublicSelect
              label="Category"
              value={category}
              onChange={(e) => setParam("category", e.target.value)}
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All categories" : option}
                </option>
              ))}
            </PublicSelect>
            {optionsError && (
              <p role="alert" className="public-meta">
                {optionsError}{" "}
                <button
                  className="public-text-link"
                  onClick={() => setOptionsRetry((n) => n + 1)}
                >
                  Retry categories
                </button>
              </p>
            )}
            <label className="public-field">
              <span>Location</span>
              <input
                value={locationFilter}
                placeholder="Town or area"
                onChange={(e) => setParam("location", e.target.value)}
              />
            </label>
            <PublicSelect
              label="Sort suppliers"
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </PublicSelect>
          </PublicFilterPanel>
        }
        help={
          <PublicCallout
            compact
            title="Need help choosing?"
            description="Share your event details and receive personalised supplier quotes."
          />
        }
      >
        <PublicResultsState
          kind="suppliers"
          loading={loading}
          error={error}
          empty={!rows.length}
          onRetry={() => setRetry((n) => n + 1)}
          onClear={location.search ? clear : undefined}
        >
          <div className="public-supplier-list">
            {rows.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                showFsa={false}
                layout="list"
              />
            ))}
          </div>
        </PublicResultsState>
      </MarketplaceResults>
      <PublicCallout />
      <PublicCallout
        title="Are you an event supplier?"
        description="Join EventWow and receive direct enquiries from customers planning events."
        to="/supplier/signup"
        label="Become a supplier"
      />
    </MarketingShell>
  );
}
