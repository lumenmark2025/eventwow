import { Link } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useMarketingMeta } from "../../lib/marketingMeta";

const categories = ["Pizza Catering", "Photographers", "DJs", "Venues", "Florists", "Bands", "Decor", "Cakes"];

export default function BrowsePage() {
  useMarketingMeta({
    title: "Browse suppliers",
    description: "Explore supplier categories and start your event request.",
    path: "/browse",
  });

  return (
    <MarketingShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Browse suppliers</h1>
        <p className="mt-2 text-sm text-slate-600">Directory experience is landing soon. Start by selecting a category.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Search suppliers, cuisine, style..." className="sm:max-w-md" />
          <Button variant="secondary">Filters</Button>
          <Button as={Link} to="/contact">Post a request</Button>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((cat) => (
          <Card key={cat}>
            <CardHeader><CardTitle className="text-lg">{cat}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">Find vetted suppliers and compare structured quotes.</p>
              <Button as={Link} to={`/browse?category=${encodeURIComponent(cat)}`} variant="secondary" className="w-full">View category</Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </MarketingShell>
  );
}

