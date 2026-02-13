import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/Badge";
import { useMarketingMeta } from "../../lib/marketingMeta";
import { toPublicImageUrl } from "../../lib/publicImageUrl";

export default function SupplierProfilePage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [supplier, setSupplier] = useState(null);

  useMarketingMeta({
    title: supplier?.name ? `${supplier.name}` : "Supplier profile",
    description: supplier?.shortDescription || "Supplier profile on Eventwow.",
    path: `/suppliers/${slug || ""}`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const resp = await fetch(`/api/public-supplier?slug=${encodeURIComponent(String(slug || ""))}`);
        const json = await resp.json().catch(() => ({}));
        if (resp.status === 404) {
          if (!mounted) return;
          setSupplier(null);
          setNotFound(true);
          return;
        }
        if (!resp.ok) throw new Error(json?.details || json?.error || "Supplier not found");
        if (!mounted) return;
        setSupplier(json?.supplier || null);
      } catch (err) {
        if (mounted) {
          setSupplier(null);
          setError(err?.message || "Supplier not found");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const heroImageUrl = toPublicImageUrl(supplier?.heroImageUrl);

  return (
    <MarketingShell>
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-52 w-full rounded-3xl" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-60 w-full rounded-3xl lg:col-span-2" />
            <Skeleton className="h-60 w-full rounded-3xl" />
          </div>
        </div>
      ) : !supplier ? (
        <div className="space-y-4">
          <EmptyState
            title={notFound ? "Supplier not found" : "Supplier profile unavailable"}
            description={notFound ? "This supplier profile is unavailable or not published." : error || "Please return to suppliers list."}
          />
          <Button as={Link} to="/suppliers" variant="secondary">
            Back to suppliers
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {heroImageUrl ? (
              <img src={heroImageUrl} alt={`${supplier.name} hero`} className="h-56 w-full object-cover sm:h-72" loading="lazy" />
            ) : (
              <div className="h-56 w-full bg-gradient-to-br from-slate-100 via-white to-teal-50 sm:h-72" />
            )}
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {(supplier.categories || []).map((category) => (
                  <Badge key={category.slug} variant="brand">{category.name}</Badge>
                ))}
                {supplier.locationLabel ? <Badge variant="neutral">{supplier.locationLabel}</Badge> : null}
                <Badge variant="neutral">Response time: within 24h</Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{supplier.name}</h1>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                {supplier.shortDescription || "Trusted event supplier on Eventwow."}
              </p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-xl">About</CardTitle>
                </CardHeader>
                <CardContent className="pt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
                  {supplier.about || "Detailed business profile coming soon."}
                </CardContent>
              </Card>

              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-xl">Services</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  {Array.isArray(supplier.services) && supplier.services.length > 0 ? (
                    <ul className="space-y-2 text-sm text-slate-700 sm:text-base">
                      {supplier.services.map((service) => (
                        <li key={service} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <span>{service}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-600">Service highlights coming soon.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-xl">Gallery</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  {Array.isArray(supplier.gallery) && supplier.gallery.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {supplier.gallery.map((item, idx) => (
                        (() => {
                          const galleryUrl = toPublicImageUrl(item.url);
                          if (!galleryUrl) return null;
                          return (
                        <div key={`${item.url}-${idx}`} className="overflow-hidden rounded-2xl border border-slate-200">
                          <img src={galleryUrl} alt={item.alt || supplier.name} className="h-28 w-full object-cover sm:h-32" loading="lazy" />
                        </div>
                          );
                        })()
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Photos coming soon.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-xl">Reviews</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                    Reviews coming soon.
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="sticky top-24 rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-xl">Request a quote</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <p className="text-sm text-slate-600">
                    Tell us your event details and receive a tailored quote from this supplier.
                  </p>
                  <Button as={Link} to="/browse" className="w-full">
                    Request a quote
                  </Button>
                  <Button as={Link} to="/suppliers" variant="secondary" className="w-full">
                    Back to suppliers
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      )}
    </MarketingShell>
  );
}
