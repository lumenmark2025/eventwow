import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import { useMarketingMeta, useStructuredData } from "../../lib/marketingMeta";
import { toPublicImageUrl } from "../../lib/publicImageUrl";
import { formatVenueGuestCapacity, getVenueConfidenceLabels } from "../../lib/venueDisplay";

const SERVICE_TILE_TINTS = [
  "from-blue-500 to-indigo-500",
  "from-rose-400 to-fuchsia-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-cyan-400 to-blue-500",
];

const TRUST_ITEMS = ["Free to use", "No commission markups", "Direct communication"];

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
    href: row.slug ? `/categories/${encodeURIComponent(row.slug)}` : "/categories",
    image: row.hero_image_url || "",
    tint: SERVICE_TILE_TINTS[index % SERVICE_TILE_TINTS.length],
  }));
}

export default function HomePage() {
  const navigate = useNavigate();
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [venuesLoading, setVenuesLoading] = useState(true);
  const [venues, setVenues] = useState([]);
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
    "home-org-jsonld"
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCategoriesLoading(true);
      try {
        const resp = await fetch("/api/public/categories");
        const json = await resp.json().catch(() => []);
        if (!resp.ok) throw new Error("Failed to load categories");
        if (!mounted) return;
        setCategories(Array.isArray(json) ? json : []);
      } catch {
        if (mounted) setCategories([]);
      } finally {
        if (mounted) setCategoriesLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setVenuesLoading(true);
      try {
        const resp = await fetch("/api/public-venues?limit=4&offset=0&sort=recommended");
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error("Failed to load venues");
        if (!mounted) return;
        setVenues(Array.isArray(json?.rows) ? json.rows.slice(0, 4) : []);
      } catch {
        if (mounted) setVenues([]);
      } finally {
        if (mounted) setVenuesLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const serviceTiles = useMemo(() => selectServiceTiles(categories), [categories]);

  function onSearchSubmit(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchPlan.trim()) params.set("q", searchPlan.trim());
    if (searchLocation.trim()) params.set("location", searchLocation.trim());
    navigate(`/suppliers${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <MarketingShell>
      <section className="relative -mx-4 overflow-hidden px-4 pb-16 pt-8 text-white sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#2563eb_0%,#1d4ed8_35%,#60a5fa_60%,#fbcfe8_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#f1f5f9] to-transparent" />

        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Plan your event.
            <br />
            Get trusted suppliers in minutes.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg text-white/90 sm:text-2xl">
            Eventwow connects you with venues and event professionals across the UK — free to post, easy to compare, built for confidence.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button as={Link} to="/request" size="lg" className="min-w-[220px] bg-blue-700 text-white hover:bg-blue-800">
              Post an enquiry
            </Button>
            <Button as={Link} to="/venues" size="lg" variant="secondary" className="min-w-[220px] border-white/60 bg-white/90 text-blue-900 hover:bg-white">
              Browse venues
            </Button>
          </div>

          <form
            onSubmit={onSearchSubmit}
            className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-2 rounded-2xl bg-white p-2 shadow-xl sm:grid-cols-[1.2fr_1fr_auto]"
          >
            <input
              value={searchPlan}
              onChange={(e) => setSearchPlan(e.target.value)}
              placeholder="What are you planning?"
              className="h-12 rounded-xl border border-slate-200 px-4 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-300"
            />
            <input
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              placeholder="Location"
              className="h-12 rounded-xl border border-slate-200 px-4 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="submit"
              className="h-12 rounded-xl bg-blue-700 px-8 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Search
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-white/95">
            {TRUST_ITEMS.map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-blue-700">?</span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-3xl bg-slate-100 pb-1">
        <h2 className="text-center text-4xl font-semibold tracking-tight text-blue-900">Explore Event Services</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {categoriesLoading
            ? Array.from({ length: 6 }).map((_, idx) => (
                <div key={`svc-sk-${idx}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <Skeleton className="h-28 w-full" />
                  <div className="p-4">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="mt-2 h-4 w-1/3" />
                  </div>
                </div>
              ))
            : serviceTiles.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
                  No featured categories are active. Enable featured categories in Admin to populate this section.
                </div>
              ) : serviceTiles.map((tile) => (
                <Link key={tile.key} to={tile.href} className="group flex h-full flex-col overflow-hidden rounded-2xl shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  {toPublicImageUrl(tile.image) ? (
                    <img src={toPublicImageUrl(tile.image)} alt={`${tile.name} services`} className="h-28 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className={`h-28 w-full bg-gradient-to-br ${tile.tint}`} />
                  )}
                  <div className={`flex min-h-[120px] flex-1 flex-col bg-gradient-to-r ${tile.tint} p-4 text-white`}>
                    <p className="line-clamp-2 min-h-[56px] text-2xl font-semibold leading-tight">{tile.name}</p>
                    <p className="mt-auto inline-flex items-center gap-1 text-base font-medium text-white/95">
                      Explore
                      <span aria-hidden="true">›</span>
                    </p>
                  </div>
                </Link>
              ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-center text-4xl font-semibold tracking-tight text-blue-900">Discover venues near you</h2>
        {venuesLoading ? (
          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`venue-sk-${idx}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Skeleton className="h-40 w-full" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {venues.map((venue) => {
              const hero = toPublicImageUrl(venue.heroImageUrl);
              const capacity = formatVenueGuestCapacity(venue.guestMin, venue.guestMax);
              const label = getVenueConfidenceLabels(venue, 1)[0] || "";
              return (
                <article key={venue.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {hero ? (
                    <img src={hero} alt={venue.name} className="h-40 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-40 w-full bg-gradient-to-br from-blue-100 to-indigo-100" />
                  )}
                  <div className="space-y-2 p-4">
                    <h3 className="line-clamp-1 text-xl font-semibold text-blue-900">
                      <Link to={`/venues/${venue.slug}`} className="hover:underline">
                        {venue.name}
                      </Link>
                    </h3>
                    <div className="flex min-h-[24px] items-center gap-3 text-sm font-medium text-slate-600">
                      {capacity ? <span>{capacity}</span> : null}
                      {label ? <span className="text-blue-700">{label}</span> : null}
                    </div>
                    <Button as={Link} to={`/venues/${venue.slug}`} variant="secondary" className="w-full">
                      View venue
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-12 text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-blue-900">How It Works</h2>
        <div className="mt-7 grid grid-cols-1 gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-left">
            <p className="text-sm font-semibold text-blue-700">Post your enquiry</p>
            <p className="mt-2 text-sm text-slate-600">Tell us what you're planning and where it's happening.</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-left">
            <p className="text-sm font-semibold text-blue-700">Compare quotes</p>
            <p className="mt-2 text-sm text-slate-600">Receive personalised quotes from trusted suppliers.</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-left">
            <p className="text-sm font-semibold text-blue-700">Book with confidence</p>
            <p className="mt-2 text-sm text-slate-600">Choose the right fit and plan your event with ease.</p>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-3xl bg-[radial-gradient(circle_at_top_right,#60a5fa_0%,#2563eb_40%,#1d4ed8_100%)] p-8 text-center text-white shadow-lg">
        <h2 className="text-4xl font-semibold tracking-tight">Are you an event supplier?</h2>
        <p className="mx-auto mt-3 max-w-3xl text-base text-white/90">
          Join Eventwow and receive direct enquiries from customers planning real events. No high commission percentages.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <Button as={Link} to="/supplier/signup" variant="secondary" className="border-white/45 bg-white/10 text-white hover:bg-white/20">
            Become a supplier
          </Button>
        </div>
      </section>

      <section className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-4xl font-semibold tracking-tight text-blue-900">Frequently Asked Questions</h2>
        <div className="mt-6 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">{item.q}</summary>
              <p className="mt-2 text-sm text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

