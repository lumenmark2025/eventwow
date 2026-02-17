import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import SupplierCard from "../../components/marketing/SupplierCard";
import { useMarketingMeta } from "../../lib/marketingMeta";

const testimonials = [
  { quote: "We got quality quotes in under a day and booked with confidence.", author: "Alicia, Manchester" },
  { quote: "The quote flow is clean and saves us hours of back-and-forth each week.", author: "The White Barn Venue" },
  { quote: "Better leads, less admin, more paid bookings.", author: "North West Events Co." },
];

export default function HomePage() {
  const [featuredCategories, setFeaturedCategories] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredSuppliers, setFeaturedSuppliers] = useState([]);
  const [featuredSuppliersLoading, setFeaturedSuppliersLoading] = useState(true);

  useMarketingMeta({
    title: "Book trusted event suppliers fast",
    description: "Find It. Book It. Wow Them. Eventwow helps customers and suppliers move faster.",
    path: "/",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setFeaturedLoading(true);
      try {
        const resp = await fetch("/api/public/categories");
        const json = await resp.json().catch(() => []);
        if (!resp.ok) throw new Error("Failed to load featured categories");
        if (!mounted) return;
        const rows = Array.isArray(json) ? json : [];
        setFeaturedCategories(rows);
      } catch {
        if (mounted) setFeaturedCategories([]);
      } finally {
        if (mounted) setFeaturedLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setFeaturedSuppliersLoading(true);
      try {
        const resp = await fetch("/api/public/featured-suppliers?limit=8");
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error("Failed to load featured suppliers");
        if (!mounted) return;
        setFeaturedSuppliers(Array.isArray(json?.suppliers) ? json.suppliers : []);
      } catch {
        if (mounted) setFeaturedSuppliers([]);
      } finally {
        if (mounted) setFeaturedSuppliersLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <MarketingShell>
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-teal-50 p-8 shadow-sm sm:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-teal-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="relative max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">Book trusted event suppliers faster.</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Find It. Book It. Wow Them.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button as={Link} to="/request" size="lg">Post an enquiry</Button>
            <Button as={Link} to="/venues" size="lg" variant="secondary">Browse venues</Button>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["1. Request", "Tell us what you need once. Date, budget, details."],
            ["2. Quotes", "Trusted suppliers send clear quotes with line items."],
            ["3. Choose", "Pick the best fit, accept, then confirm your booking."],
          ].map(([title, body]) => (
            <Card key={title}>
              <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600">{body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-3xl font-semibold tracking-tight">Popular categories</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {featuredLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={`featured-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))
          ) : (
            featuredCategories.map((cat) => (
              <Link
                key={cat.id || cat.slug}
                to={`/categories/${encodeURIComponent(cat.slug)}`}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <img
                  src={cat.hero_image_url || "/assets/placeholders/category-default.svg"}
                  alt={`${cat.display_name} suppliers`}
                  className="h-24 w-full object-cover"
                  loading="lazy"
                />
                <div className="p-4">
                  <p className="text-sm font-medium text-slate-900">{cat.display_name}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {cat.short_description || "Find vetted suppliers and compare structured quotes."}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">Featured suppliers</h2>
          <Button as={Link} to="/suppliers" variant="secondary" size="sm">Browse all</Button>
        </div>
        {featuredSuppliersLoading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`feat-supplier-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="mt-3 h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-12 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featuredSuppliers.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} showFsa={false} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Trusted by suppliers across the UK</h2>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.author}>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-700">"{t.quote}"</p>
                <p className="text-xs font-medium text-slate-500">{t.author}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-3xl border border-teal-200 bg-teal-50 p-8 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight">Win more bookings with less admin</h2>
        <p className="mt-2 text-sm text-slate-700">Quote quickly, manage customer responses, and keep your pipeline full.</p>
        <div className="mt-5">
          <Button as={Link} to="/suppliers/join" size="lg">List your business</Button>
        </div>
      </section>
    </MarketingShell>
  );
}

