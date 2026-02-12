import { Link } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function SuppliersPage() {
  useMarketingMeta({
    title: "Suppliers directory",
    description: "Supplier directory preview. Full directory search is coming soon.",
    path: "/suppliers",
  });

  return (
    <MarketingShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Supplier directory coming soon</h1>
        <p className="mt-2 text-sm text-slate-600">We are preparing verified supplier profiles and category filters.</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader><CardTitle>Example Supplier {i}</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-600">Sample profile card layout for upcoming directory launch.</CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-10">
        <Button as={Link} to="/login" size="lg">Become a supplier</Button>
      </section>
    </MarketingShell>
  );
}

