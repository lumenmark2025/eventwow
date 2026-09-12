import { Link } from "react-router-dom";
import { Star, ShieldCheck } from "lucide-react";
import { getFsaBadgeLabel, getFsaBadgePath } from "../../lib/fsaBadge";
import { ListingImage, PublicButton } from "./PublicComponents";
export default function SupplierCard({
  supplier,
  showFsa = true,
  layout = "grid",
}) {
  const hours = supplier?.performance?.typicalResponseHours;
  // Missing measurements are not a zero-hour response claim.
  const replySignal =
    hours != null && hours !== "" && Number.isFinite(Number(hours))
      ? `Replies in ~${Number(hours).toFixed(Number(hours) < 10 ? 1 : 0)}h`
      : null;
  const primaryCategory = supplier?.categoryBadges?.[0];
  const rating = Number(supplier?.reviewRating),
    count = Number(supplier?.reviewCount || 0);
  const hasReviews =
    supplier?.reviewRating != null && Number.isFinite(rating) && count > 0;
  const insured = !!(supplier?.isInsured ?? supplier?.is_insured);
  const fsaValue = showFsa
    ? (supplier?.fsaRatingValue ?? supplier?.fsa_rating_value ?? null)
    : null;
  const fsaLabel = getFsaBadgeLabel(fsaValue);
  const fsaSrc =
    supplier?.fsaRatingBadgeUrl ??
    supplier?.fsa_rating_badge_url ??
    getFsaBadgePath(fsaValue);
  return (
    <article
      className={`public-card public-supplier-card ${layout === "list" ? "public-supplier-row" : ""}`}
    >
      <ListingImage
        src={supplier.heroImageUrl}
        name={supplier.name}
        sizes={
          layout === "list"
            ? "(max-width: 767px) calc(100vw - 32px), 185px"
            : undefined
        }
      />
      <div className="public-supplier-main">
        <h3>
          <Link to={`/suppliers/${supplier.slug}`}>{supplier.name}</Link>
        </h3>
        <p className="public-meta">
          {[primaryCategory, supplier.locationLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {supplier.shortDescription && (
          <p className="public-card-copy">{supplier.shortDescription}</p>
        )}
        <div className="public-supplier-signals">
          {insured && (
            <span className="public-confidence">
              <ShieldCheck size={16} aria-hidden="true" />
              Insured
            </span>
          )}
          {replySignal && <span>{replySignal}</span>}
          {fsaLabel && (
            <span>
              {fsaSrc && (
                <img
                  src={fsaSrc}
                  alt=""
                  width="70"
                  height="32"
                  loading="lazy"
                />
              )}
              {fsaLabel}
            </span>
          )}
        </div>
      </div>
      <div className="public-supplier-actions">
        {hasReviews && (
          <span className="public-rating">
            <Star size={16} aria-hidden="true" />
            <strong>{rating.toFixed(1)}</strong>
            <span>({count} reviews)</span>
          </span>
        )}
        <PublicButton as={Link} to={`/suppliers/${supplier.slug}`}>
          View profile
        </PublicButton>
      </div>
    </article>
  );
}
