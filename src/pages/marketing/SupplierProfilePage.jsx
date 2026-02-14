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

function formatResponseHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "No recent response data";
  return `~${n.toFixed(n < 10 ? 1 : 0)} hours`;
}

function formatAcceptanceRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "No recent conversion data";
  return `${Math.round(n * 100)}%`;
}

function formatLastActive(value) {
  if (!value) return "No recent activity";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function Stars({ rating }) {
  const value = Number(rating);
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
  return (
    <div className="flex items-center gap-1" aria-label={`Rating ${safe.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }).map((_, idx) => {
        const filled = idx + 1 <= Math.round(safe);
        return (
          <svg key={`profile-star-${idx}`} viewBox="0 0 20 20" className={`h-4 w-4 ${filled ? "text-amber-500" : "text-slate-300"}`} fill="currentColor" aria-hidden="true">
            <path d="M10 1.8l2.45 4.96 5.47.8-3.96 3.86.94 5.45L10 14.28l-4.9 2.58.94-5.45L2.08 7.56l5.47-.8L10 1.8z" />
          </svg>
        );
      })}
    </div>
  );
}

export default function SupplierProfilePage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [showPerformance, setShowPerformance] = useState(false);

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
  const requestPath = `/suppliers/${encodeURIComponent(String(slug || supplier?.slug || ""))}/request-quote`;
  const reviewRating = Number(supplier?.reviewRating);
  const reviewCount = Number(supplier?.reviewCount || 0);
  const hasReviewSummary = Number.isFinite(reviewRating) && reviewCount > 0;
  const reviews = Array.isArray(supplier?.reviews) ? supplier.reviews : [];
  const replySignal = Number.isFinite(Number(supplier?.performance?.typicalResponseHours))
    ? `Replies in ${formatResponseHours(supplier.performance.typicalResponseHours)}`
    : null;
  const ratingSignal = hasReviewSummary ? `${reviewRating.toFixed(1)} (${reviewCount} review${reviewCount === 1 ? "" : "s"})` : null;
  const topSignals = [ratingSignal, replySignal].filter(Boolean);
  const primaryCategory = Array.isArray(supplier?.categories) && supplier.categories.length > 0 ? supplier.categories[0] : null;

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
                {primaryCategory ? <Badge variant="brand">{primaryCategory.name}</Badge> : null}
                {supplier.locationLabel ? <Badge variant="neutral">{supplier.locationLabel}</Badge> : null}
              </div>
              {topSignals.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  {ratingSignal ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Stars rating={reviewRating} />
                      <span>{ratingSignal}</span>
                    </span>
                  ) : null}
                  {ratingSignal && replySignal ? <span aria-hidden="true">•</span> : null}
                  {replySignal ? <span>{replySignal}</span> : null}
                </div>
              ) : null}
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
                  <CardTitle className="text-xl">Reviews</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {hasReviewSummary ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <Stars rating={reviewRating} />
                      <span className="font-semibold text-slate-900">{reviewRating.toFixed(1)}</span>
                      <span>({reviewCount} review{reviewCount === 1 ? "" : "s"})</span>
                    </div>
                  ) : null}
                  {reviews.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Be the first to review this supplier.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reviews.map((review, idx) => (
                        <div key={`${review.createdAt || idx}-${review.reviewerName || idx}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Stars rating={review.rating} />
                              <span className="text-sm font-medium text-slate-800">{Number(review.rating || 0).toFixed(1)}</span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ""}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{review.reviewText}</p>
                          <p className="mt-2 text-xs text-slate-500">- {review.reviewerName || "Anonymous"}</p>
                        </div>
                      ))}
                    </div>
                  )}
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-xl">Performance</CardTitle>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowPerformance((prev) => !prev)}
                      className="min-h-10"
                    >
                      {showPerformance ? "Hide performance" : "Show performance"}
                    </Button>
                  </div>
                </CardHeader>
                {showPerformance ? (
                  <CardContent className="space-y-2 pt-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span>Typical reply time</span>
                      <span className="font-medium">{formatResponseHours(supplier.performance?.typicalResponseHours)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span>Acceptance rate</span>
                      <span className="font-medium">{formatAcceptanceRate(supplier.performance?.acceptanceRate)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span>Last active</span>
                      <span className="font-medium">{formatLastActive(supplier.performance?.lastActiveAt)}</span>
                    </div>
                    {Array.isArray(supplier.performance?.badges) && supplier.performance.badges.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {supplier.performance.badges.map((badge) => (
                          <Badge key={`perf-detail-${badge}`} variant="neutral">{badge}</Badge>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-xs text-slate-500">Based on recent activity on Eventwow.</p>
                  </CardContent>
                ) : null}
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
                  <Button as={Link} to={requestPath} className="w-full">
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
