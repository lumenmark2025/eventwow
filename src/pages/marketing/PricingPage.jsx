import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { useMarketingMeta } from "../../lib/marketingMeta";

const tiers = [
  { name: "Customers", price: "Free", note: "Post requests and compare quotes", bullets: ["Request quotes", "Compare structured offers", "Accept the best fit"] },
  { name: "Suppliers", price: "Credits-based", note: "Pay only when you send quotes", bullets: ["Receive matched enquiries", "Send line-item quotes", "Track response outcomes"] },
  { name: "Pro supplier", price: "Coming soon", note: "Growth features in roadmap", bullets: ["Advanced analytics", "Priority placements", "Team workflows"] },
];

export default function PricingPage() {
  useMarketingMeta({
    title: "Pricing",
    description: "Simple, transparent pricing for customers and event suppliers.",
    path: "/pricing",
  });

  return (
    <MarketingShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Simple pricing</h1>
        <p className="mt-2 text-sm text-slate-600">Eventwow is free for customers and fair for suppliers — no inflated fees, no high percentage commissions.</p>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.name}>
            <CardHeader>
              <CardTitle>{tier.name}</CardTitle>
              <div className="mt-1 text-2xl font-semibold">{tier.price}</div>
              <div className="mt-1 text-sm text-slate-500">{tier.note}</div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-700">
                {tier.bullets.map((bullet) => (
                  <li key={bullet}>- {bullet}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3"><Badge variant="neutral">FAQ</Badge></div>
        <div className="space-y-3 text-sm text-slate-700">
          <p><span className="font-medium">Do customers pay?</span> No, customers can request and compare quotes for free.</p>
          <p><span className="font-medium">How do supplier credits work?</span> Suppliers spend credits when sending quotes.</p>
          <p><span className="font-medium">Are there contracts?</span> Not for MVP plans shown here.</p>
        </div>
      </section>
    </MarketingShell>
  );
}
