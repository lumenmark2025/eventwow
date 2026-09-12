import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ShieldCheck, Clock } from "lucide-react";
import MarketingShell from "../../components/layout/MarketingShell";
import { PublicButton } from "../../components/marketing/PublicComponents";
import {
  PublicProfileHero,
  MediaGallery,
  ProfileLayout,
  ProfileSection,
  FeatureList,
  ReviewSummary,
  ReviewList,
  LocationSection,
  StickyEnquiryCard,
  ProfileState,
} from "../../components/marketing/PublicProfileComponents";
import {
  buildCanonicalUrl,
  useMarketingMeta,
  useStructuredData,
} from "../../lib/marketingMeta";
import { toPublicImageUrl } from "../../lib/publicImageUrl";
import { getFsaBadgeLabel, getFsaBadgePath } from "../../lib/fsaBadge";
import { usePublicProfile } from "../../lib/usePublicProfile";

function hasNumber(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}
function formatResponseHours(value) {
  if (!hasNumber(value)) return "No recent response data";
  const n = Number(value);
  return `~${n.toFixed(n < 10 ? 1 : 0)} hours`;
}
function formatAcceptanceRate(value) {
  return hasNumber(value)
    ? `${Math.round(Number(value) * 100)}%`
    : "No recent conversion data";
}
function formatLastActive(value) {
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleDateString()
    : "No recent activity";
}
export default function SupplierProfilePage() {
  const { slug } = useParams();
  const { data, loading, notFound, retry } = usePublicProfile("supplier", slug);
  const supplier = data?.supplier;
  const town =
    String(supplier?.locationLabel || "")
      .split(",")[0]
      ?.trim() || "";
  const primaryCategoryObj = Array.isArray(supplier?.categories)
    ? supplier.categories[0]
    : null;

  useMarketingMeta({
    title: supplier?.name
      ? `${supplier.name}${town ? ` (${town})` : ""} | Eventwow`
      : "Supplier profile | Eventwow",
    description: supplier?.shortDescription || "Supplier profile on Eventwow.",
    path: `/suppliers/${slug || ""}`,
    image: toPublicImageUrl(supplier?.heroImageUrl) || undefined,
  });

  const supplierSchema = useMemo(() => {
    if (!supplier?.name) return null;
    const imageUrl = toPublicImageUrl(supplier?.heroImageUrl);
    const address = {};
    if (town) address.addressLocality = town;
    address.addressCountry = "GB";
    return {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: supplier.name,
      url: buildCanonicalUrl(`/suppliers/${supplier.slug || slug || ""}`),
      description: supplier.shortDescription || supplier.about || undefined,
      image: imageUrl || undefined,
      areaServed: supplier.locationLabel || undefined,
      address,
    };
  }, [supplier, town, slug]);

  useStructuredData(supplierSchema, "supplier-profile-jsonld");

  const requestPath = `/suppliers/${encodeURIComponent(String(slug || supplier?.slug || ""))}/request-quote`;
  const isInsured = !!(supplier?.isInsured ?? supplier?.is_insured);
  const fsaRatingValue =
    supplier?.fsaRatingValue ?? supplier?.fsa_rating_value ?? null;
  const fsaRatingUrl =
    supplier?.fsaRatingUrl ?? supplier?.fsa_rating_url ?? null;
  const fsaBadgeSrc =
    supplier?.fsaRatingBadgeUrl ??
    supplier?.fsa_rating_badge_url ??
    getFsaBadgePath(fsaRatingValue);
  const fsaLabel = getFsaBadgeLabel(fsaRatingValue);
  const reviews = Array.isArray(supplier?.reviews) ? supplier.reviews : [];
  const services = Array.isArray(supplier?.services) ? supplier.services : [];
  const enquiry = supplier && (
    <StickyEnquiryCard
      title="Request a quote"
      description="Tell us your event details and receive a tailored quote from this supplier."
      to={requestPath}
      label="Request a quote"
    >
      {primaryCategoryObj?.slug && (
        <Link to={`/categories/${encodeURIComponent(primaryCategoryObj.slug)}`}>
          More {primaryCategoryObj.name}
        </Link>
      )}
      <Link to="/venues">Looking for a venue?</Link>
      <Link to="/suppliers">Back to suppliers</Link>
    </StickyEnquiryCard>
  );
  const fsaContent = (
    <>
      {fsaBadgeSrc && <img src={fsaBadgeSrc} alt={fsaLabel} loading="lazy" />}
      <span>{fsaLabel}</span>
    </>
  );
  return (
    <MarketingShell profile>
      {loading || !supplier ? (
        <ProfileState
          kind="Supplier"
          loading={loading}
          notFound={notFound}
          onRetry={retry}
        />
      ) : (
        <div className="public-profile">
          <nav className="public-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/suppliers">Suppliers</Link>
          </nav>
          <PublicProfileHero
            name={supplier.name}
            description={supplier.shortDescription}
            category={primaryCategoryObj?.name}
            location={supplier.locationLabel}
            action={
              <PublicButton as={Link} to={requestPath}>
                Request a quote
              </PublicButton>
            }
          >
            <ReviewSummary
              rating={supplier.reviewRating}
              count={supplier.reviewCount}
            />
            {hasNumber(supplier.performance?.typicalResponseHours) && (
              <span>
                <Clock size={18} aria-hidden="true" />
                Replies in{" "}
                {formatResponseHours(supplier.performance.typicalResponseHours)}
              </span>
            )}
            {isInsured && (
              <span className="public-profile-insured">
                <ShieldCheck size={18} aria-hidden="true" />
                Insured
              </span>
            )}
          </PublicProfileHero>
          <MediaGallery
            key={slug}
            name={supplier.name}
            hero={supplier.heroImageUrl}
            gallery={Array.isArray(supplier.gallery) ? supplier.gallery : []}
          />
          <ProfileLayout enquiry={enquiry}>
            <ProfileSection title={`About ${supplier.name}`}>
              <p className="public-profile-prose">
                {supplier.about ||
                  "This supplier has not added a detailed description yet."}
              </p>
            </ProfileSection>
            {services.length > 0 && (
              <ProfileSection title="Services">
                <FeatureList items={services} />
              </ProfileSection>
            )}
            <LocationSection location={supplier.locationLabel} />
            {fsaLabel && (
              <ProfileSection title="Food hygiene rating">
                {fsaRatingUrl ? (
                  <a
                    href={fsaRatingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="public-profile-fsa"
                  >
                    {fsaContent}
                  </a>
                ) : (
                  <div className="public-profile-fsa">{fsaContent}</div>
                )}
              </ProfileSection>
            )}
            <ProfileSection title="Reviews" id="reviews">
              <ReviewSummary
                rating={supplier.reviewRating}
                count={supplier.reviewCount}
              />
              <ReviewList reviews={reviews} totalCount={supplier.reviewCount} />
            </ProfileSection>
            <ProfileSection title="Performance">
              <details className="public-profile-performance">
                <summary>Recent activity on EventWow</summary>
                <dl>
                  <div>
                    <dt>Typical reply time</dt>
                    <dd>
                      {formatResponseHours(
                        supplier.performance?.typicalResponseHours,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Acceptance rate</dt>
                    <dd>
                      {formatAcceptanceRate(
                        supplier.performance?.acceptanceRate,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Last active</dt>
                    <dd>
                      {formatLastActive(supplier.performance?.lastActiveAt)}
                    </dd>
                  </div>
                </dl>
                {Array.isArray(supplier.performance?.badges) && (
                  <FeatureList items={supplier.performance.badges} />
                )}
                <p className="public-profile-muted">
                  Based on recent activity on Eventwow.
                </p>
              </details>
            </ProfileSection>
          </ProfileLayout>
        </div>
      )}
    </MarketingShell>
  );
}
