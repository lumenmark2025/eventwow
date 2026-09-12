import { useState } from "react";
import MarketingHeader from "./MarketingHeader";
import MarketingFooter from "./MarketingFooter";
import {
  ProfileSection,
  MediaGallery,
  ProfileLayout,
  FeatureList,
  ReviewList,
  StickyEnquiryCard,
} from "./PublicProfileComponents";
import SupplierCard from "./SupplierCard";
import {
  PublicSectionHeader,
  PublicSearch,
  PublicSelect,
  PublicButton,
  PublicCallout,
  VenueCard,
  CategoryCard,
  EventSearchPanel,
  PublicResultsState,
} from "./PublicComponents";

// Deliberately synthetic, rendered only on the unlinked design-system reference.
export default function PublicDesignExample() {
  const [query, setQuery] = useState("");
  return (
    <section
      className="public-v2 public-design-example"
      aria-label="Public design system examples"
    >
      <MarketingHeader />
      <div id="public-main" className="public-main">
        <PublicSectionHeader
          title="Public marketplace patterns"
          description="Synthetic examples for design review only. No marketplace records or metrics."
        />
        <PublicSearch
          label="Example supplier search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <PublicSelect label="Example sort">
          <option>Recommended</option>
          <option>Newest</option>
        </PublicSelect>
        <div className="public-section">
          <PublicButton disabled>Disabled action</PublicButton>
        </div>
        <SupplierCard
          layout="list"
          supplier={{
            name: "Example event supplier",
            slug: "design-example",
            shortDescription:
              "Supplier list pattern: imagery, description, available signals and profile action.",
            categoryBadges: ["Example service"],
            locationLabel: "Example location",
          }}
        />
        <div className="public-section public-feature-grid">
          <VenueCard
            venue={{
              name: "Example venue",
              slug: "design-example",
              locationLabel: "Example location",
              guestMax: 100,
            }}
          />
          <CategoryCard
            category={{ name: "Example category", href: "/design-system" }}
          />
        </div>
        <EventSearchPanel
          searchPlan={query}
          searchLocation=""
          onPlanChange={(e) => setQuery(e.target.value)}
          onLocationChange={() => {}}
          onSubmit={(e) => e.preventDefault()}
        />
        <div className="public-section">
          <PublicResultsState empty kind="example results" />
        </div>
        <div className="public-section public-profile">
          <PublicSectionHeader
            title="Public profile pattern"
            description="Synthetic profile: shared photo gallery, plain sections and enquiry panel."
          />
          <MediaGallery
            name="Example profile"
            hero="/images/event-atmosphere-640.webp"
            gallery={[
              {
                url: "/images/event-atmosphere.webp",
                caption: "Example event photograph",
              },
            ]}
          />
          <ProfileLayout
            enquiry={
              <StickyEnquiryCard
                title="Example enquiry"
                description="Existing enquiry destination."
                to="/design-system"
                label="Example action"
              />
            }
          >
            <ProfileSection title="About the profile">
              <p className="public-profile-prose">
                Profile content uses existing published listing fields.
              </p>
            </ProfileSection>
            <ProfileSection title="Example features">
              <FeatureList items={["Example service", "Example facility"]} />
            </ProfileSection>
            <ProfileSection title="Example reviews">
              <ReviewList reviews={[]} />
            </ProfileSection>
          </ProfileLayout>
        </div>
        <PublicCallout />
      </div>
      <MarketingFooter />
    </section>
  );
}
