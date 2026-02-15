import { Link } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { useMarketingMeta } from "../../lib/marketingMeta";

const categories = ["Pizza Catering", "Photographers", "DJs", "Venues", "Florists", "Celebrants", "Bands", "Decor"];

const testimonials = [
  { quote: "We got quality quotes in under a day and booked with confidence.", author: "Alicia, Manchester" },
  { quote: "The quote flow is clean and saves us hours of back-and-forth each week.", author: "The White Barn Venue" },
  { quote: "Better leads, less admin, more paid bookings.", author: "North West Events Co." },
];

export default function HomePage() {
  useMarketingMeta({
    title: "Book trusted event suppliers fast",
    description: "Find It. Book It. Wow Them. Eventwow helps customers and suppliers move faster.",
    path: "/",
  });

  return (
    <MarketingShell>
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-teal-50 p-8 shadow-sm sm:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-teal-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="brand">Local suppliers</Badge>
            <Badge variant="neutral">No spam</Badge>
            <Badge variant="success">Fast quotes</Badge>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">Book trusted event suppliers faster.</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Find It. Book It. Wow Them.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button as={Link} to="/request" size="lg">Post an enquiry</Button>
            <Button as={Link} to="/venues" size="lg" variant="secondary">Browse venues</Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-slate-600">
            <span>Free to enquire</span>
            <span className="text-slate-300">&middot;</span>
            <span>Compare quotes</span>
            <span className="text-slate-300">&middot;</span>
            <span>Trusted suppliers</span>
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
          {categories.map((cat) => (
            <Link key={cat} to={`/request?category=${encodeURIComponent(cat)}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow">
              {cat}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Trusted by suppliers across the North West</h2>
          <Badge variant="neutral">Social proof</Badge>
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
          <Button as={Link} to="/login" size="lg">List your business</Button>
        </div>
      </section>
    </MarketingShell>
  );
}

