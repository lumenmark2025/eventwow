import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import SupplierCard from "../../components/marketing/SupplierCard";
import { useMarketingMeta } from "../../lib/marketingMeta";

function injectJsonLd(schema) {
  const id = "seo-itemlist-jsonld";
  const existing = document.getElementById(id);
  if (!schema) {
    if (existing?.parentNode) existing.parentNode.removeChild(existing);
    return;
  }
  const script = existing || document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.text = JSON.stringify(schema);
  if (!existing) document.head.appendChild(script);
}

export default function SupplierSeoLandingPage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ title: "Local Suppliers", description: "Find local suppliers.", canonical: `https://eventwow.co.uk/${slug || ""}` });
  const [schema, setSchema] = useState(null);
  const [categorySlug, setCategorySlug] = useState("");

  useMarketingMeta({
    title: meta.title?.replace(/\s*\|\s*Eventwow$/i, "") || "Local Suppliers",
    description: meta.description || "Find local suppliers and request quotes.",
    path: `/${slug || ""}`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/public/seo/suppliers?slug=${encodeURIComponent(String(slug || ""))}&page=1&pageSize=36`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load suppliers");
        if (!mounted) return;
        setRows(Array.isArray(json?.rows) ? json.rows : []);
        setMeta({
          title: json?.meta?.title || "Local Suppliers | Eventwow",
          description: json?.meta?.description || "Find local suppliers on Eventwow.",
          canonical: json?.meta?.canonical || `https://eventwow.co.uk/${slug || ""}`,
        });
        setSchema(json?.schema || null);
        setCategorySlug(String(json?.category_slug || ""));
      } catch (err) {
        if (mounted) {
          setRows([]);
          setSchema(null);
          setError(err?.message || "Failed to load suppliers");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    injectJsonLd(schema);
    return () => injectJsonLd(null);
  }, [schema]);

  return (
    <MarketingShell>
      <PageHeader
        title={meta.title?.replace(/\s*\|\s*Eventwow$/i, "") || "Local Suppliers"}
        subtitle="Find trusted local suppliers and request quotes."
      />

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
                title="We couldn't find suppliers for this location yet."
                description="Try nearby locations or browse the full supplier directory."
              />
              <div className="flex flex-wrap gap-2">
                {categorySlug ? <Button as={Link} to={`/category/${categorySlug}`}>Browse all in this category</Button> : null}
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
