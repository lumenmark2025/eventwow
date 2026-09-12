import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { useMarketingMeta, useStructuredData } from "../../lib/marketingMeta";
import { publicGet } from "../../lib/publicRequest";
import {
  PublicPageHeader,
  PublicSectionHeader,
  PublicResultsState,
  EventSearchPanel,
  PublicTrust,
  CategoryCard,
  VenueCard,
  PublicCallout,
} from "../../components/marketing/PublicComponents";

const TRUST_ITEMS = [
  "Free to use",
  "No commission markups",
  "Direct communication",
];

const FAQ_ITEMS = [
  {
    q: "Is Eventwow free to use?",
    a: "Yes. Posting an enquiry is completely free for customers.",
  },
  {
    q: "How do suppliers respond?",
    a: "Suppliers receive your enquiry and send personalised quotes directly through the platform.",
  },
  {
    q: "Am I obligated to book?",
    a: "No. You're free to compare quotes and decide what works best for you.",
  },
  {
    q: "How do suppliers pay to use Eventwow?",
    a: "Suppliers purchase credits to respond to enquiries — no large percentage commissions.",
  },
  {
    q: "What areas do you cover?",
    a: "Eventwow is expanding across the UK, with strong coverage in the North West and beyond.",
  },
  {
    q: "Can I contact suppliers directly?",
    a: "Yes. Once you receive a quote, you can communicate directly to finalise details.",
  },
];

function selectServiceTiles(rows) {
  const categories = Array.isArray(rows) ? rows : [];
  return categories.slice(0, 6).map((row, index) => ({
    key: row.id || row.slug || `category-${index}`,
    name: row.display_name || row.label || "Category",
    href: row.slug
      ? `/categories/${encodeURIComponent(row.slug)}`
      : "/categories",
    image: row.hero_image_url || "",
  }));
}

export default function HomePage() {
  const navigate = useNavigate();
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [venuesLoading, setVenuesLoading] = useState(true);
  const [venues, setVenues] = useState([]);
  const [categoriesError, setCategoriesError] = useState("");
  const [venuesError, setVenuesError] = useState("");
  const [categoriesRetry, setCategoriesRetry] = useState(0);
  const [venuesRetry, setVenuesRetry] = useState(0);
  const [searchPlan, setSearchPlan] = useState("");
  const [searchLocation, setSearchLocation] = useState("");

  useMarketingMeta({
    title: "Eventwow | Venues & event suppliers across the UK",
    description:
      "Eventwow connects you with venues and event professionals across the UK — free to post, easy to compare, built for confidence.",
    path: "/",
  });

  useStructuredData(
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Eventwow",
      url: "https://eventwow.co.uk",
      logo: "https://eventwow.co.uk/eventwow-social-card.jpg",
    },
    "home-org-jsonld",
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCategoriesLoading(true);
      setCategoriesError("");
      try {
        const json = await publicGet("/api/public/categories");
        if (!mounted) return;
        setCategories(Array.isArray(json) ? json : []);
      } catch (err) {
        if (mounted) {
          setCategories([]);
          setCategoriesError(err.message);
        }
      } finally {
        if (mounted) setCategoriesLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [categoriesRetry]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setVenuesLoading(true);
      setVenuesError("");
      try {
        const json = await publicGet(
          "/api/public-venues?limit=4&offset=0&sort=recommended",
        );
        if (!mounted) return;
        setVenues(Array.isArray(json?.rows) ? json.rows.slice(0, 4) : []);
      } catch (err) {
        if (mounted) {
          setVenues([]);
          setVenuesError(err.message);
        }
      } finally {
        if (mounted) setVenuesLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [venuesRetry]);

  const serviceTiles = useMemo(
    () => selectServiceTiles(categories),
    [categories],
  );

  function onSearchSubmit(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchPlan.trim()) params.set("q", searchPlan.trim());
    if (searchLocation.trim()) params.set("location", searchLocation.trim());
    navigate(`/suppliers${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <MarketingShell>
      <section className="public-hero">
        <div className="public-hero-shell">
          <div className="public-hero-copy">
            <span className="public-kicker">Plan something brilliant</span>
            <PublicPageHeader
              title="Everything you need for an unforgettable event"
              subtitle="Weddings, parties, corporate events and more. Find suppliers and venues, compare options and bring your vision to life."
            />
            <EventSearchPanel
              searchPlan={searchPlan}
              onPlanChange={(e) => setSearchPlan(e.target.value)}
              searchLocation={searchLocation}
              onLocationChange={(e) => setSearchLocation(e.target.value)}
              onSubmit={onSearchSubmit}
            />
            <PublicTrust items={TRUST_ITEMS} />
            <Link className="public-text-link" to="/request">
              Post an enquiry
            </Link>
          </div>
          <img
            className="public-hero-photo"
            src="/images/event-atmosphere.webp"
            srcSet="/images/event-atmosphere-640.webp 640w, /images/event-atmosphere.webp 1400w"
            sizes="(max-width: 1023px) 100vw, 50vw"
            alt="People celebrating at a live event"
            width="1400"
            height="934"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </section>
      <section className="public-section">
        <PublicSectionHeader
          title="Explore event services"
          description="Find the people who make your event happen."
          to="/categories"
          linkLabel="All categories"
        />
        <PublicResultsState
          loading={categoriesLoading}
          error={categoriesError}
          empty={!serviceTiles.length}
          kind="categories"
          onRetry={() => setCategoriesRetry((n) => n + 1)}
        >
          <div className="public-category-grid">
            {serviceTiles.map((tile, index) => (
              <CategoryCard key={tile.key} category={tile} index={index} />
            ))}
          </div>
        </PublicResultsState>
      </section>
      <section className="public-section">
        <PublicSectionHeader
          title="Discover venues"
          description="Find a space for your next celebration, meeting or gathering."
          to="/venues"
          linkLabel="View all venues"
        />
        <PublicResultsState
          loading={venuesLoading}
          error={venuesError}
          empty={!venues.length}
          kind="venues"
          onRetry={() => setVenuesRetry((n) => n + 1)}
        >
          <div className="public-feature-grid">
            {venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} compact />
            ))}
          </div>
        </PublicResultsState>
      </section>
      <section className="public-section">
        <PublicSectionHeader
          title="How EventWow works"
          to="/how-it-works"
          linkLabel="Find out more"
        />
        <div className="public-steps">
          <div>
            <h3>Post your enquiry</h3>
            <p>Tell us what you're planning and where it's happening.</p>
          </div>
          <div>
            <h3>Compare quotes</h3>
            <p>Receive personalised quotes from event suppliers.</p>
          </div>
          <div>
            <h3>Choose your suppliers</h3>
            <p>Find the right fit and finalise the details together.</p>
          </div>
        </div>
      </section>
      <PublicCallout
        title="Are you an event supplier?"
        description="Join EventWow and receive direct enquiries from customers planning events. No high commission percentages."
        to="/supplier/signup"
        label="Become a supplier"
      />
      <section className="public-section public-faq">
        <PublicSectionHeader title="Frequently asked questions" />
        {FAQ_ITEMS.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </section>
    </MarketingShell>
  );
}
