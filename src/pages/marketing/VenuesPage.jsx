import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function VenuesPage() {
  useMarketingMeta({
    title: "Venues directory",
    description: "Venue directory preview. Full launch coming soon.",
    path: "/venues",
  });

  return (
    <MarketingShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Venue directory coming soon</h1>
        <p className="mt-2 text-sm text-slate-600">Discover trusted venues with supplier-ready event packages.</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {["City Warehouse", "Riverside Barn", "The Glasshouse"].map((name) => (
          <Card key={name}>
            <CardHeader><CardTitle>{name}</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-600">Preview card for upcoming venue directory.</CardContent>
          </Card>
        ))}
      </section>
    </MarketingShell>
  );
}

