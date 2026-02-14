import { Link } from "react-router-dom";
import { Card, CardContent, CardFooter } from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";

function formatResponseHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `Replies in ~${n.toFixed(n < 10 ? 1 : 0)}h`;
}

function Stars({ rating }) {
  const value = Number(rating);
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating ${safe.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }).map((_, idx) => {
        const filled = idx + 1 <= Math.round(safe);
        return (
          <svg key={`star-${idx}`} viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${filled ? "text-amber-500" : "text-slate-300"}`} fill="currentColor" aria-hidden="true">
            <path d="M10 1.8l2.45 4.96 5.47.8-3.96 3.86.94 5.45L10 14.28l-4.9 2.58.94-5.45L2.08 7.56l5.47-.8L10 1.8z" />
          </svg>
        );
      })}
    </div>
  );
}

export default function SupplierCard({ supplier }) {
  const performance = supplier?.performance || {};
  const replySignal = formatResponseHours(performance.typicalResponseHours);
  const primaryCategory = Array.isArray(supplier?.categoryBadges) && supplier.categoryBadges.length > 0
    ? supplier.categoryBadges[0]
    : null;
  const reviewRating = Number(supplier?.reviewRating);
  const reviewCount = Number(supplier?.reviewCount || 0);
  const hasReviews = Number.isFinite(reviewRating) && reviewCount > 0;
  const meta = [
    replySignal,
    hasReviews ? `${reviewRating.toFixed(1)} (${reviewCount})` : null,
  ].filter(Boolean);

  return (
    <Card className="overflow-hidden rounded-2xl">
      {supplier.heroImageUrl ? (
        <img
          src={supplier.heroImageUrl}
          alt={`${supplier.name} cover`}
          className="h-32 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-32 bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50" />
      )}
      <CardContent className="space-y-3">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold tracking-tight text-slate-900">{supplier.name}</h3>
          {supplier.locationLabel ? <p className="mt-1 text-xs text-slate-500">{supplier.locationLabel}</p> : null}
        </div>
        {primaryCategory ? <Badge variant="neutral">{primaryCategory}</Badge> : null}
        {meta.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {replySignal ? <span>{replySignal}</span> : null}
            {replySignal && hasReviews ? <span aria-hidden="true">•</span> : null}
            {hasReviews ? (
              <span className="inline-flex items-center gap-1.5">
                <Stars rating={reviewRating} />
                <span>{reviewRating.toFixed(1)} ({reviewCount})</span>
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="line-clamp-3 text-sm text-slate-600">{supplier.shortDescription}</p>
      </CardContent>
      <CardFooter>
        <Button as={Link} to={`/suppliers/${supplier.slug}`} className="w-full">
          View profile
        </Button>
      </CardFooter>
    </Card>
  );
}
