import { Link } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useMarketingMeta } from "../../lib/marketingMeta";

const faqs = [
  { q: "How many suppliers receive my request?", a: "We match your request to relevant suppliers so you get quality options instead of noise." },
  { q: "Do I pay to request quotes?", a: "Customers can request and compare quotes for free." },
  { q: "How do suppliers get paid?", a: "You and your supplier agree final terms, and deposit/payment tools support the flow." },
];

export default function HowItWorksPage() {
  useMarketingMeta({
    title: "How it works",
    description: "See the customer and supplier journey from request to booking confirmation.",
    path: "/how-it-works",
  });

  return (
    <MarketingShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">How Eventwow works</h1>
        <p className="mt-2 text-sm text-slate-600">A cleaner path from request to confirmed booking.</p>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>For customers</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>1. Submit one request with your event details.</p>
            <p>2. Receive clear supplier quotes with totals and timing.</p>
            <p>3. Accept the best fit and confirm your booking.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>For suppliers</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>1. Get matched to relevant customer requests.</p>
            <p>2. Send structured quotes quickly with line items.</p>
            <p>3. Track accepted quotes and convert to bookings.</p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
        <div className="mt-4 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-3xl border border-teal-200 bg-teal-50 p-8 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight">Ready to get quotes?</h2>
        <p className="mt-2 text-sm text-slate-700">Start your request and compare suppliers quickly.</p>
        <div className="mt-4"><Button as={Link} to="/categories" size="lg">Get quotes</Button></div>
      </section>
    </MarketingShell>
  );
}
