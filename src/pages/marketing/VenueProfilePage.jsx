import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import MarketingShell from "../../components/layout/MarketingShell";
import { PublicButton } from "../../components/marketing/PublicComponents";
import {
  PublicProfileHero,
  MediaGallery,
  ProfileLayout,
  ProfileSection,
  FeatureList,
  LocationSection,
  StickyEnquiryCard,
  ProfileState,
} from "../../components/marketing/PublicProfileComponents";
import SupplierCard from "../../components/marketing/SupplierCard";
import {
  buildCanonicalUrl,
  useMarketingMeta,
  useStructuredData,
} from "../../lib/marketingMeta";
import { toPublicImageUrl } from "../../lib/publicImageUrl";
import {
  formatVenueGuestCapacity,
  getVenueConfidenceLabels,
} from "../../lib/venueDisplay";
import { usePublicProfile } from "../../lib/usePublicProfile";

export default function VenueProfilePage() {
  const { slug } = useParams();
  const { data, loading, notFound, retry } = usePublicProfile("venue", slug);
  const venue = data?.venue;
  const linkedSuppliers = Array.isArray(data?.linkedSuppliers)
    ? data.linkedSuppliers
    : [];
  const town =
    String(venue?.locationLabel || "")
      .split(",")[0]
      ?.trim() || "";

  useMarketingMeta({
    title: venue?.name
      ? `${venue.name}${town ? ` (${town})` : ""} | Eventwow`
      : "Venue profile | Eventwow",
    description: venue?.shortDescription || "Venue profile on Eventwow.",
    path: `/venues/${slug || ""}`,
    image: toPublicImageUrl(venue?.heroImageUrl) || undefined,
  });

  const venueSchema = useMemo(() => {
    if (!venue?.name) return null;
    const imageUrl = toPublicImageUrl(venue?.heroImageUrl);
    const address = {};
    if (town) address.addressLocality = town;
    address.addressCountry = "GB";
    return {
      "@context": "https://schema.org",
      "@type": "EventVenue",
      name: venue.name,
      url: buildCanonicalUrl(`/venues/${venue.slug || slug || ""}`),
      description: venue.shortDescription || venue.about || undefined,
      image: imageUrl || undefined,
      address,
    };
  }, [venue, town, slug]);

  useStructuredData(venueSchema, "venue-profile-jsonld");

  const range = formatVenueGuestCapacity(venue?.guestMin, venue?.guestMax);
  const labels = getVenueConfidenceLabels(venue, 2);
  const facilities = Array.isArray(venue?.facilities) ? venue.facilities : [];
  const requestPath = `/request?venue=${encodeURIComponent(String(venue?.slug || ""))}`;
  const enquiry = venue && (
    <StickyEnquiryCard
      title="Request quotes for this venue"
      description="Need catering, photography, music, or decor for this venue? Send one request and compare quotes."
      to={requestPath}
      label="Request quotes"
    >
      <Link to="/venues">Browse all venues</Link>
      <Link to="/categories">Explore event services</Link>
      <p>
        Manage this listing?{" "}
        <Link
          to={`/venues/${encodeURIComponent(String(venue.slug || ""))}/claim`}
        >
          Claim this venue
        </Link>
      </p>
      <Link to="/venues">Back to venues</Link>
    </StickyEnquiryCard>
  );
  return (
    <MarketingShell profile>
      {loading || !venue ? (
        <ProfileState
          kind="Venue"
          loading={loading}
          notFound={notFound}
          onRetry={retry}
        />
      ) : (
        <div className="public-profile">
          <nav className="public-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/venues">Venues</Link>
          </nav>
          <PublicProfileHero
            name={venue.name}
            description={venue.shortDescription}
            location={venue.locationLabel}
            category={venue.type}
            action={
              <PublicButton as={Link} to={requestPath}>
                Request quotes
              </PublicButton>
            }
          >
            {range && (
              <span>
                <Users size={18} aria-hidden="true" />
                {range}
              </span>
            )}
            {labels.map((label) => (
              <span key={label} className="public-profile-highlight">
                {label}
              </span>
            ))}
          </PublicProfileHero>
          <MediaGallery
            key={slug}
            name={venue.name}
            hero={venue.heroImageUrl}
            gallery={Array.isArray(venue.gallery) ? venue.gallery : []}
          />
          <ProfileLayout enquiry={enquiry}>
            <ProfileSection title={`About ${venue.name}`}>
              <p className="public-profile-prose">
                {venue.about ||
                  "This venue has not added a detailed description yet."}
              </p>
            </ProfileSection>
            {facilities.length > 0 && (
              <ProfileSection title="Facilities & features">
                <FeatureList items={facilities} />
              </ProfileSection>
            )}
            <LocationSection location={venue.locationLabel} />
            {linkedSuppliers.length > 0 && (
              <ProfileSection title="Suppliers who work well at this venue">
                <div className="public-profile-suppliers">
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
              </ProfileSection>
            )}
          </ProfileLayout>
        </div>
      )}
    </MarketingShell>
  );
}
