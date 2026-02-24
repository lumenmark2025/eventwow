import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function ContactPage() {
  useMarketingMeta({
    title: "Contact",
    description: "Get in touch with Eventwow support and partnership team.",
    path: "/contact",
  });

  return (
    <MarketingShell>
      <section className="rounded-3xl bg-[radial-gradient(circle_at_top_left,#2563eb_0%,#1d4ed8_45%,#60a5fa_100%)] p-8 text-white shadow-lg sm:p-10">
        <h1 className="text-4xl font-semibold tracking-tight">Contact Eventwow</h1>
        <p className="mt-3 text-base text-white/90">Questions about requests, supplier onboarding, or support? We can help.</p>
      </section>
      <section className="mt-6">
        <Card className="rounded-3xl border-blue-100 shadow-sm">
          <CardHeader><CardTitle className="text-blue-900">Contact details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>Email us at <a className="text-blue-700 underline" href="mailto:hello@eventwow.co.uk">hello@eventwow.co.uk</a></p>
            <div>
              <Button as="a" href="mailto:hello@eventwow.co.uk?subject=Eventwow%20Enquiry">Email support</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
