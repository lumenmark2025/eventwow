import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";
import SupplierCard from "../../components/marketing/SupplierCard";
import { useMarketingMeta } from "../../lib/marketingMeta";
import { toPublicImageUrl } from "../../lib/publicImageUrl";

function guestRange(venue) {
  const min = Number(venue?.guestMin);
  const max = Number(venue?.guestMax);
  if (Number.isFinite(min) && Number.isFinite(max)) return `${min}-${max} guests`;
  if (Number.isFinite(min)) return `${min}+ guests`;
  if (Number.isFinite(max)) return `Up to ${max} guests`;
  return null;
}

export default function VenueProfilePage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [venue, setVenue] = useState(null);
  const [linkedSuppliers, setLinkedSuppliers] = useState([]);

  useMarketingMeta({
    title: venue?.name ? venue.name : "Venue profile",
    description: venue?.shortDescription || "Venue profile on Eventwow.",
    path: `/venues/${slug || ""}`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const resp = await fetch(`/api/public-venue?slug=${encodeURIComponent(String(slug || ""))}`);
        const json = await resp.json().catch(() => ({}));
        if (resp.status === 404) {
          if (!mounted) return;
          setNotFound(true);
          return;
        }
        if (!resp.ok) throw new Error(json?.details || json?.error || "Venue not found");
        if (!mounted) return;
        setVenue(json?.venue || null);
        setLinkedSuppliers(json?.linkedSuppliers || []);
      } catch (err) {
        if (mounted) setError(err?.message || "Venue not found");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const heroImageUrl = toPublicImageUrl(venue?.heroImageUrl);
  const range = guestRange(venue);

  return (
    <MarketingShell>
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-56 w-full rounded-3xl" />
          <Skeleton className="h-80 w-full rounded-3xl" />
        </div>
      ) : !venue ? (
        <div className="space-y-4">
          <EmptyState
            title={notFound ? "Venue not found" : "Venue unavailable"}
            description={notFound ? "This venue profile is unavailable or not published." : error || "Please return to venues list."}
          />
          <Button as={Link} to="/venues" variant="secondary">Back to venues</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {heroImageUrl ? (
              <img src={heroImageUrl} alt={`${venue.name} hero`} className="h-56 w-full object-cover sm:h-72" loading="lazy" />
            ) : (
              <div className="h-56 w-full bg-gradient-to-br from-slate-100 via-white to-teal-50 sm:h-72" />
            )}
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {venue.locationLabel ? <Badge variant="neutral">{venue.locationLabel}</Badge> : null}
                {range ? <Badge variant="brand">{range}</Badge> : null}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{venue.name}</h1>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                {venue.shortDescription || "Premium venue listing on Eventwow."}
              </p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card className="rounded-3xl">
                <CardHeader><CardTitle className="text-xl">About</CardTitle></CardHeader>
                <CardContent className="pt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
                  {venue.about || "More venue details coming soon."}
                </CardContent>
              </Card>

              <Card className="rounded-3xl">
                <CardHeader><CardTitle className="text-xl">Gallery</CardTitle></CardHeader>
                <CardContent className="pt-2">
                  {Array.isArray(venue.gallery) && venue.gallery.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {venue.gallery.map((item, idx) => {
                        const galleryUrl = toPublicImageUrl(item.url);
                        if (!galleryUrl) return null;
                        return (
                          <div key={`${galleryUrl}-${idx}`} className="overflow-hidden rounded-2xl border border-slate-200">
                            <img src={galleryUrl} alt={item.caption || venue.name} className="h-28 w-full object-cover sm:h-32" loading="lazy" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Photos coming soon.
                    </div>
                  )}
                </CardContent>
              </Card>

              {linkedSuppliers.length > 0 ? (
                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle className="text-xl">Suppliers who work well at this venue</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {linkedSuppliers.map((supplier) => (
                        <SupplierCard
                          key={supplier.supplierId}
                          supplier={{
                            id: supplier.supplierId,
                            slug: supplier.slug,
                            name: supplier.name,
                            heroImageUrl: supplier.heroImageUrl,
                            shortDescription: supplier.shortDescription,
                            locationLabel: supplier.locationLabel,
                            categoryBadges: supplier.categories || [],
                            performance: supplier.performance || null,
                            reviewRating: supplier.reviewRating,
                            reviewCount: supplier.reviewCount,
                          }}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div>
              <Card className="sticky top-24 rounded-3xl">
                <CardHeader><CardTitle className="text-xl">Request quotes for this venue</CardTitle></CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <p className="text-sm text-slate-600">
                    Need catering, photography, music, or decor for this venue? Send one request and compare quotes.
                  </p>
                  <Button as={Link} to={`/request?venue=${encodeURIComponent(String(venue.slug || ""))}`} className="w-full">
                    Request quotes
                  </Button>
                  <Button as={Link} to="/venues" variant="secondary" className="w-full">Back to venues</Button>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      )}
    </MarketingShell>
  );
}
