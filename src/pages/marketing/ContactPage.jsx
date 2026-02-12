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
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Contact Eventwow</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>Questions about requests, supplier onboarding, or support? We can help.</p>
            <p>Email us at <a className="text-teal-700 underline" href="mailto:hello@eventwow.co.uk">hello@eventwow.co.uk</a></p>
            <div>
              <Button as="a" href="mailto:hello@eventwow.co.uk?subject=Eventwow%20Enquiry">Email support</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Support hours</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>Mon-Fri: 9:00-17:30</p>
            <p>Sat: 10:00-14:00</p>
            <p>Sun: Closed</p>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}

