import { useEffect, useState } from "react";
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

export default function SupplierSeoLandingPageRoute() {
  const { pathname } = useLocation();
  return <SupplierSeoLandingPage key={pathname} />;
}

function SupplierSeoLandingPage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({
    title: "Suppliers",
    description: "Find trusted suppliers.",
    canonical: `https://eventwow.co.uk/${slug || ""}`,
  });
  const [schema, setSchema] = useState(null);
  const [categorySlug, setCategorySlug] = useState("");

  useMarketingMeta({
    title: meta.title?.replace(/\s*\|\s*Eventwow$/i, "") || "Suppliers",
    description:
      meta.description || "Find trusted suppliers and request quotes.",
    path: `/${slug || ""}`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const json = await publicGet(
          `/api/public/seo/suppliers?slug=${encodeURIComponent(String(slug || ""))}&page=1&pageSize=36`,
        );
        if (!mounted) return;
        setRows(Array.isArray(json?.rows) ? json.rows : []);
        setMeta({
          title: json?.meta?.title || "Suppliers | Eventwow",
          description:
            json?.meta?.description || "Find trusted suppliers on Eventwow.",
          canonical:
            json?.meta?.canonical || `https://eventwow.co.uk/${slug || ""}`,
        });
        setSchema(json?.schema || null);
        setCategorySlug(String(json?.category_slug || ""));
      } catch (err) {
        if (mounted) {
          setRows([]);
          setSchema(null);
          setNotFound(err?.status === 404 || err?.status === 400);
          setError(err?.message || "Failed to load suppliers");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug, attempt]);

  useEffect(() => {
    injectJsonLd(schema);
    return () => injectJsonLd(null);
  }, [schema]);

  return (
    <MarketingShell landing>
      <div className="public-seo">
        <SeoLandingHeader
          title={meta.title?.replace(/\s*\|\s*Eventwow$/i, "") || "Suppliers"}
          subtitle="Find trusted suppliers and request quotes."
        />
        <section aria-label="Supplier results">
          <SeoResults
            loading={loading}
            error={error}
            notFound={notFound}
            onRetry={() => setAttempt((n) => n + 1)}
            empty={!rows.length}
            emptyTitle="We couldn't find suppliers for this location yet."
            emptyDescription="Try nearby locations or browse the full supplier directory."
            emptyActions={
              <>
                {categorySlug && (
                  <PublicButton as={Link} to={`/category/${categorySlug}`}>
                    Browse all in this category
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
